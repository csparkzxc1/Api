import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type {
  ProviderSummary,
  UsageSummary,
  UsageSeries,
} from '@pulsewatch/shared-types';
import { pickCap, projectExhaustion, windowEnd } from '../usage/projection.js';

type WindowName = 'hour' | 'day' | 'week' | 'month' | 'reset_window';

const SummaryQuery = z.object({
  window: z.enum(['hour', 'day', 'week', 'month', 'reset_window']).default('day'),
});

const SeriesQuery = z.object({
  account_id: z.string().uuid().optional(),
  from: z.string().datetime(),
  to: z.string().datetime(),
  bucket: z.enum(['hour', 'day']).default('day'),
  group_by: z.enum(['model', 'provider', 'none']).default('none'),
});

function windowStart(window: WindowName, now = new Date()): Date {
  const d = new Date(now);
  switch (window) {
    case 'hour':
      d.setUTCMinutes(0, 0, 0);
      return d;
    case 'day':
      d.setUTCHours(0, 0, 0, 0);
      return d;
    case 'week': {
      d.setUTCHours(0, 0, 0, 0);
      d.setUTCDate(d.getUTCDate() - d.getUTCDay());
      return d;
    }
    case 'month':
      d.setUTCHours(0, 0, 0, 0);
      d.setUTCDate(1);
      return d;
    case 'reset_window':
      // Claude Code Max 5-hour rolling window — caller picks the start when
      // it has agent samples; otherwise fall back to last 5h.
      return new Date(now.getTime() - 5 * 3600 * 1000);
  }
}

interface UsageRow { provider: 'anthropic' | 'openai'; unit: string; total: string }
interface CapRow {
  provider: 'anthropic' | 'openai';
  daily_cap_usd: string | null;
  monthly_cap_usd: string | null;
  daily_cap_tokens: string | null;
}

export async function usageRoutes(app: FastifyInstance) {
  app.get('/v1/usage/summary', async (req) => {
    const { userId } = req.auth!;
    const { window } = SummaryQuery.parse(req.query);
    const since = windowStart(window);
    const now = new Date();
    const until = windowEnd(window, since);

    const [usageRows, capRows] = await Promise.all([
      app.sql<UsageRow[]>`
        select a.provider, f.unit, sum(f.value)::text as total
        from usage_facts f
        join accounts a on a.id = f.account_id
        where a.user_id = ${userId}
          and a.removed_at is null
          and f.bucket_start >= ${since}
        group by a.provider, f.unit
      `,
      app.sql<CapRow[]>`
        select
          a.provider,
          sum(a.daily_cap_usd)::text    as daily_cap_usd,
          sum(a.monthly_cap_usd)::text  as monthly_cap_usd,
          sum(a.daily_cap_tokens)::text as daily_cap_tokens
        from accounts a
        where a.user_id = ${userId} and a.removed_at is null
        group by a.provider
      `,
    ]);

    const capsByProvider = new Map<string, CapRow>();
    for (const c of capRows) capsByProvider.set(c.provider, c);

    const byProvider = new Map<string, ProviderSummary>();
    for (const r of usageRows) {
      const key = `${r.provider}:${r.unit}`;
      const prev = byProvider.get(key) ?? {
        provider: r.provider,
        used: 0,
        limit: null,
        unit: r.unit as ProviderSummary['unit'],
        percent: null,
        resets_at: null,
        projected_exhaustion_at: null,
      };
      prev.used += Number(r.total);
      byProvider.set(key, prev);
    }

    // Apply caps, derive percent, project exhaustion.
    for (const [, summary] of byProvider) {
      const caps = capsByProvider.get(summary.provider);
      if (!caps) continue;
      const cap = pickCap(
        {
          daily_cap_usd:    parseNullableNumber(caps.daily_cap_usd),
          monthly_cap_usd:  parseNullableNumber(caps.monthly_cap_usd),
          daily_cap_tokens: parseNullableNumber(caps.daily_cap_tokens),
        },
        window,
        summary.unit,
      );
      if (cap != null && cap > 0) {
        summary.limit = cap;
        summary.percent = Math.min(1, summary.used / cap);
      }
      summary.projected_exhaustion_at = projectExhaustion({
        used: summary.used,
        cap,
        windowStart: since,
        windowEndExclusive: until,
        now,
      });
      // resets_at is the window's end for fixed windows; null for the
      // rolling reset_window scope (every sample shifts it).
      summary.resets_at = window === 'reset_window' ? null : until.toISOString();
    }

    const summary: UsageSummary = {
      generated_at: now.toISOString(),
      window,
      providers: [...byProvider.values()],
    };
    return summary;
  });

  app.get('/v1/usage/series', async (req, reply) => {
    const { userId } = req.auth!;
    const q = SeriesQuery.parse(req.query);
    const from = new Date(q.from);
    const to = new Date(q.to);
    if (from >= to) return reply.code(400).send({ error: 'invalid_range' });

    const buckets = await app.sql<
      { t: Date; group_key: string | null; unit: string; total: string }[]
    >`
      select
        date_trunc(${q.bucket}, f.bucket_start) as t,
        case
          when ${q.group_by} = 'model' then nullif(f.model, '')
          when ${q.group_by} = 'provider' then a.provider
          else null
        end as group_key,
        f.unit,
        sum(f.value)::text as total
      from usage_facts f
      join accounts a on a.id = f.account_id
      where a.user_id = ${userId}
        and a.removed_at is null
        and (${q.account_id ?? null}::uuid is null or a.id = ${q.account_id ?? null}::uuid)
        and f.bucket_start >= ${from}
        and f.bucket_start < ${to}
        and f.bucket = ${q.bucket}
      group by 1, 2, 3
      order by 1 asc
    `;

    const series: UsageSeries = {
      bucket: q.bucket,
      points: buckets.map((b) => ({
        t: b.t.toISOString(),
        value: Number(b.total),
        group: b.group_key ?? undefined,
        unit: b.unit as UsageSeries['points'][number]['unit'],
      })),
    };
    return series;
  });
}

function parseNullableNumber(v: string | null): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
