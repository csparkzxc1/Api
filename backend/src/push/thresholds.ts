import type { Sql } from '../db/client.js';
import type { PushDispatcher } from './dispatcher.js';

interface ThresholdRow {
  id: string;
  user_id: string;
  scope: 'provider_day' | 'provider_month' | 'claude_code_reset_window';
  provider: 'anthropic' | 'openai' | null;
  percent: number;
  haptic: boolean;
  last_fired_at: Date | null;
}

interface UsageRow {
  user_id: string;
  provider: 'anthropic' | 'openai';
  unit: 'usd' | 'tokens' | 'requests';
  total: string;
}

const RESET_BACKOFF_MS = 6 * 60 * 60 * 1000; // don't re-fire the same alert within 6 hours

/**
 * Evaluates user-configured thresholds against the latest aggregate usage.
 * Fires a push for every threshold that has just crossed its trigger.
 *
 * The "limit" each threshold compares against is provider-defined; we use
 * `accounts.metadata.limit` if present, else fall back to a per-account
 * provided limit on the threshold row (future schema). For M6 we treat the
 * percent as a raw fraction of the *daily* or *monthly* aggregate divided by
 * a configured cap exposed via the `account_limits` view (TODO). To keep
 * this commit working without schema changes we evaluate the simpler check:
 * if the absolute daily total exceeds a hardcoded cap the user set when
 * creating the threshold (`percent` interpreted as fraction of $20/day for
 * USD, 1M tokens/day for tokens).
 */
const FALLBACK_CAPS: Record<'usd' | 'tokens' | 'requests', number> = {
  usd: 20,
  tokens: 1_000_000,
  requests: 1_000,
};

export interface ThresholdEvaluatorDeps {
  sql: Sql;
  push: PushDispatcher;
  log?: (msg: string, extra?: Record<string, unknown>) => void;
}

export async function evaluateForUser(deps: ThresholdEvaluatorDeps, userId: string): Promise<void> {
  const { sql, push } = deps;

  const thresholds = await sql<ThresholdRow[]>`
    select id, user_id, scope, provider, percent, haptic, last_fired_at
    from alert_thresholds where user_id = ${userId}
  `;
  if (thresholds.length === 0) return;

  // Aggregate today's usage and this month's usage for this user.
  const today = await sql<UsageRow[]>`
    select a.user_id, a.provider, f.unit, sum(f.value)::text as total
    from usage_facts f
    join accounts a on a.id = f.account_id
    where a.user_id = ${userId}
      and a.removed_at is null
      and f.bucket_start >= date_trunc('day', now() at time zone 'utc')
    group by a.user_id, a.provider, f.unit
  `;
  const month = await sql<UsageRow[]>`
    select a.user_id, a.provider, f.unit, sum(f.value)::text as total
    from usage_facts f
    join accounts a on a.id = f.account_id
    where a.user_id = ${userId}
      and a.removed_at is null
      and f.bucket_start >= date_trunc('month', now() at time zone 'utc')
    group by a.user_id, a.provider, f.unit
  `;

  const fired: { id: string; title: string; body: string }[] = [];

  for (const t of thresholds) {
    if (t.last_fired_at && Date.now() - t.last_fired_at.getTime() < RESET_BACKOFF_MS) continue;

    const rows = t.scope === 'provider_month' ? month : today;
    const matched = rows.filter((r) => !t.provider || r.provider === t.provider);
    for (const r of matched) {
      const cap = FALLBACK_CAPS[r.unit];
      const used = Number(r.total);
      const ratio = used / cap;
      if (ratio < t.percent) continue;
      fired.push({
        id: t.id,
        title: `${prettyProvider(r.provider)} ${prettyScope(t.scope)} at ${Math.round(ratio * 100)}%`,
        body: `${formatUsed(r.unit, used)} of ~${formatUsed(r.unit, cap)} cap`,
      });
      break; // one fire per threshold per evaluation cycle
    }
  }

  if (fired.length === 0) return;

  for (const f of fired) {
    await push.send(userId, {
      title: f.title,
      body: f.body,
      refreshComplications: true,
      data: { thresholdId: f.id, kind: 'threshold' },
    });
    await sql`update alert_thresholds set last_fired_at = now() where id = ${f.id}`;
  }
  deps.log?.('thresholds-fired', { userId, count: fired.length });
}

function prettyProvider(p: 'anthropic' | 'openai'): string {
  return p === 'anthropic' ? 'Claude' : 'OpenAI';
}

function prettyScope(s: ThresholdRow['scope']): string {
  switch (s) {
    case 'provider_day': return 'today';
    case 'provider_month': return 'this month';
    case 'claude_code_reset_window': return '5h window';
  }
}

function formatUsed(unit: 'usd' | 'tokens' | 'requests', n: number): string {
  switch (unit) {
    case 'usd': return `$${n.toFixed(2)}`;
    case 'tokens': return `${Math.round(n).toLocaleString()} tokens`;
    case 'requests': return `${Math.round(n).toLocaleString()} requests`;
  }
}
