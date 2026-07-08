import { CHANNEL_MODE_MONO, type ValidHeader } from '../../src/mp3/frameHeader';
import { detectVbrTag } from '../../src/mp3/vbrTag';

const STEREO_SIDE_INFO_BYTES = 32;
const MONO_SIDE_INFO_BYTES = 17;

function makeHeader(overrides: Partial<ValidHeader> = {}): ValidHeader {
  return {
    kind: 'valid',
    hasCrc: false,
    channelMode: 0, // Stereo
    padding: false,
    bitrateKbps: 64,
    sampleRateHz: 44100,
    frameSize: 209,
    ...overrides,
  };
}

/** Builds a frame buffer: 4-byte header + optional 2-byte CRC + filler + magic at `magicOffset`. */
function buildFramePayload(magic: string | null, magicOffset: number, totalLength: number): Buffer {
  const buf = Buffer.alloc(totalLength, 0);
  buf.writeUInt8(0xff, 0);
  buf.writeUInt8(0xfb, 1);
  buf.writeUInt8(0x50, 2);
  buf.writeUInt8(0x00, 3);
  if (magic) {
    Buffer.from(magic, 'ascii').copy(buf, magicOffset);
  }
  return buf;
}

describe('detectVbrTag', () => {
  it('detects "Xing" at payload offset 32 for a stereo frame (mirrors the real sample fixture)', () => {
    const header = makeHeader({ channelMode: 0 });
    const buf = buildFramePayload('Xing', 4 + STEREO_SIDE_INFO_BYTES, 128);

    expect(detectVbrTag(buf, 0, header)).toEqual({ kind: 'tag-found', type: 'Xing' });
  });

  it('detects "Info" (LAME CBR variant) at the same offset as "Xing"', () => {
    const header = makeHeader({ channelMode: 0 });
    const buf = buildFramePayload('Info', 4 + STEREO_SIDE_INFO_BYTES, 128);

    expect(detectVbrTag(buf, 0, header)).toEqual({ kind: 'tag-found', type: 'Info' });
  });

  it('detects a synthetic "VBRI" tag at the fixed 32-byte-after-header offset', () => {
    const header = makeHeader({ channelMode: 0 });
    const buf = buildFramePayload('VBRI', 4 + STEREO_SIDE_INFO_BYTES, 128);

    expect(detectVbrTag(buf, 0, header)).toEqual({ kind: 'tag-found', type: 'VBRI' });
  });

  it('checks for the tag magic at offset 17 (not 32) for a mono frame', () => {
    const header = makeHeader({ channelMode: CHANNEL_MODE_MONO });
    const buf = buildFramePayload('Xing', 4 + MONO_SIDE_INFO_BYTES, 128);

    expect(detectVbrTag(buf, 0, header)).toEqual({ kind: 'tag-found', type: 'Xing' });
  });

  it('shifts the expected offset by +2 bytes when the frame has a CRC', () => {
    const header = makeHeader({ channelMode: 0, hasCrc: true });
    const buf = buildFramePayload('Xing', 4 + 2 + STEREO_SIDE_INFO_BYTES, 128);

    expect(detectVbrTag(buf, 0, header)).toEqual({ kind: 'tag-found', type: 'Xing' });
  });

  it('returns "insufficient-data" when the buffer is shorter than the required check offset', () => {
    const header = makeHeader({ channelMode: 0 });
    const buf = Buffer.alloc(10, 0); // shorter than 4 + 32 + 4

    expect(detectVbrTag(buf, 0, header)).toEqual({ kind: 'insufficient-data' });
  });

  it('returns "insufficient-data" when the Xing/Info check has enough bytes but the VBRI check does not', () => {
    // Mono's Xing/Info offset (4+17=21) is well short of VBRI's fixed offset (4+32=36), so a
    // buffer can satisfy the first check while starving the second -- the only way to reach
    // that specific branch, since for stereo/CRC frames both offsets are identical.
    const header = makeHeader({ channelMode: CHANNEL_MODE_MONO });
    const buf = buildFramePayload(null, 0, 30); // >= 21+4=25 (Xing/Info resolves), < 36+4=40 (VBRI doesn't)

    expect(detectVbrTag(buf, 0, header)).toEqual({ kind: 'insufficient-data' });
  });

  it('returns "not-a-tag" when no recognizable magic appears at any expected offset', () => {
    const header = makeHeader({ channelMode: 0 });
    const buf = buildFramePayload(null, 0, 128);
    // Sprinkle a decoy that is *not* a valid magic string near, but not at, the checked offsets.
    Buffer.from('Ping', 'ascii').copy(buf, 10);

    expect(detectVbrTag(buf, 0, header)).toEqual({ kind: 'not-a-tag' });
  });

  it('checks relative to a non-zero frameOffset into a larger buffer', () => {
    const header = makeHeader({ channelMode: 0 });
    const framePayload = buildFramePayload('Xing', 4 + STEREO_SIDE_INFO_BYTES, 128);
    const buf = Buffer.concat([Buffer.alloc(44, 0), framePayload]);

    expect(detectVbrTag(buf, 44, header)).toEqual({ kind: 'tag-found', type: 'Xing' });
  });
});
