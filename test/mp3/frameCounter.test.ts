import * as fs from 'fs';
import { FrameCounter } from '../../src/mp3/frameCounter';
import { buildFrame, buildId3Header, EXPECTED_FIXTURE_FRAME_COUNT, FIXTURE_PATH } from '../support';

describe('FrameCounter', () => {
  it('counts exactly 6089 frames for the real sample fixture fed as a single chunk', () => {
    const counter = new FrameCounter();
    counter.write(fs.readFileSync(FIXTURE_PATH));
    counter.end();

    expect(counter.count).toBe(EXPECTED_FIXTURE_FRAME_COUNT);
  });

  it('produces the same count (6089) when the fixture is split into 1KB chunks', () => {
    const counter = new FrameCounter();
    const data = fs.readFileSync(FIXTURE_PATH);
    const CHUNK_SIZE = 1024;

    for (let i = 0; i < data.length; i += CHUNK_SIZE) {
      counter.write(data.subarray(i, i + CHUNK_SIZE));
    }
    counter.end();

    expect(counter.count).toBe(EXPECTED_FIXTURE_FRAME_COUNT);
  });

  it('produces the same count when driven by a real fs.createReadStream', (done) => {
    const counter = new FrameCounter();
    const stream = fs.createReadStream(FIXTURE_PATH);

    stream.on('data', (chunk) => counter.write(chunk as Buffer));
    stream.on('end', () => {
      counter.end();
      expect(counter.count).toBe(EXPECTED_FIXTURE_FRAME_COUNT);
      done();
    });
    stream.on('error', done);
  });

  it.each([1, 2, 3])(
    'still detects a frame whose header is split at byte offset %i across two chunks',
    (splitAt) => {
      const counter = new FrameCounter();
      counter.write(buildFrame()); // frame A, counted whole — establishes scan-frames state
      const frameB = buildFrame();

      counter.write(frameB.subarray(0, splitAt));
      counter.write(frameB.subarray(splitAt));
      counter.end();

      expect(counter.count).toBe(2);
    },
  );

  it('skips an ID3v2 tag split across the first two chunks', () => {
    const counter = new FrameCounter();
    const header = buildId3Header(34);
    const filler = Buffer.alloc(34, 0);
    const frame = buildFrame();

    counter.write(header); // exactly the 10-byte ID3v2 header, nothing more
    counter.write(Buffer.concat([filler, frame]));
    counter.end();

    expect(counter.count).toBe(1);
  });

  it('discards a large ID3v2 tag without buffering it (no unbounded memory growth)', () => {
    const counter = new FrameCounter();
    const declaredSize = 50_000; // well above the carry-over cap
    const header = buildId3Header(declaredSize);
    const filler = Buffer.alloc(declaredSize, 0);
    const frame = buildFrame();

    counter.write(header);
    expect(() => counter.write(Buffer.concat([filler, frame]))).not.toThrow();
    counter.end();

    expect(counter.count).toBe(1);
  });

  it('returns frame count 0 for a file containing only an ID3v2 tag and no audio data', () => {
    const counter = new FrameCounter();
    const header = buildId3Header(20);
    const filler = Buffer.alloc(20, 0);

    counter.write(Buffer.concat([header, filler]));
    counter.end();

    expect(counter.count).toBe(0);
  });

  it('does not throw or miscount on trailing non-frame bytes after the last valid frame', () => {
    const counter = new FrameCounter();
    const trailingJunk = Buffer.alloc(50, 0xaa); // mirrors the real fixture's trailing padding

    expect(() => {
      counter.write(Buffer.concat([buildFrame(), trailingJunk]));
      counter.end();
    }).not.toThrow();

    expect(counter.count).toBe(1);
  });

  it('does not produce a false-positive count on near-miss sync bytes that fail field validation', () => {
    const counter = new FrameCounter();
    // 0xFF 0xFF 0xFF 0x00: sync matches trivially, but layer bits (from 0xFF) decode to
    // Layer I, not Layer III — a classic "passes sync, fails validation" near miss.
    const nearMissA = Buffer.from([0xff, 0xff, 0xff, 0x00]);
    // 0xFF 0xFB 0xFF 0x00: correct version/layer, but bitrate index 1111 ("bad").
    const nearMissB = Buffer.from([0xff, 0xfb, 0xff, 0x00]);
    const filler = Buffer.alloc(20, 0x11);

    const buf = Buffer.concat([nearMissA, filler, nearMissB, filler]);

    expect(() => {
      counter.write(buf);
      counter.end();
    }).not.toThrow();
    expect(counter.count).toBe(0);
  });

  it('returns frame count 0 for non-MP3 binary content with no throw and no hang', () => {
    const counter = new FrameCounter();
    // PNG magic followed by deterministic non-sync filler bytes.
    const pngLike = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.alloc(1000, 0x42),
    ]);

    expect(() => {
      counter.write(pngLike);
      counter.end();
    }).not.toThrow();
    expect(counter.count).toBe(0);
  });
});
