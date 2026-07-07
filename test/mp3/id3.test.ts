import { getId3v2SkipLength } from '../../src/mp3/id3';

describe('getId3v2SkipLength', () => {
  it('decodes the sample fixture header (34-byte tag) to a 44-byte skip', () => {
    // Real bytes taken from the head of the provided sample fixture:
    // "ID3", version 04 00, flags 00, synchsafe size 00 00 00 22 (=34).
    const buf = Buffer.from([0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x22]);

    expect(getId3v2SkipLength(buf)).toBe(44);
  });

  it('returns 0 when the buffer does not start with the "ID3" magic', () => {
    const buf = Buffer.from([0xff, 0xfb, 0x50, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);

    expect(getId3v2SkipLength(buf)).toBe(0);
  });

  it('adds 10 bytes to the skip length when the footer-present flag is set', () => {
    // Same 34-byte declared size as above, but flags byte has bit 4 (0x10) set.
    const buf = Buffer.from([0x49, 0x44, 0x33, 0x04, 0x00, 0x10, 0x00, 0x00, 0x00, 0x22]);

    // 10 (header) + 34 (declared size) + 10 (footer) = 54
    expect(getId3v2SkipLength(buf)).toBe(54);
  });

  it('returns 0 for a buffer shorter than the 10-byte ID3v2 header', () => {
    const buf = Buffer.from([0x49, 0x44, 0x33]);

    expect(getId3v2SkipLength(buf)).toBe(0);
  });
});
