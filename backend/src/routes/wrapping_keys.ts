import type { FastifyInstance } from 'fastify';
import { WRAPPING_ALG } from '../security/ecies.js';

export async function wrappingKeysRoutes(app: FastifyInstance) {
  app.get('/v1/wrapping-keys/current', async () => ({
    kid: app.cfg.wrappingKid,
    public_key: app.cfg.wrappingKey.publicKeyRaw.toString('base64'),
    alg: WRAPPING_ALG,
  }));
}
