import { CHANNEL_MODE_MONO, parseFrameHeader } from '../../src/mp3/frameHeader';
import { buildHeader } from '../support';

describe('parseFrameHeader', () => {
  it('parses the sample fixture bytes (FF FB 50 00) to the correct header fields', () => {
    const buf = Buffer.from([0xff, 0xfb, 0x50, 0x00]);

    const result = parseFrameHeader(buf, 0);

    expect(result).toEqual({
      kind: 'valid',
      hasCrc: false,
      channelMode: 0,
      padding: false,
      bitrateKbps: 64,
      sampleRateHz: 44100,
      frameSize: 208, // floor(144 * 64000 / 44100) + 0
    });
  });

  it('changes frameSize by exactly 1 byte when the padding bit is set', () => {
    const unpadded = buildHeader({ bitrateIndex: 5, sampleRateIndex: 0, padding: false });
    const padded = buildHeader({ bitrateIndex: 5, sampleRateIndex: 0, padding: true });

    const unpaddedResult = parseFrameHeader(unpadded, 0);
    const paddedResult = parseFrameHeader(padded, 0);

    expect(unpaddedResult.kind).toBe('valid');
    expect(paddedResult.kind).toBe('valid');
    if (unpaddedResult.kind === 'valid' && paddedResult.kind === 'valid') {
      expect(paddedResult.frameSize).toBe(unpaddedResult.frameSize + 1);
    }
  });

  it('rejects bitrate index 0000 (free)', () => {
    const buf = buildHeader({ bitrateIndex: 0b0000, sampleRateIndex: 0 });

    expect(parseFrameHeader(buf, 0)).toEqual({ kind: 'not-a-frame' });
  });

  it('rejects bitrate index 1111 (bad)', () => {
    const buf = buildHeader({ bitrateIndex: 0b1111, sampleRateIndex: 0 });

    expect(parseFrameHeader(buf, 0)).toEqual({ kind: 'not-a-frame' });
  });

  it('rejects sample-rate index 11 (reserved)', () => {
    const buf = buildHeader({ bitrateIndex: 5, sampleRateIndex: 0b11 });

    expect(parseFrameHeader(buf, 0)).toEqual({ kind: 'not-a-frame' });
  });

  it('rejects MPEG version bits that are not MPEG-1 (e.g. MPEG-2)', () => {
    const buf = buildHeader({ bitrateIndex: 5, sampleRateIndex: 0, versionBits: 0b10 });

    expect(parseFrameHeader(buf, 0)).toEqual({ kind: 'not-a-frame' });
  });

  it('rejects layer bits that are not Layer III (e.g. Layer II)', () => {
    const buf = buildHeader({ bitrateIndex: 5, sampleRateIndex: 0, layerBits: 0b10 });

    expect(parseFrameHeader(buf, 0)).toEqual({ kind: 'not-a-frame' });
  });

  it('reports hasCrc: true when the protection bit indicates CRC is present', () => {
    const buf = buildHeader({ bitrateIndex: 5, sampleRateIndex: 0, protectionBit: false });

    const result = parseFrameHeader(buf, 0);

    expect(result.kind).toBe('valid');
    if (result.kind === 'valid') {
      expect(result.hasCrc).toBe(true);
    }
  });

  it('reports the mono channel mode constant correctly', () => {
    const buf = buildHeader({ bitrateIndex: 5, sampleRateIndex: 0, channelMode: CHANNEL_MODE_MONO });

    const result = parseFrameHeader(buf, 0);

    expect(result.kind).toBe('valid');
    if (result.kind === 'valid') {
      expect(result.channelMode).toBe(CHANNEL_MODE_MONO);
    }
  });

  it('returns "not-a-frame" when the sync bits do not match', () => {
    const buf = Buffer.from([0x00, 0x00, 0x00, 0x00]);

    expect(parseFrameHeader(buf, 0)).toEqual({ kind: 'not-a-frame' });
  });

  it('returns "insufficient-data" for a window shorter than 4 bytes', () => {
    const buf = Buffer.from([0xff, 0xfb]);

    expect(parseFrameHeader(buf, 0)).toEqual({ kind: 'insufficient-data' });
  });

  it('parses correctly at a non-zero offset into a larger buffer', () => {
    const buf = Buffer.concat([Buffer.from([0x00, 0x00]), Buffer.from([0xff, 0xfb, 0x50, 0x00])]);

    expect(parseFrameHeader(buf, 2)).toEqual({
      kind: 'valid',
      hasCrc: false,
      channelMode: 0,
      padding: false,
      bitrateKbps: 64,
      sampleRateHz: 44100,
      frameSize: 208,
    });
  });
});
