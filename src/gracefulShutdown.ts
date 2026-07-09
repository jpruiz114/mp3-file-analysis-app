import type { Server } from 'http';

const DEFAULT_FORCE_EXIT_MS = 10_000;
const DEFAULT_SIGNALS: NodeJS.Signals[] = ['SIGTERM', 'SIGINT'];

export interface GracefulShutdownOptions {
  /** How long in-flight requests get to finish before forcing an exit. */
  forceExitMs?: number;
  signals?: NodeJS.Signals[];
  exit?: (code: number) => void;
  log?: (message: string) => void;
}

/**
 * Stops the server from accepting new connections on SIGTERM/SIGINT and gives
 * in-flight requests up to forceExitMs to finish before exiting. Returns an
 * unregister function so callers (mainly tests) can remove the signal
 * listeners instead of leaking them onto the shared `process` object.
 */
export function registerGracefulShutdown(server: Server, options: GracefulShutdownOptions = {}): () => void {
  const forceExitMs = options.forceExitMs ?? DEFAULT_FORCE_EXIT_MS;
  const signals = options.signals ?? DEFAULT_SIGNALS;
  const exit = options.exit ?? ((code: number) => process.exit(code));
  const log = options.log ?? ((message: string) => console.log(message));

  let shuttingDown = false;

  const shutdown = (signal: NodeJS.Signals): void => {
    if (shuttingDown) return;
    shuttingDown = true;

    log(`${signal} received: closing server, waiting up to ${forceExitMs}ms for in-flight requests...`);

    const forceExitTimer = setTimeout(() => {
      log('Graceful shutdown timed out; forcing exit.');
      exit(1);
    }, forceExitMs);
    forceExitTimer.unref();

    server.close((err) => {
      clearTimeout(forceExitTimer);
      if (err) {
        log(`Error while closing server: ${err.message}`);
        exit(1);
        return;
      }
      log('Server closed.');
      exit(0);
    });
  };

  for (const signal of signals) {
    process.on(signal, shutdown);
  }

  return () => {
    for (const signal of signals) {
      process.removeListener(signal, shutdown);
    }
  };
}
