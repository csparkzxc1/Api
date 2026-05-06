import { describe, expect, it } from 'vitest';
import {
  _testing,
  type AggregateRow,
  type ThresholdRow,
} from '../src/push/thresholds.js';

const { match } = _testing;

const row = (over: Partial<AggregateRow>): AggregateRow => ({
  account_id: 'a1',
  provider: 'anthropic',
  unit: 'tokens',
  total: '0',
  daily_cap_usd: null,
  monthly_cap_usd: null,
  daily_cap_tokens: null,
  reset_window_cap_tokens: null,
  reset_window_seconds: 18000,
  ...over,
});

const threshold = (over: Partial<ThresholdRow>): ThresholdRow => ({
  id: 't1',
  user_id: 'u1',
  scope: 'provider_day',
  provider: null,
  percent: 0.8,
  haptic: true,
  last_fired_at: null,
  ...over,
});

describe('threshold matcher', () => {
  it('fires on provider_day USD when used >= cap * percent', () => {
    const m = match(threshold({ scope: 'provider_day', percent: 0.5 }), {
      today: [row({ unit: 'usd', total: '12.50', daily_cap_usd: 20 })],
      month: [],
      fiveHour: [],
    });
    expect(m).not.toBeNull();
    expect(m!.body).toContain('$12.50');
    expect(m!.body).toContain('$20.00');
  });

  it('skips when cap is null', () => {
    const m = match(threshold({ scope: 'provider_day' }), {
      today: [row({ unit: 'usd', total: '999', daily_cap_usd: null })],
      month: [],
      fiveHour: [],
    });
    expect(m).toBeNull();
  });

  it('uses 5h-window aggregate for claude_code_reset_window', () => {
    const m = match(threshold({ scope: 'claude_code_reset_window', percent: 0.9 }), {
      today: [],
      month: [],
      fiveHour: [row({ total: '950000', reset_window_cap_tokens: 1_000_000 })],
    });
    expect(m).not.toBeNull();
    expect(m!.title).toContain('5h window');
  });

  it('respects provider filter', () => {
    const m = match(threshold({ provider: 'openai' }), {
      today: [
        row({ provider: 'anthropic', unit: 'usd', total: '100', daily_cap_usd: 20 }),
      ],
      month: [],
      fiveHour: [],
    });
    expect(m).toBeNull();
  });

  it('skips when ratio is below threshold', () => {
    const m = match(threshold({ scope: 'provider_day', percent: 0.95 }), {
      today: [row({ unit: 'usd', total: '5.00', daily_cap_usd: 20 })],
      month: [],
      fiveHour: [],
    });
    expect(m).toBeNull();
  });
});
