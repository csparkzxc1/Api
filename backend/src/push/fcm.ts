import type { FcmAccessTokenSource } from './jwt.js';

export interface FcmMessage {
  token: string;
  data?: Record<string, string>;
  notification?: { title: string; body: string };
  android?: { priority?: 'NORMAL' | 'HIGH'; ttl?: string };
  apns?: { headers?: Record<string, string>; payload?: { aps: Record<string, unknown> } };
}

export interface FcmResult {
  status: number;
  name?: string;
  errorCode?: string;
  reason?: string;
}

/**
 * Tiny FCM v1 client. One method, no SDK. Authenticates with a service-account
 * access token from `FcmAccessTokenSource`.
 */
export class FcmClient {
  constructor(
    private readonly projectId: string,
    private readonly tokenSource: FcmAccessTokenSource,
  ) {}

  async send(message: FcmMessage): Promise<FcmResult> {
    const token = await this.tokenSource.token();
    const url = `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(this.projectId)}/messages:send`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ message }),
    });
    if (res.ok) {
      const json = (await res.json()) as { name: string };
      return { status: res.status, name: json.name };
    }
    let errorCode: string | undefined;
    let reason: string | undefined;
    try {
      const json = (await res.json()) as {
        error?: { status?: string; message?: string; details?: { errorCode?: string }[] };
      };
      errorCode = json.error?.details?.[0]?.errorCode;
      reason = json.error?.message ?? json.error?.status;
    } catch { /* swallow */ }
    return { status: res.status, errorCode, reason };
  }
}
