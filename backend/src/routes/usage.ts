import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type {
  ProviderSummary,
  UsageSummary,
  UsageSeries,
} from '@pulsewatch/shared-types';

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

function windowStart(window: 'hour' | 'day' | 'week' | 'month' | 'reset_window', now = new Date()): Date {
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

export async function usageRoutes(app: FastifyInstance) {
  app.get('/v1/usage/summary', async (req) => {
    const { userId } = req.auth!;
    const { window } = SummaryQuery.parse(req.query);
    const since = windowStart(window);

    const rows = await app.sql<{ provider: 'anthropic' | 'openai'; unit: string; total: string }[]>`
      select a.provider, f.unit, sum(f.value)::text as total
      from usage_facts f
      join accounts a on a.id = f.account_id
      where a.user_id = ${userId}
        and a.removed_at is null
        and f.bucket_start >= ${since}
      group by a.provider, f.unit
    `;

    const byProvider = new Map<string, ProviderSummary>();
    for (const r of rows) {
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

    const summary: UsageSummary = {
      generated_at: new Date().toISOString(),
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
