import { createApp } from './app';
import { parsePort, parseMaxUploadBytes, parseUploadTimeBudgetMs } from './config';
import { registerGracefulShutdown } from './gracefulShutdown';
import { DEFAULT_BUDGET_MS } from './upload/frameCountingStorage';

const PORT = parsePort(process.env.PORT);
const maxFileSizeBytes = parseMaxUploadBytes(process.env.MAX_UPLOAD_BYTES);
const budgetMs = parseUploadTimeBudgetMs(process.env.UPLOAD_TIME_BUDGET_MS);

export const app = createApp({ maxFileSizeBytes, budgetMs });

export const server = app.listen(PORT, () => {
  console.log(`MP3 frame-counting API listening on port ${PORT}`);
});

// Give an in-flight upload (already bounded by the time budget) a little
// headroom to finish draining before a shutdown signal forces the process to exit.
export const stopGracefulShutdown = registerGracefulShutdown(server, {
  forceExitMs: (budgetMs ?? DEFAULT_BUDGET_MS) + 2000,
});
