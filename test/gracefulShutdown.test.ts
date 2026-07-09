import type { Server } from 'http';
import { registerGracefulShutdown } from '../src/gracefulShutdown';

function fakeServer(closeImpl: (cb: (err?: Error) => void) => void): Server {
  return { close: closeImpl } as unknown as Server;
}

describe('registerGracefulShutdown', () => {
  it('closes the server and exits 0 when close() succeeds', () => {
    const closeSpy = jest.fn((cb: (err?: Error) => void) => cb());
    const exitSpy = jest.fn();
    const logSpy = jest.fn();
    const server = fakeServer(closeSpy);

    const unregister = registerGracefulShutdown(server, { exit: exitSpy, log: logSpy });
    try {
      process.emit('SIGTERM', 'SIGTERM');

      expect(closeSpy).toHaveBeenCalledTimes(1);
      expect(exitSpy).toHaveBeenCalledWith(0);
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('SIGTERM'));
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Server closed'));
    } finally {
      unregister();
    }
  });

  it('exits 1 and logs the error when close() calls back with an error', () => {
    const closeSpy = jest.fn((cb: (err?: Error) => void) => cb(new Error('boom')));
    const exitSpy = jest.fn();
    const logSpy = jest.fn();
    const server = fakeServer(closeSpy);

    const unregister = registerGracefulShutdown(server, { exit: exitSpy, log: logSpy });
    try {
      process.emit('SIGINT', 'SIGINT');

      expect(exitSpy).toHaveBeenCalledWith(1);
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('boom'));
    } finally {
      unregister();
    }
  });

  it('ignores a second shutdown signal once a shutdown is already in progress', () => {
    const closeSpy = jest.fn((_cb: (err?: Error) => void) => {
      // never calls back -- simulates a hung close()
    });
    const exitSpy = jest.fn();
    const server = fakeServer(closeSpy);

    const unregister = registerGracefulShutdown(server, { exit: exitSpy, log: jest.fn(), forceExitMs: 100_000 });
    try {
      process.emit('SIGTERM', 'SIGTERM');
      process.emit('SIGTERM', 'SIGTERM');
      process.emit('SIGINT', 'SIGINT');

      expect(closeSpy).toHaveBeenCalledTimes(1);
    } finally {
      unregister();
    }
  });

  it('force-exits with code 1 if close() never calls back before forceExitMs', () => {
    jest.useFakeTimers();
    const closeSpy = jest.fn((_cb: (err?: Error) => void) => {
      // never calls back
    });
    const exitSpy = jest.fn();
    const logSpy = jest.fn();
    const server = fakeServer(closeSpy);

    const unregister = registerGracefulShutdown(server, { exit: exitSpy, log: logSpy, forceExitMs: 5000 });
    try {
      process.emit('SIGTERM', 'SIGTERM');
      jest.advanceTimersByTime(5000);

      expect(exitSpy).toHaveBeenCalledWith(1);
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('timed out'));
    } finally {
      unregister();
      jest.useRealTimers();
    }
  });

  it('clears the force-exit timer once close() succeeds so exit is only called once', () => {
    jest.useFakeTimers();
    const closeSpy = jest.fn((cb: (err?: Error) => void) => cb());
    const exitSpy = jest.fn();
    const server = fakeServer(closeSpy);

    const unregister = registerGracefulShutdown(server, { exit: exitSpy, log: jest.fn(), forceExitMs: 5000 });
    try {
      process.emit('SIGTERM', 'SIGTERM');
      jest.advanceTimersByTime(5000);

      expect(exitSpy).toHaveBeenCalledTimes(1);
      expect(exitSpy).toHaveBeenCalledWith(0);
    } finally {
      unregister();
      jest.useRealTimers();
    }
  });

  it('uses console.log and process.exit by default when not overridden', () => {
    const closeSpy = jest.fn((cb: (err?: Error) => void) => cb());
    const server = fakeServer(closeSpy);
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation((): never => undefined as never);

    const unregister = registerGracefulShutdown(server);
    try {
      process.emit('SIGTERM', 'SIGTERM');

      expect(logSpy).toHaveBeenCalled();
      expect(exitSpy).toHaveBeenCalledWith(0);
    } finally {
      unregister();
      logSpy.mockRestore();
      exitSpy.mockRestore();
    }
  });

  it('unregister() removes the signal listeners so a later signal is a no-op', () => {
    const closeSpy = jest.fn((cb: (err?: Error) => void) => cb());
    const exitSpy = jest.fn();
    const server = fakeServer(closeSpy);

    const unregister = registerGracefulShutdown(server, { exit: exitSpy, log: jest.fn() });
    unregister();
    process.emit('SIGTERM', 'SIGTERM');

    expect(closeSpy).not.toHaveBeenCalled();
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('registers listeners only for custom signals when provided', () => {
    const closeSpy = jest.fn((cb: (err?: Error) => void) => cb());
    const exitSpy = jest.fn();
    const server = fakeServer(closeSpy);

    const unregister = registerGracefulShutdown(server, {
      exit: exitSpy,
      log: jest.fn(),
      signals: ['SIGUSR2'],
    });
    try {
      process.emit('SIGTERM', 'SIGTERM'); // not registered -- must be a no-op
      expect(closeSpy).not.toHaveBeenCalled();

      process.emit('SIGUSR2', 'SIGUSR2');
      expect(closeSpy).toHaveBeenCalledTimes(1);
    } finally {
      unregister();
    }
  });
});
