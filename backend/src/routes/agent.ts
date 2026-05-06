import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

const Sample = z.object({
  t: z.string().datetime(),
  source: z.enum(['claude_code', 'codex_cli']),
  model: z.string().max(128).optional(),
  input_tokens: z.number().int().nonnegative(),
  output_tokens: z.number().int().nonnegative(),
  cache_read_tokens: z.number().int().nonnegative().default(0),
  cache_write_tokens: z.number().int().nonnegative().default(0),
  cost_usd: z.number().nonnegative().default(0),
});

const Body = z.object({
  agent_id: z.string().uuid(),
  samples: z.array(Sample).max(1000),
});

export async function agentRoutes(app: FastifyInstance) {
  app.post('/v1/agent/ingest', async (req, reply) => {
    const { userId } = req.auth!;
    const body = Body.parse(req.body);
    if (body.samples.length === 0) return reply.code(202).send();

    const rows = body.samples.map((s) => ({
      user_id: userId,
      agent_id: body.agent_id,
      source: s.source,
      occurred_at: s.t,
      model: s.model ?? null,
      input_tokens: s.input_tokens,
      output_tokens: s.output_tokens,
      cache_read_tokens: s.cache_read_tokens,
      cache_write_tokens: s.cache_write_tokens,
      cost_usd: s.cost_usd,
    }));

    await app.sql`
      insert into agent_samples ${app.sql(
        rows,
        'user_id',
        'agent_id',
        'source',
        'occurred_at',
        'model',
        'input_tokens',
        'output_tokens',
        'cache_read_tokens',
        'cache_write_tokens',
        'cost_usd',
      )}
    `;

    return reply.code(202).send();
  });
}
