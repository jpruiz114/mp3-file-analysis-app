import * as fs from 'fs';
import * as http from 'http';
import express from 'express';
import request from 'supertest';
import { createApp } from '../../src/app';
import { createFileUploadRouter } from '../../src/routes/fileUpload';
import { FrameCounter } from '../../src/mp3/frameCounter';
import { FrameCountingStorage } from '../../src/upload/frameCountingStorage';
import { errorHandler } from '../../src/middleware/errorHandler';
import { EXPECTED_FIXTURE_FRAME_COUNT, FIXTURE_PATH } from '../support';

describe('POST /file-upload', () => {
  it('returns 200 and the correct frame count for the real sample fixture', async () => {
    const app = createApp();

    const response = await request(app).post('/file-upload').attach('file', FIXTURE_PATH);

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/^application\/json/);
    expect(response.body).toEqual({ frameCount: EXPECTED_FIXTURE_FRAME_COUNT });
  });

  it('returns 400 NO_FILE_PROVIDED when no file field is present', async () => {
    const app = createApp();

    const response = await request(app).post('/file-upload');

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('NO_FILE_PROVIDED');
  });

  it('returns 400 when the file is uploaded under the wrong field name', async () => {
    const app = createApp();

    const response = await request(app).post('/file-upload').attach('wrongField', FIXTURE_PATH);

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_MULTIPART');
  });

  it('returns 400 INVALID_MULTIPART (not 500) when the multipart Content-Type is missing its boundary', async () => {
    const app = createApp();

    const response = await request(app)
      .post('/file-upload')
      .set('Content-Type', 'multipart/form-data') // no boundary= parameter
      .send('irrelevant body');

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_MULTIPART');
  });

  it('returns 400 when the request is not multipart/form-data', async () => {
    const app = createApp();

    const response = await request(app)
      .post('/file-upload')
      .set('Content-Type', 'application/json')
      .send({ not: 'a file' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('NO_FILE_PROVIDED');
  });

  it('returns 422 for a zero-byte file uploaded under the correct field', async () => {
    const app = createApp();

    const response = await request(app)
      .post('/file-upload')
      .attach('file', Buffer.alloc(0), 'empty.mp3');

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('UNPARSEABLE_MP3');
  });

  it('returns 400 when multiple files are uploaded under the same field', async () => {
    const app = createApp();

    const response = await request(app)
      .post('/file-upload')
      .attach('file', FIXTURE_PATH)
      .attach('file', FIXTURE_PATH);

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_MULTIPART');
  });

  it('returns 422 for a non-MP3 file with no crash and no false frame count', async () => {
    const app = createApp();
    const notAnMp3 = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), // PNG magic
      Buffer.alloc(500, 0x42),
    ]);

    const response = await request(app).post('/file-upload').attach('file', notAnMp3, 'fake.mp3');

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('UNPARSEABLE_MP3');
  });

  it('returns 413 when the uploaded file exceeds the configured size limit', async () => {
    const app = createApp({ maxFileSizeBytes: 100 });
    const oversized = fs.readFileSync(FIXTURE_PATH); // far larger than the 100-byte test limit

    const response = await request(app).post('/file-upload').attach('file', oversized, 'sample.mp3');

    expect(response.status).toBe(413);
    expect(response.body.error.code).toBe('FILE_TOO_LARGE');
    expect(response.body.error.message).not.toMatch(/at .*\(.*:\d+:\d+\)/); // no stack-trace-like content
  });

  it('returns 500 with a generic message when the counter throws internally', async () => {
    const writeSpy = jest.spyOn(FrameCounter.prototype, 'write').mockImplementation(() => {
      throw new Error('simulated internal parser failure');
    });

    try {
      const app = createApp();
      const response = await request(app).post('/file-upload').attach('file', FIXTURE_PATH);

      expect(response.status).toBe(500);
      expect(response.body.error.code).toBe('INTERNAL_ERROR');
      expect(response.body.error.message).not.toMatch(/simulated internal parser failure/);
    } finally {
      writeSpy.mockRestore();
    }
  });

  it('asserts Content-Type is application/json on a successful response', async () => {
    const app = createApp();

    const response = await request(app).post('/file-upload').attach('file', FIXTURE_PATH);

    expect(response.headers['content-type']).toBe('application/json; charset=utf-8');
  });

  it('does not crash the server when the client aborts mid-upload', async () => {
    const app = createApp();
    const server = app.listen(0);
    const address = server.address();
    if (address === null || typeof address === 'string') {
      throw new Error('expected server to be bound to a network port');
    }
    const port = address.port;

    await new Promise<void>((resolve) => {
      const req = http.request({
        host: '127.0.0.1',
        port,
        path: '/file-upload',
        method: 'POST',
        headers: { 'Content-Type': 'multipart/form-data; boundary=----abortboundary' },
      });
      req.on('error', () => resolve()); // destroying the socket surfaces as a client-side error here
      req.write(
        '------abortboundary\r\n' +
          'Content-Disposition: form-data; name="file"; filename="sample.mp3"\r\n' +
          'Content-Type: audio/mpeg\r\n\r\n',
      );
      req.write(Buffer.alloc(1000, 0)); // partial body — never sends the closing boundary
      setTimeout(() => {
        req.destroy();
        resolve();
      }, 50);
    });

    // Give the server a moment to finish reacting to the aborted connection.
    await new Promise((resolve) => setTimeout(resolve, 50));

    // The server must still be alive and able to serve a normal request afterward.
    const followUp = await request(server).post('/file-upload').attach('file', FIXTURE_PATH);
    expect(followUp.status).toBe(200);

    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('works when createFileUploadRouter() is called with no options (uses its own default)', async () => {
    const app = express();
    app.use(createFileUploadRouter()); // no argument -> exercises the function's own default parameter
    app.use(errorHandler);

    const response = await request(app).post('/file-upload').attach('file', FIXTURE_PATH);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ frameCount: EXPECTED_FIXTURE_FRAME_COUNT });
  });

  it('treats a missing frameCount on req.file as 0 (defensive fallback, not just a real zero count)', async () => {
    const handleFileSpy = jest
      .spyOn(FrameCountingStorage.prototype, '_handleFile')
      .mockImplementation((_req, file, callback) => {
        // Must still drain file.stream -- busboy won't finish parsing the rest of the
        // multipart body (and the request will hang) if nothing consumes it.
        file.stream.resume();
        file.stream.on('end', () => callback(undefined, {})); // no frameCount key at all
      });

    try {
      const app = createApp();
      const response = await request(app).post('/file-upload').attach('file', FIXTURE_PATH);

      expect(response.status).toBe(422);
      expect(response.body.error.code).toBe('UNPARSEABLE_MP3');
    } finally {
      handleFileSpy.mockRestore();
    }
  });
});
