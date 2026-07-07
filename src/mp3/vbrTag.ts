import { CHANNEL_MODE_MONO, type ValidHeader } from './frameHeader';

export interface TagFound {
  readonly kind: 'tag-found';
  readonly type: 'Xing' | 'Info' | 'VBRI';
}

export interface NotATag {
  readonly kind: 'not-a-tag';
}

export interface InsufficientData {
  readonly kind: 'insufficient-data';
}

export type VbrTagResult = TagFound | NotATag | InsufficientData;

const XING_MAGIC = Buffer.from('Xing', 'ascii');
const INFO_MAGIC = Buffer.from('Info', 'ascii');
const VBRI_MAGIC = Buffer.from('VBRI', 'ascii');

const FRAME_HEADER_BYTES = 4;
const CRC_BYTES = 2;
const STEREO_SIDE_INFO_BYTES = 32;
const MONO_SIDE_INFO_BYTES = 17;
// VBRI's offset is a Fraunhofer-encoder convention that is always fixed and
// channel-mode-independent — unlike Xing/Info, whose offset depends on side-info
// size. This numerically equals STEREO_SIDE_INFO_BYTES, but the two are conceptually
// unrelated; kept as a separate constant so no one "fixes" this to use
// sideInfoBytes(header) for mono frames, which would be wrong.
const VBRI_FIXED_TAG_OFFSET_BYTES = 32;

function crcBytes(header: ValidHeader): number {
  return header.hasCrc ? CRC_BYTES : 0;
}

function sideInfoBytes(header: ValidHeader): number {
  return header.channelMode === CHANNEL_MODE_MONO ? MONO_SIDE_INFO_BYTES : STEREO_SIDE_INFO_BYTES;
}

type MagicMatch = 'Xing' | 'Info' | 'VBRI' | 'none' | 'insufficient-data';

function matchMagicAt(buf: Buffer, offset: number): MagicMatch {
  if (buf.length < offset + 4) return 'insufficient-data';
  if (buf.compare(XING_MAGIC, 0, 4, offset, offset + 4) === 0) return 'Xing';
  if (buf.compare(INFO_MAGIC, 0, 4, offset, offset + 4) === 0) return 'Info';
  if (buf.compare(VBRI_MAGIC, 0, 4, offset, offset + 4) === 0) return 'VBRI';
  return 'none';
}

/**
 * Checks whether the frame starting at `frameOffset` (whose header has
 * already been parsed as `header`) is a Xing/Info/VBRI VBR-header tag
 * rather than real audio data.
 *
 * The Xing/Info magic sits right after the side info, whose size depends on
 * channel mode; the VBRI magic sits at the same header-relative offset as
 * the stereo Xing/Info case. Both offsets shift by 2 bytes when the frame
 * has a CRC (protection_bit === 0).
 */
export function detectVbrTag(buf: Buffer, frameOffset: number, header: ValidHeader): VbrTagResult {
  const afterHeader = frameOffset + FRAME_HEADER_BYTES + crcBytes(header);
  const xingInfoOffset = afterHeader + sideInfoBytes(header);
  const vbriOffset = afterHeader + VBRI_FIXED_TAG_OFFSET_BYTES;

  const xingInfoMatch = matchMagicAt(buf, xingInfoOffset);
  if (xingInfoMatch === 'insufficient-data') return { kind: 'insufficient-data' };
  if (xingInfoMatch === 'Xing' || xingInfoMatch === 'Info') {
    return { kind: 'tag-found', type: xingInfoMatch };
  }

  const vbriMatch = matchMagicAt(buf, vbriOffset);
  if (vbriMatch === 'insufficient-data') return { kind: 'insufficient-data' };
  if (vbriMatch === 'VBRI') return { kind: 'tag-found', type: 'VBRI' };

  return { kind: 'not-a-tag' };
}
