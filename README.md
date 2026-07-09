# MP3 Frame-Counting Upload API

[![CI](https://github.com/jpruiz114/mp3-file-analysis-app/actions/workflows/ci.yml/badge.svg)](https://github.com/jpruiz114/mp3-file-analysis-app/actions/workflows/ci.yml)

A TypeScript/Express service exposing `POST /file-upload`, which accepts an MP3 file
and returns the number of MPEG-1 Audio Layer III frames it contains.

The MP3 frame-parsing logic (ID3v2 tag skipping, frame header validation, VBR-tag
detection) is hand-written from the MPEG spec — no npm package is used to parse the
frame data itself, per the assignment's requirements. `express` and `multer` are used
only for HTTP/multipart plumbing.

## Setup

```bash
npm install
```

## Running the server

```bash
npm run dev     # ts-node/tsx dev server with reload
# or
npm run build && npm start   # compiled production build
```

The server listens on port `3000` by default (override with `PORT`). The maximum
upload size defaults to 200MB (override with `MAX_UPLOAD_BYTES`, in bytes). The
per-upload processing time budget defaults to 5 seconds (override with
`UPLOAD_TIME_BUDGET_MS`, in milliseconds) — see the error table below.

## Testing

```bash
npm test         # unit + integration tests (Jest + ts-jest + supertest)
npm run lint      # ESLint
npm run format    # Prettier
```

A copy of the provided sample file lives at `test/fixtures/sample.mp3` so the test
suite is self-contained and reproducible.

GitHub Actions (`.github/workflows/ci.yml`) runs lint, `tsc --noEmit`, and the test
suite with coverage on every push/PR to `main`. `jest.config.js` enforces a 100%
coverage threshold (statements/branches/functions/lines), so a coverage regression
fails CI, not just a local report.

### Manually testing the endpoint

With the server running:

```bash
curl -F "file=@test/fixtures/sample.mp3" http://localhost:3000/file-upload
# {"frameCount":6089}
```

Error responses share a consistent shape:

```json
{ "error": { "code": "UNPARSEABLE_MP3", "message": "..." } }
```

| Scenario                                   | Status | Code               |
| ------------------------------------------- | ------ | ------------------ |
| No file provided / not multipart            | 400    | `NO_FILE_PROVIDED`  |
| Malformed multipart request                 | 400    | `INVALID_MULTIPART` |
| Upload exceeds the configured size limit    | 413    | `FILE_TOO_LARGE`    |
| File isn't a parseable MPEG-1 Layer III file | 422    | `UNPARSEABLE_MP3`   |
| Upload's processing time exceeds the configured budget | 408 | `UPLOAD_TIMEOUT` |
| Unexpected server error                      | 500    | `INTERNAL_ERROR`    |

The processing time budget defaults to 5 seconds (override with
`UPLOAD_TIME_BUDGET_MS`, in milliseconds). This is a per-request **timeout**,
not throttling — it bounds how long any single upload is allowed to run, not
how many uploads a client can send. See "What I'd do with more time" below
for why request-volume throttling is a separate, still-open concern.

## How correctness was verified

The parser's frame-counting convention was cross-checked against `sample.mp3` during
planning (not just asserted): `ffprobe -count_frames` independently reports 6089
frames via its own demux, and the file's embedded Xing/LAME tag self-declares a frame
count of 6089 in its own bytes. `mediainfo --Full` (the tool suggested by the
assignment) also reports 6089 — though this was confirmed to simply echo the file's
own Xing-declared value rather than compute it independently (verified by patching a
copy of the Xing tag's declared count and observing `mediainfo`'s output change to
match while `ffprobe`'s independent count barely moved).

**Counting convention:** the Xing/Info/VBRI VBR-header tag frame — a metadata frame
LAME/Xing/Fraunhofer encoders insert as the first "frame" of a VBR file — is walked
past like any other frame (to keep frame-size/offset tracking correct) but is
**excluded** from `frameCount`, since that's the only convention consistent with all
of the fixture's independent ground truth above. A raw count of every valid-header
frame including this tag would report 6090 for this file.

The project's own test suite (`npm test`) asserts the exact value (6089) against the
real fixture, both as a single chunk and split into many small chunks and through a
real `fs.createReadStream`, so this isn't a one-off manual check.

**Additional manual verification against real-world files.** Beyond the committed
sample fixture, the running server was manually tested against two full-length,
independently-sourced MP3 files (not included in this repo) and cross-checked against
`ffprobe -count_frames` on each — both matched exactly, with no adjustment to the
parser or its convention:

| File | App's `frameCount` | `ffprobe -count_frames` |
| --- | ---: | ---: |
| Zachary Zamarippa – Truth In Part | 16870 | 16870 |
| Andy Gregory – Global Progression 058 | 134224 | 134224 |

This is a stronger signal than the single-fixture check alone: it confirms the
Xing-tag-exclusion convention and the frame-size/offset math generalize correctly to
files from different encoders/sources, not just the one sample provided with the
assignment.

## What I'd do with more time

- **Fuzz/property-based testing** of the frame-header and VBR-tag parsers against
  randomly generated byte sequences, to complement the hand-picked edge cases in the
  current suite.
- **"Free" bitrate support** (bitrate index `0000`) — legal per the MPEG spec but rare
  in practice and absent from the sample fixture; currently treated as an unsupported
  frame (skipped, not counted) rather than implemented.
- **Large-file benchmarking** — the design is O(1) memory by construction, but I
  haven't measured throughput against a multi-GB synthetic file to confirm there's no
  unexpected quadratic behavior hiding in the resync/carry-over logic.
- **Avoid the full-chunk copy on every `write()` call.** `FrameCounter.write()`
  currently does `Buffer.concat([carryOver, chunk])` whenever carry-over is pending
  (i.e., on almost every call once a file is mid-stream), copying the entire incoming
  chunk even though only a small stitched prefix (a few dozen bytes) is actually
  needed to resolve the in-flight header/tag check. This roughly doubles the bytes
  copied over a file's lifetime — a real but constant-factor cost, not a memory or
  correctness issue (peak memory stays O(1) either way). Fixing it means scanning a
  small stitched prefix first, then continuing to scan the original chunk buffer
  directly without a copy — meaningfully more bookkeeping in exactly the trickiest,
  most heavily-tested part of this codebase, so I left it as a documented tradeoff
  (see the comment on `FrameCounter.write()`) rather than risk it under time pressure.
- **Forward cross-validation** of frame sync matches (confirming a second sync exists
  at `offset + frameSize` before accepting a frame) — the current header-field
  validation already rejects the vast majority of false positives, and a dedicated
  test proves near-miss sync bytes don't produce a false count, so this felt like
  reasonable scope to defer rather than build speculatively.
- **CPU-exhaustion resistance for adversarial uploads.** A multi-agent review
  benchmarked this directly: a large upload made entirely of near-miss sync bytes
  (bytes that pass the cheap 11-bit sync check but fail deeper validation) costs
  meaningfully more CPU per byte than a real MP3, since every position still runs the
  full header-validation logic. Two mitigations are now in place. First, a free
  constant-factor win — `parseFrameHeader` returns shared singleton objects for
  rejections instead of allocating a fresh object per call, and only reads the header
  bytes it actually needs before the cheap checks run (verified ~2.6x faster on 20MB
  of worst-case input, with identical output). Second, a per-request wall-clock time
  budget (`UPLOAD_TIME_BUDGET_MS`, default 5 seconds) aborts any single upload whose
  processing runs longer than the budget, returning `408 UPLOAD_TIMEOUT` — this bounds
  the worst case regardless of how adversarial the input is or how a determined
  attacker slices it into TCP writes (many tiny chunks add per-chunk overhead, but can
  no longer buy unbounded processing time). What's still open: this is a per-request
  **timeout**, not throttling — it does nothing to stop a client from sending many
  uploads back-to-back or concurrently. Request-volume rate limiting (and, further
  out, offloading parsing to a worker thread so one slow upload can't starve others on
  the same event loop) would normally sit partly at a reverse-proxy/gateway layer. The
  assignment doesn't call out rate limiting either way; I judged it out of scope for
  this exercise's timeframe relative to getting the core parsing correct and
  well-tested, so I stopped here rather than building request-throttling
  infrastructure under time pressure.
- **Classify a couple more specific busboy/multer error shapes.** `errorHandler.ts`
  now explicitly maps busboy's "missing multipart boundary" error to `400
  INVALID_MULTIPART` (previously fell through to a misleading `500`) and stops
  treating a routine mid-upload client disconnect as an internal server error worth
  logging (previously logged a full stack trace and returned `500` for something the
  client caused, not the server). Both were caught by the code-review pass and fixed;
  there are likely a few more busboy/Node error shapes worth classifying explicitly
  with more time, rather than falling through to the generic 500 handler.

## Project structure

```text
src/
  server.ts               Entry point (parses env vars, starts listening)
  config.ts                PORT/MAX_UPLOAD_BYTES env var parsing + validation
  app.ts                   Express app factory
  errors.ts                Typed error hierarchy
  timeBudget.ts            Pure elapsed-time-vs-budget check (used by frameCountingStorage.ts)
  routes/fileUpload.ts      POST /file-upload route + Multer config
  upload/frameCountingStorage.ts   Custom Multer StorageEngine
  mp3/
    id3.ts                 ID3v2 tag skip-length calculation
    frameHeader.ts          MPEG-1 Layer III frame header parsing
    vbrTag.ts                Xing/Info/VBRI VBR-tag detection
    frameCounter.ts          Streaming, chunk-boundary-safe frame counter
  middleware/errorHandler.ts   Central error-to-JSON mapping
test/
  fixtures/sample.mp3      Committed copy of the provided sample
  support.ts                Shared synthetic-MP3-byte test helpers
  config.test.ts, support.test.ts, server.test.ts, timeBudget.test.ts
  mp3/                      Unit tests, one file per src/mp3/*.ts module
  routes/fileUpload.test.ts        HTTP-level integration tests (supertest)
  upload/frameCountingStorage.test.ts
docs/plans/                Implementation plan this was built from
.github/workflows/ci.yml   GitHub Actions: lint + typecheck + coverage-gated tests
```

Every file under `src/` is at 100% statement/branch/function/line coverage
(`npx jest --coverage`).
