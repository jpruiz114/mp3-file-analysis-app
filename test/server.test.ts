import type { Server } from 'http';

// server.ts starts listening as a side effect of being imported, so each test needs a
// fresh module evaluation with its own env vars, and must close whatever server it
// started to avoid leaking an open handle between tests. jest.resetModules() (not
// jest.isolateModules, and not manually deleting require.cache -- Jest keeps its own
// module registry separate from Node's native one) clears Jest's registry without
// wrapping a callback, so async continuations like app.listen()'s callback keep
// running normally afterward instead of executing inside an already-torn-down sandbox.
function requireFreshServerModule(): { app: unknown; server: Server; stopGracefulShutdown: () => void } {
  jest.resetModules();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('../src/server');
}

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('server.ts entry point', () => {
  it('starts listening on an ephemeral port, logs the startup message, and exports app/server', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    delete process.env.PORT;
    delete process.env.MAX_UPLOAD_BYTES;
    process.env.PORT = '0'; // ephemeral port -- avoids colliding with a real dev server

    const mod = requireFreshServerModule();
    expect(mod.app).toBeDefined();

    try {
      // server.listening flips to true synchronously as soon as .listen() is called --
      // well before the 'listening' event fires or the callback (which logs the startup
      // message) runs. Always wait for the real event; never shortcut on .listening.
      await new Promise<void>((resolve) => mod.server.once('listening', () => resolve()));

      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('listening on port'));
    } finally {
      logSpy.mockRestore();
      mod.stopGracefulShutdown();
      await new Promise<void>((resolve) => mod.server.close(() => resolve()));
    }
  });

  it('applies a valid MAX_UPLOAD_BYTES env var without throwing', async () => {
    process.env.PORT = '0';
    process.env.MAX_UPLOAD_BYTES = '1000000';

    const mod = requireFreshServerModule();

    try {
      await new Promise<void>((resolve) => mod.server.once('listening', () => resolve()));
    } finally {
      mod.stopGracefulShutdown();
      await new Promise<void>((resolve) => mod.server.close(() => resolve()));
    }
  });

  it('registers SIGTERM/SIGINT graceful-shutdown listeners, removed by stopGracefulShutdown', async () => {
    process.env.PORT = '0';
    const sigtermBefore = process.listenerCount('SIGTERM');
    const sigintBefore = process.listenerCount('SIGINT');

    const mod = requireFreshServerModule();

    try {
      await new Promise<void>((resolve) => mod.server.once('listening', () => resolve()));

      expect(process.listenerCount('SIGTERM')).toBe(sigtermBefore + 1);
      expect(process.listenerCount('SIGINT')).toBe(sigintBefore + 1);
    } finally {
      mod.stopGracefulShutdown();
      await new Promise<void>((resolve) => mod.server.close(() => resolve()));
    }

    expect(process.listenerCount('SIGTERM')).toBe(sigtermBefore);
    expect(process.listenerCount('SIGINT')).toBe(sigintBefore);
  });

  it('throws at import time for an invalid PORT env var', () => {
    process.env.PORT = 'notanumber';

    expect(() => requireFreshServerModule()).toThrow(/Invalid PORT/);
  });

  it('throws at import time for an invalid MAX_UPLOAD_BYTES env var', () => {
    process.env.PORT = '0';
    process.env.MAX_UPLOAD_BYTES = 'notanumber';

    expect(() => requireFreshServerModule()).toThrow(/Invalid MAX_UPLOAD_BYTES/);
  });
});
