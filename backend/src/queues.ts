import { Queue } from 'bullmq';
import type { Redis } from 'ioredis';

export const QUEUE_POLL = 'cap:poll';

export type PollJob = {
  accountId: string;
  reason: 'scheduled' | 'manual' | 'on_create';
};

export function createPollQueue(connection: Redis): Queue<PollJob> {
  return new Queue<PollJob>(QUEUE_POLL, { connection });
}
