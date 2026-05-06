import { describe, expect, it } from 'vitest';
import { wrapDataKey, unwrapDataKey } from '../src/security/crypto.js';
import { generateWrappingKey, loadWrappingKeyFromHex } from '../src/security/ecies.js';
import type { Config } from '../src/config.js';

function makeCfg(): Config {
  const { privHex } = generateWrappingKey();
  return {
    nodeEnv: 'test',
    port: 0,
    logLevel: 'fatal',
    databaseUrl: 'postgres://x',
    redisUrl: 'redis://x',
    kekKid: 'k1',
    kekKeys: new Map<string, Buffer>([
      ['k1', Buffer.alloc(32, 7)],
      ['k2', Buffer.alloc(32, 9)],
    ]),
    pollIntervalSec: 600,
    pollJitterSec: 0,
    corsOrigin: [],
    wrappingKid: 'wrap-test',
    wrappingKey: loadWrappingKeyFromHex(privHex),
  };
}

describe('envelope crypto', () => {
  it('round-trips via current kid', () => {
    const cfg = makeCfg();
    const plain = Buffer.from('sk-ant-api03-fake');
    const { kid, ciphertext } = wrapDataKey(cfg, plain);
    expect(kid).toBe('k1');
    const out = unwrapDataKey(cfg, kid, ciphertext);
    expect(out.equals(plain)).toBe(true);
  });

  it('rejects unknown kid', () => {
    const cfg = makeCfg();
    const plain = Buffer.from('sk');
    const { ciphertext } = wrapDataKey(cfg, plain);
    expect(() => unwrapDataKey(cfg, 'k-missing', ciphertext)).toThrow(/unknown kid/);
  });

  it('detects tampering via GCM tag', () => {
    const cfg = makeCfg();
    const plain = Buffer.from('sk');
    const { kid, ciphertext } = wrapDataKey(cfg, plain);
    const last = ciphertext.length - 1;
    ciphertext[last] = (ciphertext[last] ?? 0) ^ 1;
    expect(() => unwrapDataKey(cfg, kid, ciphertext)).toThrow();
  });
});
