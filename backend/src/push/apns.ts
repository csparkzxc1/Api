import { connect, type ClientHttp2Session } from 'node:http2';
import type { ApnsTokenSource } from './jwt.js';

export interface ApnsPayload {
  /** APNs `aps.alert` — provide title/body for visible notifications,
   *  or set `content-available: 1` for a silent / complication push. */
  aps: Record<string, unknown>;
  [k: string]: unknown;
}

export interface ApnsSendOptions {
  deviceToken: string; // hex
  topic: string; // bundle id (+ ".complication" / ".voip" / ".watchkit")
  pushType?: 'alert' | 'background' | 'complication';
  priority?: 5 | 10;
  expiration?: number; // unix seconds
  payload: ApnsPayload;
}

export interface ApnsResult {
  status: number;
  reason?: string;
  apnsId?: string;
}

const PROD_HOST = 'https://api.push.apple.com';
const SANDBOX_HOST = 'https://api.sandbox.push.apple.com';

/**
 * Tiny APNs HTTP/2 client. One persistent session per environment; if the
 * connection drops we lazily re-open on the next call.
 */
export class ApnsClient {
  private sessions = new Map<'production' | 'sandbox', ClientHttp2Session>();
  constructor(private readonly tokenSource: ApnsTokenSource) {}

  async send(env: 'production' | 'sandbox', opts: ApnsSendOptions): Promise<ApnsResult> {
    const session = this.sessionFor(env);
    return await new Promise<ApnsResult>((resolve, reject) => {
      const headers: Record<string, string | number> = {
        ':method': 'POST',
        ':path': `/3/device/${opts.deviceToken}`,
        authorization: `bearer ${this.tokenSource.token()}`,
        'apns-topic': opts.topic,
        'content-type': 'application/json',
      };
      if (opts.pushType) headers['apns-push-type'] = opts.pushType;
      if (opts.priority) headers['apns-priority'] = opts.priority;
      if (opts.expiration) headers['apns-expiration'] = opts.expiration;
      if (opts.pushType === 'background') {
        headers['apns-priority'] = headers['apns-priority'] ?? 5;
      }

      const req = session.request(headers);
      let status = 0;
      let body = '';
      let apnsId: string | undefined;

      req.on('response', (h) => {
        status = Number(h[':status'] ?? 0);
        if (typeof h['apns-id'] === 'string') apnsId = h['apns-id'];
      });
      req.setEncoding('utf8');
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        if (status >= 200 && status < 300) {
          resolve({ status, apnsId });
        } else {
          let reason: string | undefined;
          try { reason = (JSON.parse(body) as { reason?: string }).reason; } catch { /* */ }
          resolve({ status, reason, apnsId });
        }
      });
      req.on('error', reject);
      req.end(JSON.stringify(opts.payload));
    });
  }

  close() {
    for (const s of this.sessions.values()) s.close();
    this.sessions.clear();
  }

  private sessionFor(env: 'production' | 'sandbox'): ClientHttp2Session {
    const existing = this.sessions.get(env);
    if (existing && !existing.closed && !existing.destroyed) return existing;
    const session = connect(env === 'production' ? PROD_HOST : SANDBOX_HOST);
    session.on('error', () => this.sessions.delete(env));
    session.on('close', () => this.sessions.delete(env));
    this.sessions.set(env, session);
    return session;
  }
}
