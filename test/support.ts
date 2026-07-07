import * as path from 'path';
import { parseFrameHeader } from '../src/mp3/frameHeader';

export const FIXTURE_PATH = path.join(__dirname, 'fixtures', 'sample.mp3');
export const EXPECTED_FIXTURE_FRAME_COUNT = 6089;

export interface BuildHeaderOptions {
  bitrateIndex: number;
  sampleRateIndex: number;
  padding?: boolean;
  protectionBit?: boolean; // true = no CRC (matches the field's real-world meaning)
  channelMode?: number;
  versionBits?: number;
  layerBits?: number;
}

/** Builds a synthetic 4-byte MPEG-1 Layer III frame header for test cases. */
export function buildHeader(opts: BuildHeaderOptions): Buffer {
  const {
    bitrateIndex,
    sampleRateIndex,
    padding = false,
    protectionBit = true,
    channelMode = 0,
    versionBits = 0b11,
    layerBits = 0b01,
  } = opts;

  const b1 = 0xe0 | (versionBits << 3) | (layerBits << 1) | (protectionBit ? 1 : 0);
  const b2 = (bitrateIndex << 4) | (sampleRateIndex << 2) | ((padding ? 1 : 0) << 1);
  const b3 = channelMode << 6;

  return Buffer.from([0xff, b1, b2, b3]);
}

/**
 * Builds one full, zero-payload MPEG-1 Layer III frame (header + zero-filled
 * body sized by the real `parseFrameHeader`, so the body size can never
 * silently drift from the production frame-size formula).
 */
export function buildFrame(opts: BuildHeaderOptions = { bitrateIndex: 5, sampleRateIndex: 0 }): Buffer {
  const headerBytes = buildHeader(opts);
  const parsed = parseFrameHeader(headerBytes, 0);
  if (parsed.kind !== 'valid') {
    throw new Error('buildFrame: constructed header bytes did not parse as a valid frame');
  }

  const buf = Buffer.alloc(parsed.frameSize, 0);
  headerBytes.copy(buf, 0);
  return buf;
}

/** Builds a synthetic ID3v2 header declaring the given tag size (synchsafe-encoded). */
export function buildId3Header(declaredSize: number): Buffer {
  const buf = Buffer.alloc(10, 0);
  buf.write('ID3', 0, 'ascii');
  buf.writeUInt8(4, 3); // version
  buf.writeUInt8(0, 4); // revision
  buf.writeUInt8(0, 5); // flags (no footer)
  buf.writeUInt8((declaredSize >> 21) & 0x7f, 6);
  buf.writeUInt8((declaredSize >> 14) & 0x7f, 7);
  buf.writeUInt8((declaredSize >> 7) & 0x7f, 8);
  buf.writeUInt8(declaredSize & 0x7f, 9);
  return buf;
}
