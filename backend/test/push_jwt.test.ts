import { describe, expect, it } from 'vitest';
import { generateKeyPairSync, createPublicKey, createVerify } from 'node:crypto';
import { ApnsTokenSource } from '../src/push/jwt.js';

describe('APNs JWT', () => {
  it('produces a token verifiable with the public key', () => {
    const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const pem = privateKey.export({ format: 'pem', type: 'pkcs8' }).toString();
    const src = new ApnsTokenSource({ keyP8: pem, keyId: 'KEY1234567', teamId: 'TEAM123ABC' });
    const token = src.token();
    const [h, p, s] = token.split('.');
    const sig = Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

    // Convert JOSE r||s back to DER for OpenSSL verification.
    const r = sig.subarray(0, 32);
    const sBytes = sig.subarray(32);
    const der = derEncode(r, sBytes);

    const verify = createVerify('SHA256');
    verify.update(`${h}.${p}`);
    verify.end();
    expect(verify.verify(createPublicKey(publicKey), der)).toBe(true);

    const decoded = JSON.parse(Buffer.from(p, 'base64url').toString('utf8'));
    expect(decoded.iss).toBe('TEAM123ABC');
  });
});

function derEncode(r: Buffer, s: Buffer): Buffer {
  const trim = (b: Buffer) => {
    let i = 0;
    while (i < b.length - 1 && b[i] === 0) i++;
    let out = b.subarray(i);
    if (out[0] && (out[0] & 0x80) !== 0) out = Buffer.concat([Buffer.from([0]), out]);
    return out;
  };
  const rT = trim(r);
  const sT = trim(s);
  return Buffer.concat([
    Buffer.from([0x30, 4 + rT.length + sT.length, 0x02, rT.length]),
    rT,
    Buffer.from([0x02, sT.length]),
    sT,
  ]);
}
