import type { Request } from 'express';
import type { StorageEngine } from 'multer';
import { FrameCounter } from '../mp3/frameCounter';
import { UploadTimeoutError } from '../errors';
import { isOverBudget } from '../timeBudget';

// Augmenting Express's own namespace-based Multer.File type requires matching its
// declaration shape (`declare global { namespace Express { namespace Multer { ... } } }`);
// there is no ES2015-module equivalent for extending a third-party ambient namespace.
/* eslint-disable @typescript-eslint/no-namespace */
declare global {
  namespace Express {
    namespace Multer {
      interface File {
        /** Set by FrameCountingStorage once the upload stream has been fully counted. */
        frameCount?: number;
      }
    }
  }
}
/* eslint-enable @typescript-eslint/no-namespace */

type HandleFileCallback = (error?: unknown, info?: Partial<Express.Multer.File>) => void;

// Chosen with a generous margin over a real large file's legitimate processing time
// (comfortably sub-second even at the 200MB default upload cap on ordinary hardware),
// not scientifically calibrated against production traffic or concurrency -- see the
// README for why a real deployment would need to re-tune this against actual load.
const DEFAULT_BUDGET_MS = 5000;

export interface FrameCountingStorageOptions {
  /** Overrides the default 5-second per-upload processing time budget. */
  budgetMs?: number;
}

/**
 * A Multer StorageEngine that counts MPEG frames as the upload streams in,
 * instead of buffering the file to memory or disk. No bytes are persisted —
 * `_removeFile` is a no-op since there is nothing to clean up on abort.
 *
 * Multer's own core middleware already attaches `'error'`/`'limit'`
 * listeners to the upload stream before `_handleFile` runs, so this class
 * does not need to duplicate that detection (see the plan's Key Technical
 * Decisions for how that was verified). It does need to guard its own
 * per-chunk parsing: an uncaught throw from FrameCounter inside a stream
 * `'data'` handler would otherwise crash the whole process.
 *
 * It also enforces a wall-clock time budget per upload — measured from when
 * `_handleFile` starts, not just active CPU-busy time — so both an
 * adversarial file (content that's expensive to parse per byte) and a
 * slow-trickle connection (bytes arriving too slowly for too long) are
 * bounded the same way. This is a per-request timeout, not throttling: it
 * does not limit how many requests a client can make, only how long any one
 * of them is allowed to run.
 */
export class FrameCountingStorage implements StorageEngine {
  private readonly budgetMs: number;

  constructor(options: FrameCountingStorageOptions = {}) {
    this.budgetMs = options.budgetMs ?? DEFAULT_BUDGET_MS;
  }

  _handleFile(_req: Request, file: Express.Multer.File, callback: HandleFileCallback): void {
    const counter = new FrameCounter();
    const startedAt = Date.now();
    let settled = false;

    const settle: HandleFileCallback = (error, info) => {
      if (settled) return;
      settled = true;
      callback(error, info);
    };

    file.stream.on('data', (chunk: Buffer) => {
      if (settled) return;

      if (isOverBudget(Date.now() - startedAt, this.budgetMs)) {
        file.stream.destroy();
        settle(new UploadTimeoutError());
        return;
      }

      try {
        counter.write(chunk);
      } catch (error) {
        file.stream.destroy();
        settle(error);
      }
    });

    file.stream.on('error', (error) => {
      settle(error);
    });

    file.stream.on('end', () => {
      try {
        counter.end();
        settle(undefined, { frameCount: counter.count });
      } catch (error) {
        settle(error);
      }
    });
  }

  _removeFile(_req: Request, _file: Express.Multer.File, callback: (error: Error | null) => void): void {
    callback(null);
  }
}
