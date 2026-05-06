import { z } from 'zod';
import { loadWrappingKeyFromHex, type WrappingKeyPair } from './security/ecies.js';

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
  WRAPPING_KID: z.string().min(1),
  WRAPPING_PRIVKEY: z.string().regex(/^[0-9a-fA-F]{64}$/),

  // Push (all optional — without these the dispatcher is a no-op)
  APNS_KEY_P8: z.string().optional(),
  APNS_KEY_ID: z.string().regex(/^[A-Z0-9]{10}$/).optional(),
  APNS_TEAM_ID: z.string().regex(/^[A-Z0-9]{10}$/).optional(),
  APNS_TOPIC: z.string().optional(),
  APNS_ENVIRONMENT: z.enum(['sandbox', 'production']).default('production'),
  FCM_PROJECT_ID: z.string().optional(),
  FCM_CLIENT_EMAIL: z.string().email().optional(),
  FCM_PRIVATE_KEY: z.string().optional(),
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
  wrappingKid: string;
  wrappingKey: WrappingKeyPair;
  apns?: {
    keyP8: string;
    keyId: string;
    teamId: string;
    topic: string;
    environment: 'production' | 'sandbox';
  };
  fcm?: { projectId: string; clientEmail: string; privateKey: string };
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
    wrappingKid: parsed.WRAPPING_KID,
    wrappingKey: loadWrappingKeyFromHex(parsed.WRAPPING_PRIVKEY),
    apns:
      parsed.APNS_KEY_P8 && parsed.APNS_KEY_ID && parsed.APNS_TEAM_ID && parsed.APNS_TOPIC
        ? {
            keyP8: parsed.APNS_KEY_P8.replace(/\\n/g, '\n'),
            keyId: parsed.APNS_KEY_ID,
            teamId: parsed.APNS_TEAM_ID,
            topic: parsed.APNS_TOPIC,
            environment: parsed.APNS_ENVIRONMENT,
          }
        : undefined,
    fcm:
      parsed.FCM_PROJECT_ID && parsed.FCM_CLIENT_EMAIL && parsed.FCM_PRIVATE_KEY
        ? {
            projectId: parsed.FCM_PROJECT_ID,
            clientEmail: parsed.FCM_CLIENT_EMAIL,
            privateKey: parsed.FCM_PRIVATE_KEY.replace(/\\n/g, '\n'),
          }
        : undefined,
  };
}
