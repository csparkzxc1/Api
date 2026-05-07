import pino from 'pino';
import { loadConfig } from '../config.js';
import { createSql } from '../db/client.js';
import { createRedis } from '../cache/redis.js';
import { buildPush } from '../push/index.js';
import { startPoller } from './poller.js';

async function main() {
  const cfg = loadConfig();
  const log = pino({ level: cfg.logLevel, name: 'cap-worker' });
  const sql = createSql(cfg.databaseUrl);
  const redis = createRedis(cfg.redisUrl);
  const push = buildPush(cfg, sql, (msg, extra) => log.info(extra ?? {}, msg));

  const { stop } = startPoller({
    cfg,
    sql,
    redis,
    push: push.dispatcher,
    log: (msg, extra) => log.info(extra ?? {}, msg),
  });

  log.info('worker started');

  const shutdown = async (signal: string) => {
    log.info({ signal }, 'worker stopping');
    await stop();
    push.close();
    await redis.quit();
    await sql.end();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
