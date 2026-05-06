import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { hashToken, newSessionToken } from '../security/crypto.js';

const SESSION_TTL_DAYS = 90;

const EnrollBody = z.object({
  platform: z.enum(['ios', 'android', 'watchos', 'wearos', 'desktop']),
  public_key: z.string().min(32).max(512),
  pairing_code: z.string().regex(/^\d{6}$/).optional(),
  device_name: z.string().max(64).optional(),
});

export async function authRoutes(app: FastifyInstance) {
  app.post('/v1/auth/devices', async (req, reply) => {
    const body = EnrollBody.parse(req.body);

    // If a pairing_code is supplied, look up an active pairing and join the
    // new device to that user_id. Otherwise mint a brand new user.
    let userId: string;
    let pairingId: string | null = null;
    if (body.pairing_code) {
      const codeHash = hashToken(body.pairing_code);
      const rows = await app.sql<{ id: string; user_id: string }[]>`
        select id, user_id from pairings
        where code_hash = ${codeHash}
          and consumed_at is null
          and expires_at > now()
        limit 1
      `;
      const pairing = rows[0];
      if (!pairing) return reply.code(400).send({ error: 'invalid_or_expired_pairing' });
      userId = pairing.user_id;
      pairingId = pairing.id;
    } else {
      const userRows = await app.sql<{ id: string }[]>`
        insert into users default values returning id
      `;
      userId = userRows[0]!.id;
    }

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

    if (pairingId) {
      await app.sql`
        update pairings
        set consumed_at = now(), consumed_by_device = ${deviceId}
        where id = ${pairingId}
      `;
    }

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
