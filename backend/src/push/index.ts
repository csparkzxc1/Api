import type { Config } from '../config.js';
import type { Sql } from '../db/client.js';
import { ApnsTokenSource, FcmAccessTokenSource } from './jwt.js';
import { ApnsClient } from './apns.js';
import { FcmClient } from './fcm.js';
import { DefaultPushDispatcher, NullPushDispatcher, type PushDispatcher } from './dispatcher.js';

export interface BuiltPush {
  dispatcher: PushDispatcher;
  close: () => void;
}

export function buildPush(
  cfg: Config,
  sql: Sql,
  log?: (msg: string, extra?: Record<string, unknown>) => void,
): BuiltPush {
  let apnsClient: ApnsClient | undefined;
  if (cfg.apns) {
    const tokenSource = new ApnsTokenSource({
      keyP8: cfg.apns.keyP8,
      keyId: cfg.apns.keyId,
      teamId: cfg.apns.teamId,
    });
    apnsClient = new ApnsClient(tokenSource);
  }

  let fcmClient: FcmClient | undefined;
  if (cfg.fcm) {
    const tokenSource = new FcmAccessTokenSource({
      clientEmail: cfg.fcm.clientEmail,
      privateKey: cfg.fcm.privateKey,
    });
    fcmClient = new FcmClient(cfg.fcm.projectId, tokenSource);
  }

  if (!apnsClient && !fcmClient) {
    return { dispatcher: new NullPushDispatcher(), close: () => {} };
  }

  const dispatcher = new DefaultPushDispatcher({
    sql,
    apns: apnsClient && cfg.apns ? {
      client: apnsClient,
      topic: cfg.apns.topic,
      environment: cfg.apns.environment,
    } : undefined,
    fcm: fcmClient,
    log,
  });

  return {
    dispatcher,
    close: () => apnsClient?.close(),
  };
}

export type { PushDispatcher } from './dispatcher.js';
