import type { ErrorRequestHandler } from 'express';
import { MulterError, type ErrorCode as MulterErrorCode } from 'multer';
import { AppError } from '../errors';

const FILE_SIZE_MULTER_CODE: MulterErrorCode = 'LIMIT_FILE_SIZE';

/**
 * Single Express error-handling middleware: maps AppError subclasses,
 * MulterError (multipart/upload issues, including the size-limit case),
 * and anything else to the `{ error: { code, message } }` contract.
 */
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ error: { code: err.code, message: err.message } });
    return;
  }

  if (err instanceof MulterError) {
    if (err.code === FILE_SIZE_MULTER_CODE) {
      res.status(413).json({
        error: { code: 'FILE_TOO_LARGE', message: 'Uploaded file exceeds the maximum allowed size.' },
      });
      return;
    }
    res.status(400).json({ error: { code: 'INVALID_MULTIPART', message: err.message } });
    return;
  }

  console.error('Unhandled error while processing a file-upload request:', err);
  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred while processing the request.',
    },
  });
};
