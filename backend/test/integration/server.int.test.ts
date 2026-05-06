/**
 * End-to-end integration test that spins up real Postgres + Redis via
 * testcontainers and exercises the public API contract:
 *   1. Enroll a phone (`POST /v1/auth/devices`).
 *   2. Fetch the wrapping public key.
 *   3. ECIES-wrap a fake provider key and create an account
 *      (`POST /v1/accounts`).
 *   4. Inspect the DB to confirm:
 *      - the wrapped_key on disk is NOT the plaintext (re-wrapped under KEK)
 *      - unwrapping with KEK yields the original plaintext
 *   5. Pair a watch with `POST /v1/auth/pairings` + a second
 *      `POST /v1/auth/devices` and confirm both devices share user_id.
 *   6. Register an APNs push token with `PUT /v1/devices/push-token`.
 *   7. Insert synthetic usage_facts and verify GET /v1/usage/summary
 *      aggregates them correctly.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import { buildServer } from '../../src/server.js';
import { encapsulate, generateWrappingKey, loadWrappingKeyFromHex } from '../../src/security/ecies.js';
import { unwrapDataKey } from '../../src/security/crypto.js';
import { loadConfig } from '../../src/config.js';

let pg: StartedPostgreSqlContainer;
let redis: StartedRedisContainer;
let server: Awaited<ReturnType<typeof buildServer>>;
let baseUrl: string;
const wrap = generateWrappingKey();

beforeAll(async () => {
  pg = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('pulsewatch_test')
    .withUsername('pulsewatch')
    .withPassword('pulsewatch')
    .start();
  redis = await new RedisContainer('redis:7-alpine').start();

  process.env.NODE_ENV = 'test';
  process.env.LOG_LEVEL = 'fatal';
  process.env.DATABASE_URL = pg.getConnectionUri();
  process.env.REDIS_URL = redis.getConnectionUrl();
  process.env.KEK_KID = 'k1';
  process.env.KEK_KEYS = `k1:${'00'.repeat(32)}`;
  process.env.WRAPPING_KID = 'w1';
  process.env.WRAPPING_PRIVKEY = wrap.privHex;
  process.env.PORT = '0';

  // Apply migrations.
  const sql = postgres(process.env.DATABASE_URL!);
  const here = path.dirname(fileURLToPath(import.meta.url));
  const migrationsDir = path.join(here, '..', '..', 'migrations');
  const files = (await readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort();
  for (const f of files) {
    const ddl = await readFile(path.join(migrationsDir, f), 'utf8');
    await sql.unsafe(ddl);
  }
  await sql.end();

  server = await buildServer();
  await server.app.listen({ host: '127.0.0.1', port: 0 });
  const addr = server.app.server.address();
  if (typeof addr === 'object' && addr) baseUrl = `http://127.0.0.1:${addr.port}`;
}, 120_000);

afterAll(async () => {
  await server?.app.close();
  await pg?.stop();
  await redis?.stop();
}, 60_000);

async function jsonReq(
  method: string, path: string, body?: unknown, token?: string,
): Promise<{ status: number; body: any }> {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return {
    status: res.status,
    body: text ? JSON.parse(text) : undefined,
  };
}

describe('integration: full enrollment + provider key flow', () => {
  let phoneToken: string;
  let phoneDeviceId: string;
  let accountId: string;
  let userId: string;

  it('enrolls a phone', async () => {
    const r = await jsonReq('POST', '/v1/auth/devices', {
      platform: 'ios',
      public_key: Buffer.alloc(32, 1).toString('base64'),
      device_name: 'Test iPhone',
    });
    expect(r.status).toBe(201);
    expect(r.body.token).toMatch(/^pw_/);
    phoneToken = r.body.token;
    phoneDeviceId = r.body.device_id;
  });

  it('returns the wrapping public key', async () => {
    const r = await jsonReq('GET', '/v1/wrapping-keys/current', undefined, phoneToken);
    expect(r.status).toBe(200);
    expect(r.body.kid).toBe('w1');
    expect(r.body.alg).toBe('X25519-HKDF-SHA256-AES256GCM');
    expect(Buffer.from(r.body.public_key, 'base64')).toHaveLength(32);
  });

  it('creates an account; on disk the key is re-wrapped under KEK', async () => {
    const recipient = loadWrappingKeyFromHex(wrap.privHex).publicKeyRaw;
    const plaintext = Buffer.from('sk-ant-admin01-real-secret-' + 'x'.repeat(40));
    const envelope = encapsulate(recipient, plaintext);

    const r = await jsonReq('POST', '/v1/accounts', {
      provider: 'anthropic',
      label: 'work',
      wrapped_key: envelope.toString('base64'),
      kid: 'w1',
    }, phoneToken);
    expect(r.status).toBe(201);
    accountId = r.body.id;

    // Inspect the DB: the stored wrapped_key must NOT contain plaintext bytes,
    // and unwrapping with KEK must yield the original plaintext.
    const sql = postgres(process.env.DATABASE_URL!);
    const rows = await sql<{ user_id: string; kid: string; wrapped_key: Buffer }[]>`
      select user_id, kid, wrapped_key from accounts where id = ${accountId}
    `;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.kid).toBe('k1'); // KEK kid, not wrapping kid
    expect(rows[0]!.wrapped_key.includes(plaintext)).toBe(false);
    userId = rows[0]!.user_id;

    const cfg = loadConfig();
    const out = unwrapDataKey(cfg, rows[0]!.kid, rows[0]!.wrapped_key);
    expect(out.equals(plaintext)).toBe(true);
    await sql.end();
  });

  it('pairs a watch into the same user via 6-digit code', async () => {
    const pair = await jsonReq('POST', '/v1/auth/pairings', undefined, phoneToken);
    expect(pair.status).toBe(201);
    expect(pair.body.code).toMatch(/^\d{6}$/);

    const watchEnroll = await jsonReq('POST', '/v1/auth/devices', {
      platform: 'watchos',
      public_key: Buffer.alloc(32, 2).toString('base64'),
      pairing_code: pair.body.code,
      device_name: 'Test Watch',
    });
    expect(watchEnroll.status).toBe(201);
    expect(watchEnroll.body.device_id).not.toBe(phoneDeviceId);

    // Both devices must share user_id.
    const sql = postgres(process.env.DATABASE_URL!);
    const rows = await sql<{ id: string; user_id: string }[]>`
      select id, user_id from devices where id in (${phoneDeviceId}, ${watchEnroll.body.device_id})
    `;
    expect(rows.map((r) => r.user_id).every((u) => u === userId)).toBe(true);
    await sql.end();
  });

  it('rejects an already-consumed pairing code', async () => {
    const pair = await jsonReq('POST', '/v1/auth/pairings', undefined, phoneToken);
    const a = await jsonReq('POST', '/v1/auth/devices', {
      platform: 'wearos',
      public_key: Buffer.alloc(32, 3).toString('base64'),
      pairing_code: pair.body.code,
    });
    expect(a.status).toBe(201);
    const b = await jsonReq('POST', '/v1/auth/devices', {
      platform: 'wearos',
      public_key: Buffer.alloc(32, 4).toString('base64'),
      pairing_code: pair.body.code,
    });
    expect(b.status).toBe(400);
  });

  it('stores an APNs push token for the phone', async () => {
    const r = await jsonReq('PUT', '/v1/devices/push-token', {
      platform: 'ios',
      apns_token: 'a'.repeat(64),
      apns_environment: 'sandbox',
    }, phoneToken);
    expect(r.status).toBe(204);

    const sql = postgres(process.env.DATABASE_URL!);
    const rows = await sql<{ apns_token: string; platform: string }[]>`
      select apns_token, platform from push_tokens where device_id = ${phoneDeviceId}
    `;
    expect(rows[0]!.platform).toBe('ios');
    expect(rows[0]!.apns_token).toBe('a'.repeat(64));
    await sql.end();
  });

  it('aggregates usage_facts in /v1/usage/summary', async () => {
    const sql = postgres(process.env.DATABASE_URL!);
    const today = new Date();
    today.setUTCHours(12, 0, 0, 0);
    await sql`
      insert into usage_facts (account_id, bucket_start, bucket, model, unit, value, source)
      values
        (${accountId}, ${today}, 'hour', 'claude-sonnet', 'tokens', 12345, 'provider_api'),
        (${accountId}, ${today}, 'day', '', 'usd', 4.20, 'provider_api')
    `;
    await sql.end();

    const r = await jsonReq('GET', '/v1/usage/summary?window=day', undefined, phoneToken);
    expect(r.status).toBe(200);
    const tokens = r.body.providers.find((p: any) => p.unit === 'tokens');
    const usd = r.body.providers.find((p: any) => p.unit === 'usd');
    expect(tokens.used).toBe(12345);
    expect(usd.used).toBeCloseTo(4.20);
  });

  it('refuses unauthenticated calls', async () => {
    const r = await jsonReq('GET', '/v1/usage/summary');
    expect(r.status).toBe(401);
  });
});
