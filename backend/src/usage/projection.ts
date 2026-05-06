/**
 * Linear-rate projection of when usage in a window will hit a cap.
 *
 * Returned as ISO-8601. Returns `null` when the projection is not
 * meaningful (no cap, no usage yet, already exhausted, or projected
 * exhaustion falls outside this window).
 */
export interface ProjectionInput {
  used: number;
  cap: number | null;
  windowStart: Date;
  windowEndExclusive: Date;
  now?: Date;
}

export function projectExhaustion(input: ProjectionInput): string | null {
  const now = input.now ?? new Date();
  const cap = input.cap;
  if (cap == null || cap <= 0) return null;
  if (input.used <= 0) return null;
  if (input.used >= cap) return now.toISOString();

  const elapsedMs = now.getTime() - input.windowStart.getTime();
  if (elapsedMs <= 0) return null;

  const ratePerMs = input.used / elapsedMs;
  const remaining = cap - input.used;
  const exhaustAt = new Date(now.getTime() + remaining / ratePerMs);

  return exhaustAt < input.windowEndExclusive ? exhaustAt.toISOString() : null;
}

/**
 * Length of each summary window in milliseconds, used by the projection
 * to bound the answer to the window's end.
 *
 * Months are calendar-correct (not 30 days) by computing the start of
 * next month relative to `windowStart`.
 */
export function windowEnd(window: 'hour' | 'day' | 'week' | 'month' | 'reset_window', windowStart: Date): Date {
  const d = new Date(windowStart);
  switch (window) {
    case 'hour':         return new Date(d.getTime() + 3600 * 1000);
    case 'day':          return new Date(d.getTime() + 24 * 3600 * 1000);
    case 'week':         return new Date(d.getTime() + 7 * 24 * 3600 * 1000);
    case 'reset_window': return new Date(d.getTime() + 5 * 3600 * 1000);
    case 'month': {
      const e = new Date(d);
      e.setUTCMonth(e.getUTCMonth() + 1);
      return e;
    }
  }
}

/**
 * Picks the right per-account cap field for a (window, unit) pair.
 * Returns null when the schema doesn't currently track a cap for that
 * combination — caller treats it as "no projection".
 */
export interface AccountCaps {
  daily_cap_usd: number | null;
  monthly_cap_usd: number | null;
  daily_cap_tokens: number | null;
}

export function pickCap(
  caps: AccountCaps,
  window: 'hour' | 'day' | 'week' | 'month' | 'reset_window',
  unit: 'usd' | 'tokens' | 'requests',
): number | null {
  if (window === 'month' && unit === 'usd') return caps.monthly_cap_usd;
  if (window === 'day' && unit === 'usd')   return caps.daily_cap_usd;
  if (window === 'day' && unit === 'tokens') return caps.daily_cap_tokens;
  return null;
}
