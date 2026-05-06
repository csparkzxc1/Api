import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import type { Sql } from '../db/client.js';
import type { Redis } from 'ioredis';
import type { Config } from '../config.js';
import type { Queue } from 'bullmq';
import type { PollJob } from '../queues.js';

declare module 'fastify' {
  interface FastifyInstance {
    cfg: Config;
    sql: Sql;
    redis: Redis;
    pollQueue: Queue<PollJob>;
  }
  interface FastifyRequest {
    auth?: { userId: string; deviceId: string; sessionId: string };
  }
}

export interface ContextDeps {
  cfg: Config;
  sql: Sql;
  redis: Redis;
  pollQueue: Queue<PollJob>;
}

export const contextPlugin = fp(async (app: FastifyInstance, deps: ContextDeps) => {
  app.decorate('cfg', deps.cfg);
  app.decorate('sql', deps.sql);
  app.decorate('redis', deps.redis);
  app.decorate('pollQueue', deps.pollQueue);
});
