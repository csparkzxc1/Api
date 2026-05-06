import { createPrivateKey, createSign, KeyObject } from 'node:crypto';

// Minimal ES256 / RS256 JWT signer — APNs needs ES256, FCM v1 service-account
// auth tokens need RS256.

function base64url(buf: Buffer): string {
  return buf.toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function jwsSign(header: object, payload: object, key: KeyObject, alg: 'ES256' | 'RS256'): string {
  const h = base64url(Buffer.from(JSON.stringify(header)));
  const p = base64url(Buffer.from(JSON.stringify(payload)));
  const signer = alg === 'ES256' ? createSign('SHA256') : createSign('RSA-SHA256');
  signer.update(`${h}.${p}`);
  signer.end();
  const raw = Buffer.from(signer.sign(key));
  const sig = alg === 'ES256' ? derToJose(raw) : raw;
  return `${h}.${p}.${base64url(sig)}`;
}

// DER ECDSA signature → 64-byte r||s
function derToJose(der: Buffer): Buffer {
  const at = (k: number): number => {
    const v = der[k];
    if (v === undefined) throw new Error('bad DER: truncated');
    return v;
  };
  let i = 0;
  if (at(i++) !== 0x30) throw new Error('bad DER: not a sequence');
  // length (skip; could be one byte or 0x81+len for >127 bytes — both possible)
  if ((at(i) & 0x80) !== 0) i += (at(i) & 0x7f) + 1; else i++;
  if (at(i++) !== 0x02) throw new Error('bad DER: r tag');
  const rLen = at(i++);
  let r = der.subarray(i, i + rLen); i += rLen;
  if (at(i++) !== 0x02) throw new Error('bad DER: s tag');
  const sLen = at(i++);
  let s = der.subarray(i, i + sLen);
  // strip leading zero, left-pad to 32 bytes
  const norm = (buf: Buffer): Buffer => {
    while (buf.length > 32 && buf[0] === 0) buf = buf.subarray(1);
    if (buf.length < 32) buf = Buffer.concat([Buffer.alloc(32 - buf.length, 0), buf]);
    return buf;
  };
  return Buffer.concat([norm(r), norm(s)]);
}

export interface ApnsAuthOptions {
  keyP8: string; // PEM of the .p8 file
  keyId: string; // 10-char Apple key id
  teamId: string; // 10-char team id
}

export class ApnsTokenSource {
  private cached?: { token: string; expiresAt: number };
  constructor(private readonly opts: ApnsAuthOptions) {}

  token(now = Date.now()): string {
    if (this.cached && this.cached.expiresAt > now + 60_000) return this.cached.token;
    const key = createPrivateKey(this.opts.keyP8);
    const iat = Math.floor(now / 1000);
    const jwt = jwsSign(
      { alg: 'ES256', kid: this.opts.keyId, typ: 'JWT' },
      { iss: this.opts.teamId, iat },
      key,
      'ES256',
    );
    // APNs auth tokens must be refreshed at least every 60 minutes.
    this.cached = { token: jwt, expiresAt: now + 50 * 60 * 1000 };
    return jwt;
  }
}

export interface FcmAuthOptions {
  clientEmail: string;
  privateKey: string; // PEM
  scope?: string; // defaults to https://www.googleapis.com/auth/firebase.messaging
}

export class FcmAccessTokenSource {
  private cached?: { token: string; expiresAt: number };
  constructor(private readonly opts: FcmAuthOptions) {}

  async token(fetchImpl = fetch, now = Date.now()): Promise<string> {
    if (this.cached && this.cached.expiresAt > now + 60_000) return this.cached.token;
    const iat = Math.floor(now / 1000);
    const exp = iat + 3600;
    const assertion = jwsSign(
      { alg: 'RS256', typ: 'JWT' },
      {
        iss: this.opts.clientEmail,
        scope: this.opts.scope ?? 'https://www.googleapis.com/auth/firebase.messaging',
        aud: 'https://oauth2.googleapis.com/token',
        iat,
        exp,
      },
      createPrivateKey(this.opts.privateKey),
      'RS256',
    );
    const res = await fetchImpl('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }),
    });
    if (!res.ok) throw new Error(`fcm token ${res.status}: ${await res.text()}`);
    const json = (await res.json()) as { access_token: string; expires_in: number };
    this.cached = { token: json.access_token, expiresAt: now + (json.expires_in - 60) * 1000 };
    return json.access_token;
  }
}
