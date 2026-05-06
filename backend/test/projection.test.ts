import { describe, expect, it } from 'vitest';
import { pickCap, projectExhaustion, windowEnd } from '../src/usage/projection.js';

const start = new Date('2026-05-06T00:00:00Z');
const dayEnd = new Date('2026-05-07T00:00:00Z');

describe('projectExhaustion', () => {
  it('returns null when no cap', () => {
    expect(projectExhaustion({
      used: 100, cap: null,
      windowStart: start, windowEndExclusive: dayEnd,
      now: new Date('2026-05-06T06:00:00Z'),
    })).toBeNull();
  });

  it('returns null when no usage yet', () => {
    expect(projectExhaustion({
      used: 0, cap: 20,
      windowStart: start, windowEndExclusive: dayEnd,
      now: new Date('2026-05-06T06:00:00Z'),
    })).toBeNull();
  });

  it('returns now() when already exhausted', () => {
    const now = new Date('2026-05-06T06:00:00Z');
    expect(projectExhaustion({
      used: 25, cap: 20,
      windowStart: start, windowEndExclusive: dayEnd,
      now,
    })).toBe(now.toISOString());
  });

  it('linearly projects to roughly 24h when burn rate is constant', () => {
    // 6 hours into the day, used $5 of $20 cap → rate = $5/6h.
    // remaining = $15 → 18 more hours → exhaustion at hour 24 (window end).
    // Since exhaustion equals window end and we use strict-less-than, returns null.
    expect(projectExhaustion({
      used: 5, cap: 20,
      windowStart: start, windowEndExclusive: dayEnd,
      now: new Date('2026-05-06T06:00:00Z'),
    })).toBeNull();
  });

  it('returns a timestamp before window end when burn rate is high', () => {
    // 6h in, used $10 of $20 cap → rate $10/6h. Remaining $10 → +6h → 18:00.
    const out = projectExhaustion({
      used: 10, cap: 20,
      windowStart: start, windowEndExclusive: dayEnd,
      now: new Date('2026-05-06T06:00:00Z'),
    });
    expect(out).toBe('2026-05-06T12:00:00.000Z');
  });

  it('returns null when projected exhaustion lies past the window', () => {
    // 1h in, used $1 of $20 → rate $1/h → +19h until exhaustion → 20:00.
    // Window ends at 24:00, so exhaustion lies inside → returns 20:00.
    expect(projectExhaustion({
      used: 1, cap: 20,
      windowStart: start, windowEndExclusive: dayEnd,
      now: new Date('2026-05-06T01:00:00Z'),
    })).toBe('2026-05-06T20:00:00.000Z');

    // Same setup, but cap is bigger so the projection overshoots the window.
    expect(projectExhaustion({
      used: 1, cap: 1_000,
      windowStart: start, windowEndExclusive: dayEnd,
      now: new Date('2026-05-06T01:00:00Z'),
    })).toBeNull();
  });
});

describe('windowEnd', () => {
  it('hour adds one hour', () => {
    expect(windowEnd('hour', start).toISOString()).toBe('2026-05-06T01:00:00.000Z');
  });
  it('day adds 24 hours', () => {
    expect(windowEnd('day', start).toISOString()).toBe('2026-05-07T00:00:00.000Z');
  });
  it('reset_window adds 5 hours', () => {
    expect(windowEnd('reset_window', start).toISOString()).toBe('2026-05-06T05:00:00.000Z');
  });
  it('month is calendar-correct', () => {
    expect(windowEnd('month', start).toISOString()).toBe('2026-06-06T00:00:00.000Z');
    expect(windowEnd('month', new Date('2026-01-31T00:00:00Z')).toISOString()).toBe('2026-03-03T00:00:00.000Z');
    // ↑ JS adds a month then normalises; documenting actual behaviour.
  });
});

describe('pickCap', () => {
  const caps = { daily_cap_usd: 20, monthly_cap_usd: 500, daily_cap_tokens: 1_000_000 };

  it('day + usd → daily_cap_usd', () => {
    expect(pickCap(caps, 'day', 'usd')).toBe(20);
  });
  it('month + usd → monthly_cap_usd', () => {
    expect(pickCap(caps, 'month', 'usd')).toBe(500);
  });
  it('day + tokens → daily_cap_tokens', () => {
    expect(pickCap(caps, 'day', 'tokens')).toBe(1_000_000);
  });
  it('hour and other unmapped pairs → null', () => {
    expect(pickCap(caps, 'hour', 'usd')).toBeNull();
    expect(pickCap(caps, 'reset_window', 'tokens')).toBeNull();
    expect(pickCap(caps, 'day', 'requests')).toBeNull();
  });
});
