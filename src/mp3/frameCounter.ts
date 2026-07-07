import { getId3v2SkipLength } from './id3';
import { parseFrameHeader } from './frameHeader';
import { detectVbrTag } from './vbrTag';

// Headroom above the true worst-case single-frame size (1441 bytes, from
// 320 kbps @ 32 kHz — the highest-bitrate/lowest-sample-rate MPEG-1 Layer III
// combination) so a header or VBR-tag-check window split across chunks
// always fits. This is also the ceiling `setCarryOver` enforces defensively;
// the scanning algorithm itself never legitimately needs more than a few
// dozen bytes of carry-over (see the class doc comment below).
const MAX_CARRY_OVER_BYTES = 3000;

type State = 'skip-id3' | 'scan-frames' | 'done';

/**
 * Consumes a streamed MP3 file as a sequence of Buffer chunks and counts its
 * MPEG-1 Audio Layer III frames incrementally, in O(1) memory relative to
 * file size. Skips a leading ID3v2 tag (of any size) without buffering it,
 * and excludes a Xing/Info/VBRI VBR-header tag frame (if present as the
 * first audio frame) from the count while still advancing past it.
 *
 * Memory stays bounded because the only bytes ever held across `write`
 * calls are: (a) up to a few dozen bytes while waiting for enough data to
 * validate a frame header or VBR tag, or (b) a `pendingFrameSkip` counter
 * (not bytes) while waiting for a large frame body or ID3v2 tag to finish
 * arriving. Neither grows with input size or adversarial content — a
 * non-MP3 stream just advances the scan one byte at a time without ever
 * accumulating a large carry-over.
 */
export class FrameCounter {
  private state: State = 'skip-id3';
  private carryOver: Buffer = Buffer.alloc(0);
  /** -1 until the ID3v2 header itself has been read and the true skip length is known. */
  private remainingId3Skip = -1;
  /** Bytes of an already-counted (or tag) frame's body not yet received. */
  private pendingFrameSkip = 0;
  private hasSeenFirstAudioFrame = false;
  private frameCount = 0;

  /** Feed the next chunk of the file as it arrives. */
  write(chunk: Buffer): void {
    if (this.state === 'done') return;

    let buf = this.carryOver.length > 0 ? Buffer.concat([this.carryOver, chunk]) : chunk;
    this.carryOver = Buffer.alloc(0);

    if (this.state === 'skip-id3') {
      const rest = this.consumeId3(buf);
      if (rest === undefined) return; // still inside (or waiting to identify) the ID3v2 tag
      buf = rest;
      this.state = 'scan-frames';
    }

    if (this.pendingFrameSkip > 0) {
      if (this.pendingFrameSkip >= buf.length) {
        this.pendingFrameSkip -= buf.length;
        return; // still inside a prior frame's body
      }
      buf = buf.subarray(this.pendingFrameSkip);
      this.pendingFrameSkip = 0;
    }

    this.scanFrames(buf);
  }

  /** Call once the underlying stream has ended. No-op beyond marking state done. */
  end(): void {
    this.state = 'done';
  }

  get count(): number {
    return this.frameCount;
  }

  private consumeId3(buf: Buffer): Buffer | undefined {
    if (this.remainingId3Skip === -1) {
      if (buf.length < 10) {
        this.setCarryOver(buf);
        return undefined;
      }
      this.remainingId3Skip = getId3v2SkipLength(buf);
    }

    if (this.remainingId3Skip <= buf.length) {
      const rest = buf.subarray(this.remainingId3Skip);
      this.remainingId3Skip = 0;
      return rest;
    }

    // The whole chunk is still inside the ID3v2 tag — discard it without buffering.
    this.remainingId3Skip -= buf.length;
    return undefined;
  }

  private scanFrames(buf: Buffer): void {
    let offset = 0;

    while (offset < buf.length) {
      const header = parseFrameHeader(buf, offset);

      if (header.kind === 'insufficient-data') {
        this.setCarryOver(buf.subarray(offset));
        return;
      }

      if (header.kind === 'not-a-frame') {
        offset += 1;
        continue;
      }

      // header.kind === 'valid'
      let isTagFrame = false;
      if (!this.hasSeenFirstAudioFrame) {
        const tagResult = detectVbrTag(buf, offset, header);
        if (tagResult.kind === 'insufficient-data') {
          this.setCarryOver(buf.subarray(offset));
          return;
        }
        this.hasSeenFirstAudioFrame = true;
        isTagFrame = tagResult.kind === 'tag-found';
      }

      if (!isTagFrame) {
        this.frameCount += 1;
      }

      const nextOffset = offset + header.frameSize;
      if (nextOffset > buf.length) {
        this.pendingFrameSkip = nextOffset - buf.length;
        return;
      }
      offset = nextOffset;
    }
  }

  private setCarryOver(buf: Buffer): void {
    if (buf.length > MAX_CARRY_OVER_BYTES) {
      throw new Error(
        `FrameCounter carry-over exceeded ${MAX_CARRY_OVER_BYTES} bytes (${buf.length}) — refusing to buffer further.`,
      );
    }
    this.carryOver = buf;
  }
}
