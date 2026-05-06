import { z } from 'zod';

const KekKeyEntry = z.string().regex(/^[^:]+:[0-9a-fA-F]{64}$/);

const Schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(8080),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  KEK_KID: z.string().min(1),
  KEK_KEYS: z.string().transform((raw) =>
    raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((entry) => {
        KekKeyEntry.parse(entry);
        const idx = entry.indexOf(':');
        return [entry.slice(0, idx), Buffer.from(entry.slice(idx + 1), 'hex')] as const;
      }),
  ),
  POLL_INTERVAL_SECONDS: z.coerce.number().int().positive().default(600),
  POLL_JITTER_SECONDS: z.coerce.number().int().nonnegative().default(60),
  CORS_ORIGIN: z.string().default(''),
});

export type Config = {
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
  logLevel: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';
  databaseUrl: string;
  redisUrl: string;
  kekKid: string;
  kekKeys: Map<string, Buffer>;
  pollIntervalSec: number;
  pollJitterSec: number;
  corsOrigin: string[];
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = Schema.parse(env);
  const kekKeys = new Map<string, Buffer>(parsed.KEK_KEYS);
  if (!kekKeys.has(parsed.KEK_KID)) {
    throw new Error(`KEK_KID ${parsed.KEK_KID} is not present in KEK_KEYS`);
  }
  return {
    nodeEnv: parsed.NODE_ENV,
    port: parsed.PORT,
    logLevel: parsed.LOG_LEVEL,
    databaseUrl: parsed.DATABASE_URL,
    redisUrl: parsed.REDIS_URL,
    kekKid: parsed.KEK_KID,
    kekKeys,
    pollIntervalSec: parsed.POLL_INTERVAL_SECONDS,
    pollJitterSec: parsed.POLL_JITTER_SECONDS,
    corsOrigin: parsed.CORS_ORIGIN.split(',').map((s) => s.trim()).filter(Boolean),
  };
}
