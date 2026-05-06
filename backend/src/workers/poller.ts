import { Queue, Worker, type Job } from 'bullmq';
import type { Redis } from 'ioredis';
import type { Sql } from '../db/client.js';
import type { Config } from '../config.js';
import { QUEUE_POLL, type PollJob } from '../queues.js';
import { unwrapDataKey } from '../security/crypto.js';
import {
  fetchAnthropicCost,
  fetchAnthropicMessageUsage,
} from '../providers/anthropic.js';
import { fetchOpenAICost, fetchOpenAIUsage } from '../providers/openai.js';
import type { PushDispatcher } from '../push/dispatcher.js';
import { evaluateForUser } from '../push/thresholds.js';

interface AccountRow {
  id: string;
  user_id: string;
  provider: 'anthropic' | 'openai';
  org_id: string | null;
  kid: string;
  wrapped_key: Buffer;
  last_polled_at: Date | null;
}

interface UsageFact {
  account_id: string;
  bucket_start: Date;
  bucket: 'hour' | 'day';
  model: string;
  unit: 'usd' | 'tokens' | 'requests';
  value: number;
  source: 'provider_api' | 'desktop_agent';
}

const HOUR_MS = 3600 * 1000;
const POLL_LOOKBACK_HOURS = 36; // re-fetch a window so late-arriving buckets are captured

export interface PollerDeps {
  cfg: Config;
  sql: Sql;
  redis: Redis;
  push: PushDispatcher;
  log: (msg: string, extra?: Record<string, unknown>) => void;
}

export function startPoller(deps: PollerDeps): { worker: Worker<PollJob>; stop: () => Promise<void> } {
  const { cfg, sql, redis, log } = deps;

  const queue = new Queue<PollJob>(QUEUE_POLL, { connection: redis });
  const worker = new Worker<PollJob>(
    QUEUE_POLL,
    async (job) => pollOnce(job, deps),
    {
      connection: redis,
      concurrency: 4,
      limiter: { max: 10, duration: 1000 },
    },
  );

  worker.on('failed', (job, err) => {
    log('poll-failed', { jobId: job?.id, err: err.message });
  });

  // Periodic scheduler: enqueue all due accounts once per minute. Each job's
  // jobId is bucketed to the configured interval, so duplicate scheduling is a
  // no-op even when multiple worker processes are running.
  const scheduler = setInterval(() => {
    void scheduleDue(cfg, sql, async (accountId) => {
      const bucket = Math.floor(Date.now() / (cfg.pollIntervalSec * 1000));
      try {
        await queue.add(
          'poll-account',
          { accountId, reason: 'scheduled' },
          {
            jobId: `acct:${accountId}:sched:${bucket}`,
            removeOnComplete: 100,
            removeOnFail: 50,
            delay: Math.floor(Math.random() * cfg.pollJitterSec * 1000),
          },
        );
      } catch (err) {
        log('schedule-failed', { accountId, err: (err as Error).message });
      }
    });
  }, 60_000);

  return {
    worker,
    stop: async () => {
      clearInterval(scheduler);
      await worker.close();
      await queue.close();
    },
  };
}

async function scheduleDue(cfg: Config, sql: Sql, enqueue: (id: string) => Promise<void>) {
  const due = await sql<{ id: string }[]>`
    select id from accounts
    where removed_at is null
      and status <> 'error'
      and (last_polled_at is null
           or last_polled_at < now() - make_interval(secs => ${cfg.pollIntervalSec}))
    limit 200
  `;
  for (const row of due) await enqueue(row.id);
}

async function pollOnce(job: Job<PollJob>, deps: PollerDeps) {
  const { cfg, sql, log } = deps;
  const { accountId } = job.data;

  const rows = await sql<AccountRow[]>`
    select id, user_id, provider, org_id, kid, wrapped_key, last_polled_at
    from accounts where id = ${accountId} and removed_at is null
  `;
  const account = rows[0];
  if (!account) return;

  let providerKey: Buffer;
  try {
    providerKey = unwrapDataKey(cfg, account.kid, account.wrapped_key);
  } catch (err) {
    await markError(sql, account.id, `unwrap_failed: ${(err as Error).message}`);
    return;
  }

  const lookbackStart = new Date(Date.now() - POLL_LOOKBACK_HOURS * HOUR_MS);

  try {
    const facts: UsageFact[] = [];
    if (account.provider === 'anthropic') {
      facts.push(...(await collectAnthropic(account, providerKey, lookbackStart)));
    } else {
      if (!account.org_id) throw new Error('openai_org_missing');
      facts.push(...(await collectOpenAI(account, providerKey, account.org_id, lookbackStart)));
    }
    if (facts.length > 0) await upsertFacts(sql, facts);
    await sql`
      update accounts
      set last_polled_at = now(), status = 'active', error_message = null
      where id = ${account.id}
    `;
    log('poll-ok', { accountId: account.id, count: facts.length });

    if (facts.length > 0) {
      try {
        await evaluateForUser({ sql, push: deps.push, log }, account.user_id);
      } catch (err) {
        log('threshold-eval-failed', { userId: account.user_id, err: (err as Error).message });
      }
    }
  } catch (err) {
    await markError(sql, account.id, (err as Error).message.slice(0, 500));
    throw err;
  } finally {
    providerKey.fill(0);
  }
}

