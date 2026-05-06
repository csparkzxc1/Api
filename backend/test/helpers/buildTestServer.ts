/**
 * Lightweight Fastify factory for in-process route tests.
 *
 * Skips helmet / CORS / rate-limit (which need a real Redis) and the global
 * error handler that converts runtime types — those are exercised by the
 * testcontainers integration suite. The point of this builder is to test
 * route handlers' branching against fake SQL / queue stubs.
 */

import Fastify, { type FastifyInstance } from 'fastify';
import sensible from '@fastify/sensible';
import { generateWrappingKey, loadWrappingKeyFromHex } from '../../src/security/ecies.js';
import type { Config } from '../../src/config.js';
import type { Sql } from '../../src/db/client.js';
import { contextPlugin } from '../../src/plugins/context.js';
import { authPlugin } from '../../src/plugins/auth.js';
import { authRoutes } from '../../src/routes/auth.js';
import { accountsRoutes } from '../../src/routes/accounts.js';
import { usageRoutes } from '../../src/routes/usage.js';
import { alertsRoutes } from '../../src/routes/alerts.js';
import { agentRoutes } from '../../src/routes/agent.js';
import { wrappingKeysRoutes } from '../../src/routes/wrapping_keys.js';
import { pairingsRoutes } from '../../src/routes/pairings.js';
import { pushTokensRoutes } from '../../src/routes/push_tokens.js';

export interface TestDeps {
  sql: unknown;
}

export async function buildTestServer(deps: TestDeps): Promise<{
  app: FastifyInstance;
  cfg: Config;
}> {
  const { privHex } = generateWrappingKey();
  const cfg: Config = {
    nodeEnv: 'test',
    port: 0,
    logLevel: 'fatal',
    databaseUrl: 'postgres://stub',
    redisUrl: 'redis://stub',
    kekKid: 'k1',
    kekKeys: new Map([['k1', Buffer.alloc(32, 7)]]),
    pollIntervalSec: 600,
    pollJitterSec: 0,
    corsOrigin: [],
    wrappingKid: 'w1',
    wrappingKey: loadWrappingKeyFromHex(privHex),
  };

  // Stub queue + redis. Both expose only the surface our routes touch.
  const stubQueue = {
    add: async () => undefined,
    close: async () => undefined,
  };

  const app = Fastify({ logger: false, disableRequestLogging: true });
  // Must be registered before the routes so the handler applies to their
  // scopes. The production server has the same ordering bug fixed
  // implicitly by the route plugins not having their own handlers, but
  // here we want explicit coverage of ZodError → 400.
  app.setErrorHandler((err, _req, reply) => {
    const e = err as { name?: string; message?: string; statusCode?: number; issues?: unknown };
    if (e.name === 'ZodError') {
      return reply.code(400).send({ error: 'invalid_body', issues: e.issues });
    }
    const status = e.statusCode ?? 500;
    return reply.code(status).send({ error: status >= 500 ? 'internal' : (e.message ?? 'error') });
  });

  await app.register(sensible);
  await app.register(contextPlugin, {
    cfg,
    sql: deps.sql as unknown as Sql,
    redis: {} as never,
    pollQueue: stubQueue as never,
  });
  await app.register(authPlugin);
  await app.register(authRoutes);
  await app.register(accountsRoutes);
  await app.register(usageRoutes);
  await app.register(alertsRoutes);
  await app.register(agentRoutes);
  await app.register(wrappingKeysRoutes);
  await app.register(pairingsRoutes);
  await app.register(pushTokensRoutes);

  await app.ready();
  return { app, cfg };
}
