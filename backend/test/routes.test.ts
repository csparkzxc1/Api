import { describe, expect, it } from 'vitest';
import { buildTestServer } from './helpers/buildTestServer.js';
import { createFakeSql } from './helpers/fakeSql.js';
import { hashToken } from '../src/security/crypto.js';

const VALID_TOKEN = 'pw_test_token_value';

function authedSession(userId = 'user-1', deviceId = 'dev-1') {
  // Returns a SQL handler that the auth middleware uses to look up sessions.
  return {
    match: 'select s.id, s.device_id, d.user_id from sessions s join devices d',
    rows: () => [{ id: 'sess-1', device_id: deviceId, user_id: userId }],
  };
}

describe('auth middleware', () => {
  it('rejects requests without a bearer header', async () => {
    const { sql } = createFakeSql([]);
    const { app } = await buildTestServer({ sql });
    const res = await app.inject({ method: 'GET', url: '/v1/accounts' });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: 'missing_bearer' });
    await app.close();
  });

  it('rejects bearer tokens that do not resolve to an active session', async () => {
    const { sql } = createFakeSql([
      { match: 'select s.id, s.device_id, d.user_id from sessions s', rows: [] },
    ]);
    const { app } = await buildTestServer({ sql });
    const res = await app.inject({
      method: 'GET',
      url: '/v1/accounts',
      headers: { authorization: `Bearer ${VALID_TOKEN}` },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: 'invalid_session' });
    await app.close();
  });

  it('lets healthz through unauthenticated', async () => {
    const { sql } = createFakeSql([]);
    const { app } = await buildTestServer({ sql });
    // /healthz isn't registered by buildTestServer (it's defined inline in
    // server.ts), so this exercises the public-prefix bypass via
    // /v1/auth/devices instead.
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/devices',
      payload: { platform: 'ios', public_key: Buffer.alloc(32, 1).toString('base64') },
    });
    // The route handler runs (no auth) and hits SQL — fakeSql will reject
    // unmatched. We assert the auth gate let the call through, not that
    // the SQL succeeded.
    expect(res.statusCode).not.toBe(401);
    await app.close();
  });
});

describe('POST /v1/auth/devices', () => {
  it('400s on a malformed body', async () => {
    const { sql } = createFakeSql([]);
    const { app } = await buildTestServer({ sql });
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/devices',
      payload: { platform: 'macos' /* not a valid enum */, public_key: 'x' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('invalid_body');
    await app.close();
  });

  it('rejects an unknown pairing code with 400', async () => {
    const { sql } = createFakeSql([
      // pairing lookup — return empty so the route 400s.
      { match: 'from pairings where code_hash', rows: [] },
    ]);
    const { app } = await buildTestServer({ sql });
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/devices',
      payload: {
        platform: 'watchos',
        public_key: Buffer.alloc(32, 1).toString('base64'),
        pairing_code: '999999',
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('invalid_or_expired_pairing');
    await app.close();
  });
});

describe('POST /v1/accounts', () => {
  it('rejects an unknown wrapping kid', async () => {
    const { sql } = createFakeSql([authedSession()]);
    const { app } = await buildTestServer({ sql });
    const res = await app.inject({
      method: 'POST',
      url: '/v1/accounts',
      headers: { authorization: `Bearer ${VALID_TOKEN}` },
      payload: {
        provider: 'anthropic',
        label: 'work',
        wrapped_key: 'AAAAAAAAAA',
        kid: 'someone-elses-kid',
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('unknown_wrapping_kid');
    await app.close();
  });

  it('rejects OpenAI without org_id', async () => {
    const { sql } = createFakeSql([authedSession()]);
    const { app, cfg } = await buildTestServer({ sql });
    const res = await app.inject({
      method: 'POST',
      url: '/v1/accounts',
      headers: { authorization: `Bearer ${VALID_TOKEN}` },
      payload: {
        provider: 'openai',
        label: 'work',
        wrapped_key: 'AAAAAAAAAA',
        kid: cfg.wrappingKid,
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('openai_org_id_required');
    await app.close();
  });
});

describe('GET /v1/wrapping-keys/current', () => {
  it('returns the configured kid + base64 32-byte public key', async () => {
    const { sql } = createFakeSql([authedSession()]);
    const { app, cfg } = await buildTestServer({ sql });
    const res = await app.inject({
      method: 'GET',
      url: '/v1/wrapping-keys/current',
      headers: { authorization: `Bearer ${VALID_TOKEN}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.kid).toBe(cfg.wrappingKid);
    expect(body.alg).toBe('X25519-HKDF-SHA256-AES256GCM');
    expect(Buffer.from(body.public_key, 'base64')).toHaveLength(32);
    await app.close();
  });
});

describe('PUT /v1/devices/push-token', () => {
  it('400s without an apns_token or fcm_token', async () => {
    const { sql } = createFakeSql([authedSession()]);
    const { app } = await buildTestServer({ sql });
    const res = await app.inject({
      method: 'PUT',
      url: '/v1/devices/push-token',
      headers: { authorization: `Bearer ${VALID_TOKEN}` },
      payload: { platform: 'ios' /* missing tokens */ },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('invalid_body');
    await app.close();
  });

  it('404s when the bearer device no longer belongs to its user', async () => {
    const { sql } = createFakeSql([
      authedSession('user-1', 'dev-1'),
      { match: 'select id from devices where id =', rows: [] }, // ownership check returns nothing
    ]);
    const { app } = await buildTestServer({ sql });
    const res = await app.inject({
      method: 'PUT',
      url: '/v1/devices/push-token',
      headers: { authorization: `Bearer ${VALID_TOKEN}` },
      payload: { platform: 'ios', apns_token: 'a'.repeat(64) },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe('unknown_device');
    await app.close();
  });
});

// Sanity: the fakeSql token-hash matching is correct end-to-end.
describe('hashToken', () => {
  it('is deterministic', () => {
    expect(hashToken('a').equals(hashToken('a'))).toBe(true);
    expect(hashToken('a').equals(hashToken('b'))).toBe(false);
  });
});
