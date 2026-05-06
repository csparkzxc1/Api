import type { Sql } from '../db/client.js';
import type { ApnsClient } from './apns.js';
import type { FcmClient } from './fcm.js';

export interface PushPayload {
  title: string;
  body: string;
  /** Hint to the watch surface that the complication should refresh now. */
  refreshComplications?: boolean;
  data?: Record<string, string>;
}

export interface PushDispatcher {
  send(userId: string, payload: PushPayload): Promise<void>;
}

export interface PushDispatcherDeps {
  sql: Sql;
  apns?: { client: ApnsClient; topic: string; environment: 'production' | 'sandbox' };
  fcm?: FcmClient;
  log?: (msg: string, extra?: Record<string, unknown>) => void;
}

interface PushTokenRow {
  device_id: string;
  platform: 'ios' | 'watchos' | 'android' | 'wearos' | null;
  apns_token: string | null;
  apns_environment: 'production' | 'sandbox' | null;
  fcm_token: string | null;
}

const APNS_INVALID_REASONS = new Set([
  'BadDeviceToken',
  'Unregistered',
  'DeviceTokenNotForTopic',
  'TopicDisallowed',
]);

const FCM_INVALID_CODES = new Set([
  'UNREGISTERED',
  'INVALID_ARGUMENT',
  'NOT_FOUND',
  'SENDER_ID_MISMATCH',
]);

export class DefaultPushDispatcher implements PushDispatcher {
  constructor(private readonly deps: PushDispatcherDeps) {}

  async send(userId: string, payload: PushPayload): Promise<void> {
    const { sql, apns, fcm, log } = this.deps;
    const rows = await sql<PushTokenRow[]>`
      select pt.device_id, pt.platform, pt.apns_token, pt.apns_environment, pt.fcm_token
      from push_tokens pt
      join devices d on d.id = pt.device_id
      where d.user_id = ${userId}
        and d.revoked_at is null
        and pt.invalidated_at is null
    `;

    await Promise.all(rows.map(async (row) => {
      try {
        if (row.apns_token && apns) {
          const env = row.apns_environment ?? apns.environment;
          const result = await apns.client.send(env, {
            deviceToken: row.apns_token,
            topic: apns.topic,
            pushType: 'alert',
            priority: 10,
            payload: {
              aps: {
                alert: { title: payload.title, body: payload.body },
                sound: 'default',
                'mutable-content': 1,
                'content-available': payload.refreshComplications ? 1 : undefined,
              },
              ...(payload.data ?? {}),
            },
          });
          if (result.status >= 400) {
            await this.maybeInvalidate(row.device_id, result.reason, APNS_INVALID_REASONS);
            log?.('apns-error', { device: row.device_id, status: result.status, reason: result.reason });
          }
        }
        if (row.fcm_token && fcm) {
          const result = await fcm.send({
            token: row.fcm_token,
            notification: { title: payload.title, body: payload.body },
            android: { priority: 'HIGH' },
            data: payload.data,
          });
          if (result.status >= 400) {
            await this.maybeInvalidate(row.device_id, result.errorCode, FCM_INVALID_CODES);
            log?.('fcm-error', { device: row.device_id, status: result.status, code: result.errorCode });
          }
        }
      } catch (err) {
        log?.('push-failed', { device: row.device_id, err: (err as Error).message });
      }
    }));
  }

  private async maybeInvalidate(deviceId: string, reason: string | undefined, set: Set<string>) {
    if (!reason || !set.has(reason)) return;
    await this.deps.sql`
      update push_tokens
      set invalidated_at = now(), last_error = ${reason}
      where device_id = ${deviceId}
    `;
  }
}

export class NullPushDispatcher implements PushDispatcher {
  async send(): Promise<void> { /* push not configured */ }
}
