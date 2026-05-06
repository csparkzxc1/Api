import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import type { Config } from '../config.js';

// Envelope ciphertext layout: [12-byte iv][16-byte tag][ciphertext]
const IV_LEN = 12;
const TAG_LEN = 16;

export function wrapDataKey(cfg: Config, plaintext: Buffer): { kid: string; ciphertext: Buffer } {
  const key = cfg.kekKeys.get(cfg.kekKid);
  if (!key) throw new Error('current KEK missing');
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { kid: cfg.kekKid, ciphertext: Buffer.concat([iv, tag, enc]) };
}

export function unwrapDataKey(cfg: Config, kid: string, ciphertext: Buffer): Buffer {
  const key = cfg.kekKeys.get(kid);
  if (!key) throw new Error(`unknown kid ${kid}`);
  const iv = ciphertext.subarray(0, IV_LEN);
  const tag = ciphertext.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const enc = ciphertext.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]);
}

export function hashToken(token: string): Buffer {
  return createHash('sha256').update(token).digest();
}

export function safeEqual(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && timingSafeEqual(a, b);
}

export function newSessionToken(): { token: string; hash: Buffer } {
  const raw = randomBytes(32);
  const token = `pw_${raw.toString('base64url')}`;
  return { token, hash: hashToken(token) };
}
