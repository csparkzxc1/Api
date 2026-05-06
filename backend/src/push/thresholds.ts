import type { Sql } from '../db/client.js';
import type { PushDispatcher } from './dispatcher.js';

export interface ThresholdRow {
  id: string;
  user_id: string;
  scope: 'provider_day' | 'provider_month' | 'claude_code_reset_window';
  provider: 'anthropic' | 'openai' | null;
  percent: number;
  haptic: boolean;
  last_fired_at: Date | null;
}

export interface AggregateRow {
  account_id: string;
  provider: 'anthropic' | 'openai';
  unit: 'usd' | 'tokens' | 'requests';
  total: string;
  daily_cap_usd: number | null;
  monthly_cap_usd: number | null;
  daily_cap_tokens: number | null;
  reset_window_cap_tokens: number | null;
  reset_window_seconds: number;
}

const RESET_BACKOFF_MS = 6 * 60 * 60 * 1000;

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

  const today = await aggregate(sql, userId, "date_trunc('day', now() at time zone 'utc')");
  const month = await aggregate(sql, userId, "date_trunc('month', now() at time zone 'utc')");
  const fiveHour = await aggregateAgent(sql, userId, 5 * 3600);

  const fired: { id: string; title: string; body: string }[] = [];

  for (const t of thresholds) {
    if (t.last_fired_at && Date.now() - t.last_fired_at.getTime() < RESET_BACKOFF_MS) continue;

    const cross = match(t, { today, month, fiveHour });
    if (!cross) continue;
    fired.push({ id: t.id, ...cross });
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

async function aggregate(sql: Sql, userId: string, sinceExpr: string): Promise<AggregateRow[]> {
  return sql<AggregateRow[]>`
    select
      a.id as account_id, a.provider, f.unit, sum(f.value)::text as total,
      a.daily_cap_usd, a.monthly_cap_usd, a.daily_cap_tokens,
      a.reset_window_cap_tokens, a.reset_window_seconds
    from usage_facts f
    join accounts a on a.id = f.account_id
    where a.user_id = ${userId}
      and a.removed_at is null
      and f.bucket_start >= ${sql.unsafe(sinceExpr)}
    group by a.id, a.provider, f.unit
  `;
}

async function aggregateAgent(sql: Sql, userId: string, windowSec: number): Promise<AggregateRow[]> {
  return sql<AggregateRow[]>`
    select
      a.id as account_id, a.provider, 'tokens' as unit,
      sum(s.input_tokens + s.output_tokens)::text as total,
      a.daily_cap_usd, a.monthly_cap_usd, a.daily_cap_tokens,
      a.reset_window_cap_tokens, a.reset_window_seconds
    from agent_samples s
    join accounts a on a.user_id = s.user_id and a.provider = 'anthropic'
    where s.user_id = ${userId}
      and s.source = 'claude_code'
      and a.removed_at is null
      and s.occurred_at >= now() - make_interval(secs => ${windowSec})
    group by a.id, a.provider, a.daily_cap_usd, a.monthly_cap_usd,
             a.daily_cap_tokens, a.reset_window_cap_tokens, a.reset_window_seconds
  `;
}

interface Match { title: string; body: string }

// exported for unit tests
export const _testing = { match, capFor };

function match(
  t: ThresholdRow,
  agg: { today: AggregateRow[]; month: AggregateRow[]; fiveHour: AggregateRow[] },
): Match | null {
  const rows =
    t.scope === 'provider_month' ? agg.month :
    t.scope === 'claude_code_reset_window' ? agg.fiveHour :
    agg.today;

  for (const r of rows) {
    if (t.provider && r.provider !== t.provider) continue;
    const cap = capFor(t.scope, r);
    if (cap == null || cap <= 0) continue;
    const used = Number(r.total);
    const ratio = used / cap;
    if (ratio < t.percent) continue;
    return {
      title: `${prettyProvider(r.provider)} ${prettyScope(t.scope)} at ${Math.round(ratio * 100)}%`,
      body: `${formatUsed(r.unit, used)} of ${formatUsed(r.unit, cap)} cap`,
    };
  }
  return null;
}

function capFor(scope: ThresholdRow['scope'], r: AggregateRow): number | null {
  if (scope === 'claude_code_reset_window') return r.reset_window_cap_tokens;
  if (scope === 'provider_month') return r.monthly_cap_usd;
  // provider_day: prefer USD cap; fall back to token cap if the unit is tokens.
  if (r.unit === 'usd') return r.daily_cap_usd;
  if (r.unit === 'tokens') return r.daily_cap_tokens;
  return null;
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
