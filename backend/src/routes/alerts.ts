import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

const ThresholdInput = z.object({
  scope: z.enum(['provider_day', 'provider_month', 'claude_code_reset_window']),
  provider: z.enum(['anthropic', 'openai']).optional(),
  percent: z.number().min(0).max(1),
  haptic: z.boolean().default(true),
});

const ThresholdsInput = z.array(ThresholdInput).max(64);

type ThresholdRow = {
  id: string;
  scope: 'provider_day' | 'provider_month' | 'claude_code_reset_window';
  provider: 'anthropic' | 'openai' | null;
  percent: number;
  haptic: boolean;
  last_fired_at: Date | null;
  created_at: Date;
};

function toThreshold(r: ThresholdRow) {
  return {
    id: r.id,
    scope: r.scope,
    provider: r.provider ?? undefined,
    percent: Number(r.percent),
    haptic: r.haptic,
    last_fired_at: r.last_fired_at ? r.last_fired_at.toISOString() : null,
    created_at: r.created_at.toISOString(),
  };
}

export async function alertsRoutes(app: FastifyInstance) {
  app.get('/v1/alerts/thresholds', async (req) => {
    const { userId } = req.auth!;
    const rows = await app.sql<ThresholdRow[]>`
      select id, scope, provider, percent, haptic, last_fired_at, created_at
      from alert_thresholds where user_id = ${userId}
      order by created_at asc
    `;
    return rows.map(toThreshold);
  });

  app.put('/v1/alerts/thresholds', async (req) => {
    const { userId } = req.auth!;
    const items = ThresholdsInput.parse(req.body);

    const inserted = await app.sql.begin(async (tx) => {
      await tx`delete from alert_thresholds where user_id = ${userId}`;
      if (items.length === 0) return [] as ThresholdRow[];
      const values = items.map((i) => ({
        user_id: userId,
        scope: i.scope,
        provider: i.provider ?? null,
        percent: i.percent,
        haptic: i.haptic,
      }));
      return tx<ThresholdRow[]>`
        insert into alert_thresholds ${tx(values, 'user_id', 'scope', 'provider', 'percent', 'haptic')}
        returning id, scope, provider, percent, haptic, last_fired_at, created_at
      `;
    });

    return inserted.map(toThreshold);
  });
}
