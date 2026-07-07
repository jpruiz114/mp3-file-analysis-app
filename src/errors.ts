export type ErrorCode =
  | 'NO_FILE_PROVIDED'
  | 'INVALID_MULTIPART'
  | 'FILE_TOO_LARGE'
  | 'UNPARSEABLE_MP3'
  | 'INTERNAL_ERROR';

export class AppError extends Error {
  readonly statusCode: number;
  readonly code: ErrorCode;

  constructor(code: ErrorCode, statusCode: number, message: string) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

export class NoFileProvidedError extends AppError {
  constructor() {
    super(
      'NO_FILE_PROVIDED',
      400,
      'No file was provided. Upload an MP3 file using the "file" form field.',
    );
  }
}

export class UnparseableMp3Error extends AppError {
  constructor() {
    super(
      'UNPARSEABLE_MP3',
      422,
      'The uploaded file could not be parsed as an MPEG-1 Audio Layer III (.mp3) file (no valid frames found).',
    );
  }
}
