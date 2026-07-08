import type { Request } from 'express';
import { PassThrough } from 'stream';
import { FrameCountingStorage } from '../../src/upload/frameCountingStorage';
import { FrameCounter } from '../../src/mp3/frameCounter';
import { UploadTimeoutError } from '../../src/errors';

describe('FrameCountingStorage._removeFile', () => {
  it('invokes the callback exactly once with no error (no-op, nothing is ever persisted)', () => {
    const storage = new FrameCountingStorage();
    const callback = jest.fn();

    storage._removeFile({} as Request, {} as Express.Multer.File, callback);

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(null);
  });
});

describe('FrameCountingStorage._handleFile', () => {
  it('forwards a counter.end() throw from the "end" handler to the callback', async () => {
    const endSpy = jest.spyOn(FrameCounter.prototype, 'end').mockImplementation(() => {
      throw new Error('simulated end() failure');
    });

    try {
      const storage = new FrameCountingStorage();
      const stream = new PassThrough();
      const callback = jest.fn();

      storage._handleFile({} as Request, { stream } as unknown as Express.Multer.File, callback);
      stream.end(); // triggers 'end' asynchronously -> counter.end() throws -> caught -> settle(error)
      await new Promise((resolve) => stream.on('close', resolve));

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(expect.any(Error), undefined);
    } finally {
      endSpy.mockRestore();
    }
  });

  it('invokes the callback only once even if settle is triggered a second time', () => {
    const writeSpy = jest.spyOn(FrameCounter.prototype, 'write').mockImplementation(() => {
      throw new Error('simulated write() failure');
    });

    try {
      const storage = new FrameCountingStorage();
      const stream = new PassThrough();
      const callback = jest.fn();

      storage._handleFile({} as Request, { stream } as unknown as Express.Multer.File, callback);
      stream.write(Buffer.from([0xff])); // 'data' -> write() throws -> destroy() + settle() (1st call)
      stream.emit('error', new Error('a second, unrelated stream error')); // settle() again -> must no-op

      expect(callback).toHaveBeenCalledTimes(1);
    } finally {
      writeSpy.mockRestore();
    }
  });

  it('aborts with UploadTimeoutError once the configured budget is exceeded, without parsing the chunk', () => {
    // budgetMs: -1 makes any elapsed time (even 0ms) immediately over budget -- deterministic,
    // no fake timers or real waiting needed.
    const writeSpy = jest.spyOn(FrameCounter.prototype, 'write');

    try {
      const storage = new FrameCountingStorage({ budgetMs: -1 });
      const stream = new PassThrough();
      const destroySpy = jest.spyOn(stream, 'destroy');
      const callback = jest.fn();

      storage._handleFile({} as Request, { stream } as unknown as Express.Multer.File, callback);
      stream.write(Buffer.from([0xff]));

      expect(destroySpy).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(expect.any(UploadTimeoutError), undefined);
      expect(writeSpy).not.toHaveBeenCalled(); // the over-budget chunk is never handed to the parser
    } finally {
      writeSpy.mockRestore();
    }
  });

  it('ignores a "data" chunk that arrives after the stream has already settled', () => {
    const writeSpy = jest.spyOn(FrameCounter.prototype, 'write');

    try {
      const storage = new FrameCountingStorage();
      const stream = new PassThrough();
      const callback = jest.fn();

      storage._handleFile({} as Request, { stream } as unknown as Express.Multer.File, callback);
      stream.emit('error', new Error('settles first')); // settle() called once here
      stream.emit('data', Buffer.from([0xff, 0xfb, 0x50, 0x00])); // arrives after settling -- must be a no-op

      expect(callback).toHaveBeenCalledTimes(1);
      expect(writeSpy).not.toHaveBeenCalled();
    } finally {
      writeSpy.mockRestore();
    }
  });

  it('does not trip the budget for a fast upload under the default/generous budget', () => {
    const storage = new FrameCountingStorage(); // default 5000ms budget
    const stream = new PassThrough();
    const callback = jest.fn();

    storage._handleFile({} as Request, { stream } as unknown as Express.Multer.File, callback);
    stream.write(Buffer.from([0xff, 0xfb, 0x50, 0x00]));

    expect(callback).not.toHaveBeenCalled(); // no error settled yet -- still well within budget
  });
});
