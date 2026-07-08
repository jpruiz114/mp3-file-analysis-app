import { createApp } from './app';

const DEFAULT_PORT = 3000;

function parsePort(raw: string | undefined): number {
  if (raw === undefined) return DEFAULT_PORT;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 65535) {
    throw new Error(`Invalid PORT env var: "${raw}" — must be an integer between 0 and 65535.`);
  }
  return parsed;
}

function parseMaxUploadBytes(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid MAX_UPLOAD_BYTES env var: "${raw}" — must be a positive number.`);
  }
  return parsed;
}

const PORT = parsePort(process.env.PORT);
const maxFileSizeBytes = parseMaxUploadBytes(process.env.MAX_UPLOAD_BYTES);

const app = createApp({ maxFileSizeBytes });

app.listen(PORT, () => {
  console.log(`MP3 frame-counting API listening on port ${PORT}`);
});
