import { parsePort, parseMaxUploadBytes, parseUploadTimeBudgetMs } from '../src/config';

describe('parsePort', () => {
  it('defaults to 3000 when PORT is undefined', () => {
    expect(parsePort(undefined)).toBe(3000);
  });

  it('parses a valid port string', () => {
    expect(parsePort('8080')).toBe(8080);
  });

  it('accepts port 0 (ephemeral port)', () => {
    expect(parsePort('0')).toBe(0);
  });

  it('throws for a non-numeric value', () => {
    expect(() => parsePort('notanumber')).toThrow(/Invalid PORT/);
  });

  it('throws for a non-integer value', () => {
    expect(() => parsePort('3000.5')).toThrow(/Invalid PORT/);
  });

  it('throws for a negative value', () => {
    expect(() => parsePort('-1')).toThrow(/Invalid PORT/);
  });

  it('throws for a value above 65535', () => {
    expect(() => parsePort('70000')).toThrow(/Invalid PORT/);
  });
});

describe('parseMaxUploadBytes', () => {
  it('returns undefined when MAX_UPLOAD_BYTES is undefined', () => {
    expect(parseMaxUploadBytes(undefined)).toBeUndefined();
  });

  it('parses a valid positive number', () => {
    expect(parseMaxUploadBytes('1000')).toBe(1000);
  });

  it('throws for a non-numeric value (the NaN-bypass bug this guards against)', () => {
    expect(() => parseMaxUploadBytes('notanumber')).toThrow(/Invalid MAX_UPLOAD_BYTES/);
  });

  it('throws for zero', () => {
    expect(() => parseMaxUploadBytes('0')).toThrow(/Invalid MAX_UPLOAD_BYTES/);
  });

  it('throws for a negative value', () => {
    expect(() => parseMaxUploadBytes('-100')).toThrow(/Invalid MAX_UPLOAD_BYTES/);
  });
});

describe('parseUploadTimeBudgetMs', () => {
  it('returns undefined when UPLOAD_TIME_BUDGET_MS is undefined', () => {
    expect(parseUploadTimeBudgetMs(undefined)).toBeUndefined();
  });

  it('parses a valid positive number', () => {
    expect(parseUploadTimeBudgetMs('5000')).toBe(5000);
  });

  it('throws for a non-numeric value', () => {
    expect(() => parseUploadTimeBudgetMs('notanumber')).toThrow(/Invalid UPLOAD_TIME_BUDGET_MS/);
  });

  it('throws for zero', () => {
    expect(() => parseUploadTimeBudgetMs('0')).toThrow(/Invalid UPLOAD_TIME_BUDGET_MS/);
  });

  it('throws for a negative value', () => {
    expect(() => parseUploadTimeBudgetMs('-100')).toThrow(/Invalid UPLOAD_TIME_BUDGET_MS/);
  });
});
