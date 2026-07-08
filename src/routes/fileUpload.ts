import { Router } from 'express';
import multer from 'multer';
import { FrameCountingStorage } from '../upload/frameCountingStorage';
import { NoFileProvidedError, UnparseableMp3Error } from '../errors';

const DEFAULT_MAX_FILE_SIZE_BYTES = 200 * 1024 * 1024;

export interface FileUploadRouterOptions {
  /** Overrides the default 200MB upload cap — mainly for tests. */
  maxFileSizeBytes?: number;
  /** Overrides the default 5-second per-upload processing time budget — mainly for tests. */
  budgetMs?: number;
}

export function createFileUploadRouter(options: FileUploadRouterOptions = {}): Router {
  const maxFileSizeBytes = options.maxFileSizeBytes ?? DEFAULT_MAX_FILE_SIZE_BYTES;

  const upload = multer({
    storage: new FrameCountingStorage({ budgetMs: options.budgetMs }),
    limits: {
      fileSize: maxFileSizeBytes,
      files: 1,
      fields: 0,
      parts: 2,
    },
  });

  const router = Router();

  router.post('/file-upload', upload.single('file'), (req, res, next) => {
    if (!req.file) {
      next(new NoFileProvidedError());
      return;
    }

    const frameCount = req.file.frameCount ?? 0;
    if (frameCount === 0) {
      next(new UnparseableMp3Error());
      return;
    }

    res.json({ frameCount });
  });

  return router;
}
