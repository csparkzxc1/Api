import type { FastifyInstance } from 'fastify';
import { randomInt } from 'node:crypto';
import { hashToken } from '../security/crypto.js';

const PAIRING_TTL_SEC = 5 * 60;

export async function pairingsRoutes(app: FastifyInstance) {
  // Phone calls this to mint a one-time 6-digit code, then forwards it to the
  // watch via WatchConnectivity. The watch presents the code on
  // `POST /v1/auth/devices` to enroll into the same user_id.
  app.post('/v1/auth/pairings', async (req, reply) => {
    const { userId, deviceId } = req.auth!;
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const codeHash = hashToken(code);
    const expiresAt = new Date(Date.now() + PAIRING_TTL_SEC * 1000);

    await app.sql`
      insert into pairings (user_id, issued_by_device, code_hash, expires_at)
      values (${userId}, ${deviceId}, ${codeHash}, ${expiresAt})
    `;

    return reply.code(201).send({
      code,
      expires_at: expiresAt.toISOString(),
    });
  });
}
