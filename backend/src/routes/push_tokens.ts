import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

const Body = z.object({
  apns_token: z.string().regex(/^[0-9a-fA-F]+$/).max(256).optional(),
  apns_environment: z.enum(['sandbox', 'production']).optional(),
  fcm_token: z.string().min(8).max(512).optional(),
  platform: z.enum(['ios', 'watchos', 'android', 'wearos']),
}).refine((b) => b.apns_token || b.fcm_token, { message: 'apns_token_or_fcm_token_required' });

export async function pushTokensRoutes(app: FastifyInstance) {
  app.put('/v1/devices/push-token', async (req, reply) => {
    const { deviceId, userId } = req.auth!;
    const body = Body.parse(req.body);

    // Confirm the bearer's device belongs to the user (defence in depth — the
    // join already does it, but we want the failure mode to be 404 not insert).
    const owns = await app.sql<{ id: string }[]>`
      select id from devices where id = ${deviceId} and user_id = ${userId} and revoked_at is null
    `;
    if (owns.length === 0) return reply.code(404).send({ error: 'unknown_device' });

    await app.sql`
      insert into push_tokens (
        device_id, platform, apns_token, apns_environment, fcm_token, updated_at, invalidated_at, last_error
      )
      values (
        ${deviceId}, ${body.platform},
        ${body.apns_token ?? null}, ${body.apns_environment ?? null},
        ${body.fcm_token ?? null}, now(), null, null
      )
      on conflict (device_id) do update set
        platform = excluded.platform,
        apns_token = excluded.apns_token,
        apns_environment = excluded.apns_environment,
        fcm_token = excluded.fcm_token,
        invalidated_at = null,
        last_error = null,
        updated_at = now()
    `;

    return reply.code(204).send();
  });

  app.delete('/v1/devices/push-token', async (req, reply) => {
    const { deviceId, userId } = req.auth!;
    await app.sql`
      delete from push_tokens
      where device_id = ${deviceId}
        and exists (select 1 from devices d where d.id = ${deviceId} and d.user_id = ${userId})
    `;
    return reply.code(204).send();
  });
}
