import type { ErrorRequestHandler, Response } from 'express';
import { MulterError, type ErrorCode as MulterErrorCode } from 'multer';
import { AppError, type ErrorCode } from '../errors';

const FILE_SIZE_MULTER_CODE: MulterErrorCode = 'LIMIT_FILE_SIZE';
// Exact strings thrown by busboy/multer for these two specific, known conditions —
// verified directly against node_modules/busboy/lib/types/multipart.js and
// node_modules/multer/lib/make-middleware.js.
const MISSING_BOUNDARY_MESSAGE = 'Multipart: Boundary not found';
const CLIENT_ABORTED_MESSAGE = 'Request aborted';

function sendError(res: Response, statusCode: number, code: ErrorCode, message: string): void {
  res.status(statusCode).json({ error: { code, message } });
}

/**
 * Single Express error-handling middleware: maps AppError subclasses,
 * MulterError (multipart/upload issues, including the size-limit case),
 * two specific non-Multer errors busboy/multer throw for known client-side
 * conditions (malformed multipart boundary, mid-upload client disconnect),
 * and anything else to the `{ error: { code, message } }` contract.
 */
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof AppError) {
    sendError(res, err.statusCode, err.code, err.message);
    return;
  }

  if (err instanceof MulterError) {
    if (err.code === FILE_SIZE_MULTER_CODE) {
      sendError(res, 413, 'FILE_TOO_LARGE', 'Uploaded file exceeds the maximum allowed size.');
      return;
    }
    sendError(res, 400, 'INVALID_MULTIPART', err.message);
    return;
  }

  // busboy throws a plain Error (not a MulterError) when the multipart
  // Content-Type header is missing its boundary parameter — a malformed
  // request from the client, not a server fault.
  if (err instanceof Error && err.message === MISSING_BOUNDARY_MESSAGE) {
    sendError(res, 400, 'INVALID_MULTIPART', 'Malformed multipart request: missing boundary parameter.');
    return;
  }

  // The client disconnected mid-upload. This is routine, not a server fault, and
  // the client is no longer there to receive a response — nothing useful to send
  // back and nothing worth alerting on as an internal error.
  if (err instanceof Error && err.message === CLIENT_ABORTED_MESSAGE) {
    return;
  }

  console.error('Unhandled error while processing a file-upload request:', err);
  sendError(res, 500, 'INTERNAL_ERROR', 'An unexpected error occurred while processing the request.');
};
