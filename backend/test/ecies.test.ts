import { describe, expect, it } from 'vitest';
import {
  decapsulate,
  encapsulate,
  generateWrappingKey,
  loadWrappingKeyFromHex,
} from '../src/security/ecies.js';

describe('ECIES wrapping', () => {
  it('round-trips a provider key', () => {
    const { privHex } = generateWrappingKey();
    const kp = loadWrappingKeyFromHex(privHex);
    const plain = Buffer.from('sk-ant-api03-' + 'x'.repeat(80));
    const wrapped = encapsulate(kp.publicKeyRaw, plain);
    const out = decapsulate(kp, wrapped);
    expect(out.equals(plain)).toBe(true);
  });

  it('rejects a tampered ciphertext', () => {
    const { privHex } = generateWrappingKey();
    const kp = loadWrappingKeyFromHex(privHex);
    const wrapped = encapsulate(kp.publicKeyRaw, Buffer.from('sk'));
    const last = wrapped.length - 1;
    wrapped[last] = (wrapped[last] ?? 0) ^ 1;
    expect(() => decapsulate(kp, wrapped)).toThrow();
  });

  it('rejects a payload encrypted to a different recipient', () => {
    const a = loadWrappingKeyFromHex(generateWrappingKey().privHex);
    const b = loadWrappingKeyFromHex(generateWrappingKey().privHex);
    const wrapped = encapsulate(a.publicKeyRaw, Buffer.from('sk'));
    expect(() => decapsulate(b, wrapped)).toThrow();
  });
});
