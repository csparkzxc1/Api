import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { newSessionToken } from '../security/crypto.js';

const SESSION_TTL_DAYS = 90;

const EnrollBody = z.object({
  platform: z.enum(['ios', 'android', 'watchos', 'wearos', 'desktop']),
  public_key: z.string().min(32).max(512),
  pairing_code: z.string().regex(/^\d{6}$/),
  device_name: z.string().max(64).optional(),
});

export async function authRoutes(app: FastifyInstance) {
  app.post('/v1/auth/devices', async (req, reply) => {
    const body = EnrollBody.parse(req.body);

    // For M1 the pairing flow is stubbed: a device enrolls itself and gets its
    // own user. Phone↔watch pairing is implemented in M3 via a pairing-code
    // exchange that joins both devices to the same user_id.
    const userRows = await app.sql<{ id: string }[]>`
      insert into users default values returning id
    `;
    const userId = userRows[0]!.id;

    const deviceRows = await app.sql<{ id: string }[]>`
      insert into devices (user_id, platform, device_name, public_key)
      values (
        ${userId},
        ${body.platform},
        ${body.device_name ?? null},
        ${Buffer.from(body.public_key, 'base64')}
      )
      returning id
    `;
    const deviceId = deviceRows[0]!.id;

    const { token, hash } = newSessionToken();
    const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 3600 * 1000);

    await app.sql`
      insert into sessions (device_id, token_hash, expires_at)
      values (${deviceId}, ${hash}, ${expiresAt})
    `;

    return reply.code(201).send({
      device_id: deviceId,
      token,
      expires_at: expiresAt.toISOString(),
    });
  });

  app.delete<{ Params: { device_id: string } }>(
    '/v1/auth/devices/:device_id',
    async (req, reply) => {
      const { userId } = req.auth!;
      const result = await app.sql`
        update devices
        set revoked_at = now()
        where id = ${req.params.device_id}
          and user_id = ${userId}
          and revoked_at is null
      `;
      if (result.count === 0) return reply.code(404).send({ error: 'not_found' });
      await app.sql`
        update sessions set revoked_at = now()
        where device_id = ${req.params.device_id} and revoked_at is null
      `;
      return reply.code(204).send();
    },
  );
}
