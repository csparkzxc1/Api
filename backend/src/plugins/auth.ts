import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { hashToken } from '../security/crypto.js';

const PUBLIC_PREFIXES = ['/healthz', '/health', '/v1/auth/devices', '/openapi.yaml'];

export const authPlugin = fp(async (app: FastifyInstance) => {
  app.addHook('preHandler', async (req, reply) => {
    if (PUBLIC_PREFIXES.some((p) => req.url === p || req.url.startsWith(`${p}?`))) return;
    if (req.method === 'POST' && req.url === '/v1/auth/devices') return;

    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      return reply.code(401).send({ error: 'missing_bearer' });
    }
    const token = header.slice('Bearer '.length).trim();
    const tokenHash = hashToken(token);

    const rows = await app.sql<
      { id: string; device_id: string; user_id: string }[]
    >`
      select s.id, s.device_id, d.user_id
      from sessions s
      join devices d on d.id = s.device_id
      where s.token_hash = ${tokenHash}
        and s.revoked_at is null
        and s.expires_at > now()
        and d.revoked_at is null
      limit 1
    `;
    const row = rows[0];
    if (!row) return reply.code(401).send({ error: 'invalid_session' });
    (req as FastifyRequest).auth = {
      sessionId: row.id,
      deviceId: row.device_id,
      userId: row.user_id,
    };
  });
});
