import {
  createCipheriv,
  createDecipheriv,
  createPrivateKey,
  createPublicKey,
  diffieHellman,
  generateKeyPairSync,
  hkdfSync,
  randomBytes,
  type KeyObject,
} from 'node:crypto';

// Wire format (matches CapKit/EnvelopeCipher.swift):
//   [32-byte ephemeral X25519 pubkey][12-byte iv][16-byte tag][ciphertext]
//
// HKDF salt is the wrapping pubkey, info is the constant "cap v1".
const HKDF_INFO = Buffer.from('cap v1');
const KEY_LEN = 32;
const IV_LEN = 12;
const TAG_LEN = 16;
const PUBKEY_LEN = 32;
const ALG = 'X25519-HKDF-SHA256-AES256GCM' as const;

export const WRAPPING_ALG = ALG;

export interface WrappingKeyPair {
  privateKey: KeyObject;
  publicKey: KeyObject;
  publicKeyRaw: Buffer; // 32 bytes
}

export function loadWrappingKeyFromHex(hex: string): WrappingKeyPair {
  const raw = Buffer.from(hex, 'hex');
  if (raw.length !== KEY_LEN) {
    throw new Error(`WRAPPING_PRIVKEY must be ${KEY_LEN} bytes (got ${raw.length})`);
  }
  // Build a PKCS#8 X25519 private-key DER manually (header + raw).
  const pkcs8 = Buffer.concat([
    Buffer.from('302e020100300506032b656e04220420', 'hex'),
    raw,
  ]);
  const privateKey = createPrivateKey({ key: pkcs8, format: 'der', type: 'pkcs8' });
  const publicKey = createPublicKey(privateKey);
  const spki = publicKey.export({ format: 'der', type: 'spki' });
  const publicKeyRaw = Buffer.from(spki.subarray(spki.length - KEY_LEN));
  return { privateKey, publicKey, publicKeyRaw };
}

export function generateWrappingKey(): { privHex: string; pubBase64: string } {
  const { privateKey } = generateKeyPairSync('x25519');
  const der = privateKey.export({ format: 'der', type: 'pkcs8' }) as Buffer;
  const raw = der.subarray(der.length - KEY_LEN);
  const kp = loadWrappingKeyFromHex(raw.toString('hex'));
  return {
    privHex: raw.toString('hex'),
    pubBase64: kp.publicKeyRaw.toString('base64'),
  };
}

function rawToSpki(raw: Buffer): Buffer {
  if (raw.length !== KEY_LEN) throw new Error('bad ephemeral pubkey length');
  return Buffer.concat([Buffer.from('302a300506032b656e032100', 'hex'), raw]);
}

export function decapsulate(kp: WrappingKeyPair, wrapped: Buffer): Buffer {
  if (wrapped.length < PUBKEY_LEN + IV_LEN + TAG_LEN) {
    throw new Error('wrapped payload too short');
  }
  const ephemeralRaw = wrapped.subarray(0, PUBKEY_LEN);
  const iv = wrapped.subarray(PUBKEY_LEN, PUBKEY_LEN + IV_LEN);
  const tag = wrapped.subarray(PUBKEY_LEN + IV_LEN, PUBKEY_LEN + IV_LEN + TAG_LEN);
  const ct = wrapped.subarray(PUBKEY_LEN + IV_LEN + TAG_LEN);

  const ephemeralPub = createPublicKey({
    key: rawToSpki(ephemeralRaw),
    format: 'der',
    type: 'spki',
  });
  const shared = diffieHellman({ privateKey: kp.privateKey, publicKey: ephemeralPub });

  const salt = kp.publicKeyRaw;
  const okm = Buffer.from(hkdfSync('sha256', shared, salt, HKDF_INFO, KEY_LEN));

  const decipher = createDecipheriv('aes-256-gcm', okm, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]);
}

// Test helper: encapsulate the same way the iOS client does. Used in unit tests.
export function encapsulate(recipientPubRaw: Buffer, plaintext: Buffer): Buffer {
  const { privateKey: ephPriv, publicKey: ephPub } = generateKeyPairSync('x25519');
  const ephRawDer = ephPub.export({ format: 'der', type: 'spki' }) as Buffer;
  const ephRaw = ephRawDer.subarray(ephRawDer.length - KEY_LEN);

  const recipientPub = createPublicKey({
    key: rawToSpki(recipientPubRaw),
    format: 'der',
    type: 'spki',
  });
  const shared = diffieHellman({ privateKey: ephPriv, publicKey: recipientPub });
  const okm = Buffer.from(hkdfSync('sha256', shared, recipientPubRaw, HKDF_INFO, KEY_LEN));

  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv('aes-256-gcm', okm, iv);
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([ephRaw, iv, tag, ct]);
}
