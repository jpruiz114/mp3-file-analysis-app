const ID3V2_HEADER_SIZE = 10;
const ID3V2_FOOTER_SIZE = 10;
const FOOTER_PRESENT_FLAG = 0x10;

/**
 * Given the leading bytes of a file, returns how many bytes to skip past an
 * ID3v2 tag (header + declared size + optional footer). Returns 0 if the
 * buffer does not start with an ID3v2 tag, or if there aren't yet enough
 * bytes to tell (callers should treat 0 as "no skip needed yet" and try
 * again once more bytes are available if that matters to them).
 */
export function getId3v2SkipLength(buf: Buffer): number {
  if (buf.length < ID3V2_HEADER_SIZE) return 0;

  const isId3Magic =
    buf.readUInt8(0) === 0x49 && // 'I'
    buf.readUInt8(1) === 0x44 && // 'D'
    buf.readUInt8(2) === 0x33; // '3'
  if (!isId3Magic) return 0;

  const flags = buf.readUInt8(5);
  const footerPresent = (flags & FOOTER_PRESENT_FLAG) !== 0;

  // Synchsafe 32-bit integer: 7 usable bits per byte, MSB of each byte is 0.
  const size =
    ((buf.readUInt8(6) & 0x7f) << 21) |
    ((buf.readUInt8(7) & 0x7f) << 14) |
    ((buf.readUInt8(8) & 0x7f) << 7) |
    (buf.readUInt8(9) & 0x7f);

  return ID3V2_HEADER_SIZE + size + (footerPresent ? ID3V2_FOOTER_SIZE : 0);
}
