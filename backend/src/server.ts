import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import sensible from '@fastify/sensible';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './config.js';
import { createSql } from './db/client.js';
import { createRedis } from './cache/redis.js';
import { createPollQueue } from './queues.js';
import { contextPlugin } from './plugins/context.js';
import { authPlugin } from './plugins/auth.js';
import { authRoutes } from './routes/auth.js';
import { accountsRoutes } from './routes/accounts.js';
import { usageRoutes } from './routes/usage.js';
import { alertsRoutes } from './routes/alerts.js';
import { agentRoutes } from './routes/agent.js';
import { wrappingKeysRoutes } from './routes/wrapping_keys.js';

const VERSION = '0.1.0';

export async function buildServer() {
  const cfg = loadConfig();
  const sql = createSql(cfg.databaseUrl);
  const redis = createRedis(cfg.redisUrl);
  const pollQueue = createPollQueue(redis);

  const app = Fastify({
    logger: { level: cfg.logLevel },
    trustProxy: true,
    disableRequestLogging: false,
    bodyLimit: 256 * 1024,
  });

  await app.register(helmet, { global: true });
  await app.register(sensible);
  if (cfg.corsOrigin.length > 0) {
    await app.register(cors, { origin: cfg.corsOrigin });
  }
  await app.register(rateLimit, {
    max: 600,
    timeWindow: '1 minute',
    redis,
    keyGenerator: (req) => req.auth?.userId ?? req.ip,
  });

  await app.register(contextPlugin, { cfg, sql, redis, pollQueue });
  await app.register(authPlugin);

  app.get('/healthz', async () => ({
    status: 'ok' as const,
    version: VERSION,
    time: new Date().toISOString(),
  }));

  const here = path.dirname(fileURLToPath(import.meta.url));
  const specPath = path.join(here, '..', '..', 'openapi.yaml');
  app.get('/openapi.yaml', async (_req, reply) => {
    const buf = await readFile(specPath);
    reply.header('content-type', 'application/yaml').send(buf);
  });

  await app.register(authRoutes);
  await app.register(accountsRoutes);
  await app.register(usageRoutes);
  await app.register(alertsRoutes);
  await app.register(agentRoutes);
  await app.register(wrappingKeysRoutes);

  app.setErrorHandler((err, _req, reply) => {
    if ((err as { name?: string }).name === 'ZodError') {
      return reply.code(400).send({ error: 'invalid_body', issues: (err as { issues: unknown }).issues });
    }
    app.log.error({ err }, 'unhandled');
    const status = err.statusCode ?? 500;
    return reply.code(status).send({ error: status >= 500 ? 'internal' : err.message });
  });

  app.addHook('onClose', async () => {
    await pollQueue.close();
    await redis.quit();
    await sql.end();
  });

  return { app, cfg };
}

async function main() {
  const { app, cfg } = await buildServer();
  await app.listen({ host: '0.0.0.0', port: cfg.port });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
