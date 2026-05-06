import pino from 'pino';
import { loadConfig } from '../config.js';
import { createSql } from '../db/client.js';
import { createRedis } from '../cache/redis.js';
import { startPoller } from './poller.js';

async function main() {
  const cfg = loadConfig();
  const log = pino({ level: cfg.logLevel, name: 'pulsewatch-worker' });
  const sql = createSql(cfg.databaseUrl);
  const redis = createRedis(cfg.redisUrl);

  const { stop } = startPoller({
    cfg,
    sql,
    redis,
    log: (msg, extra) => log.info(extra ?? {}, msg),
  });

  log.info('worker started');

  const shutdown = async (signal: string) => {
    log.info({ signal }, 'worker stopping');
    await stop();
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
