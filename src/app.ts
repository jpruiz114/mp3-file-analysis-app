import express, { type Express } from 'express';
import { createFileUploadRouter, type FileUploadRouterOptions } from './routes/fileUpload';
import { errorHandler } from './middleware/errorHandler';

export function createApp(options: FileUploadRouterOptions = {}): Express {
  const app = express();
  app.use(createFileUploadRouter(options));
  app.use(errorHandler);
  return app;
}
