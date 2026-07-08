import { buildFrame } from './support';

describe('buildFrame', () => {
  it('throws if the given options do not produce a parseable header (misuse guard)', () => {
    // bitrateIndex 0 ("free") is rejected by the real parseFrameHeader as not-a-frame.
    expect(() => buildFrame({ bitrateIndex: 0, sampleRateIndex: 0 })).toThrow(
      /did not parse as a valid frame/,
    );
  });
});
