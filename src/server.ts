import { createApp } from './app';

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
const maxFileSizeBytes = process.env.MAX_UPLOAD_BYTES ? Number(process.env.MAX_UPLOAD_BYTES) : undefined;

const app = createApp({ maxFileSizeBytes });

app.listen(PORT, () => {
  console.log(`MP3 frame-counting API listening on port ${PORT}`);
});