async function markError(sql: Sql, id: string, message: string) {
  await sql`
    update accounts
    set status = 'error', error_message = ${message}, last_polled_at = now()
    where id = ${id}
  `;
}

async function collectAnthropic(
  account: AccountRow,
  adminKey: Buffer,
  start: Date,
): Promise<UsageFact[]> {
  const startingAt = start.toISOString();
  const usage = await fetchAnthropicMessageUsage({
    adminKey: adminKey.toString('utf8'),
    startingAt,
    bucketWidth: '1h',
  });
  const cost = await fetchAnthropicCost({
    adminKey: adminKey.toString('utf8'),
    startingAt,
    bucketWidth: '1d',
  });

  const facts: UsageFact[] = [];
  for (const b of usage) {
    const t = new Date(b.starting_at);
    const tokens = (b.input_tokens ?? 0) + (b.output_tokens ?? 0);
    if (tokens > 0) {
      facts.push({
        account_id: account.id,
        bucket_start: t,
        bucket: 'hour',
        model: b.model ?? '',
        unit: 'tokens',
        value: tokens,
        source: 'provider_api',
      });
    }
  }
  for (const b of cost) {
    facts.push({
      account_id: account.id,
      bucket_start: new Date(b.starting_at),
      bucket: 'day',
      model: '',
      unit: 'usd',
      value: b.amount.value,
      source: 'provider_api',
    });
  }
  return facts;
}

async function collectOpenAI(
  account: AccountRow,
  apiKey: Buffer,
  orgId: string,
  start: Date,
): Promise<UsageFact[]> {
  const startTime = Math.floor(start.getTime() / 1000);
  const usage = await fetchOpenAIUsage({
    apiKey: apiKey.toString('utf8'),
    orgId,
    startTime,
    bucketWidth: '1h',
  });
  const cost = await fetchOpenAICost({
    apiKey: apiKey.toString('utf8'),
    orgId,
    startTime,
    bucketWidth: '1d',
  });

  const facts: UsageFact[] = [];
  for (const b of usage) {
    const t = new Date(b.start_time * 1000);
    for (const r of b.results ?? []) {
      const tokens = (r.input_tokens ?? 0) + (r.output_tokens ?? 0);
      if (tokens > 0) {
        facts.push({
          account_id: account.id,
          bucket_start: t,
          bucket: 'hour',
          model: r.model ?? '',
          unit: 'tokens',
          value: tokens,
          source: 'provider_api',
        });
      }
      if ((r.num_model_requests ?? 0) > 0) {
        facts.push({
          account_id: account.id,
          bucket_start: t,
          bucket: 'hour',
          model: r.model ?? '',
          unit: 'requests',
          value: r.num_model_requests!,
          source: 'provider_api',
        });
      }
    }
  }
  for (const b of cost) {
    const t = new Date(b.start_time * 1000);
    let total = 0;
    for (const r of b.results ?? []) total += r.amount.value;
    if (total > 0) {
      facts.push({
        account_id: account.id,
        bucket_start: t,
        bucket: 'day',
        model: '',
        unit: 'usd',
        value: total,
        source: 'provider_api',
      });
    }
  }
  return facts;
}

async function upsertFacts(sql: Sql, facts: UsageFact[]) {
  const chunkSize = 500;
  for (let i = 0; i < facts.length; i += chunkSize) {
    const chunk = facts.slice(i, i + chunkSize);
    await sql`
      insert into usage_facts ${sql(
        chunk,
        'account_id',
        'bucket_start',
        'bucket',
        'model',
        'unit',
        'value',
        'source',
      )}
      on conflict (account_id, bucket_start, bucket, model, unit, source)
      do update set value = excluded.value, ingested_at = now()
    `;
  }
}
