import type { Request } from 'express';
import { FrameCountingStorage } from '../../src/upload/frameCountingStorage';

describe('FrameCountingStorage._removeFile', () => {
  it('invokes the callback exactly once with no error (no-op, nothing is ever persisted)', () => {
    const storage = new FrameCountingStorage();
    const callback = jest.fn();

    storage._removeFile({} as Request, {} as Express.Multer.File, callback);

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(null);
  });
});
