import type { Request } from 'express';
import { PassThrough } from 'stream';
import { FrameCountingStorage } from '../../src/upload/frameCountingStorage';
import { FrameCounter } from '../../src/mp3/frameCounter';

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
});
