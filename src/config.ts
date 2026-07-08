const DEFAULT_PORT = 3000;

/** Parses and validates the PORT env var, failing loudly on a malformed value. */
export function parsePort(raw: string | undefined): number {
  if (raw === undefined) return DEFAULT_PORT;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 65535) {
    throw new Error(`Invalid PORT env var: "${raw}" — must be an integer between 0 and 65535.`);
  }
  return parsed;
}

/** Parses and validates the MAX_UPLOAD_BYTES env var, failing loudly on a malformed value. */
export function parseMaxUploadBytes(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid MAX_UPLOAD_BYTES env var: "${raw}" — must be a positive number.`);
  }
  return parsed;
}

/** Parses and validates the UPLOAD_TIME_BUDGET_MS env var, failing loudly on a malformed value. */
export function parseUploadTimeBudgetMs(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid UPLOAD_TIME_BUDGET_MS env var: "${raw}" — must be a positive number.`);
  }
  return parsed;
}
