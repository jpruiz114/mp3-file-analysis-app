import { createApp } from './app';
import { parsePort, parseMaxUploadBytes, parseUploadTimeBudgetMs } from './config';

const PORT = parsePort(process.env.PORT);
const maxFileSizeBytes = parseMaxUploadBytes(process.env.MAX_UPLOAD_BYTES);
const budgetMs = parseUploadTimeBudgetMs(process.env.UPLOAD_TIME_BUDGET_MS);

export const app = createApp({ maxFileSizeBytes, budgetMs });

export const server = app.listen(PORT, () => {
  console.log(`MP3 frame-counting API listening on port ${PORT}`);
});
