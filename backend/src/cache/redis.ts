import { Redis } from 'ioredis';

export function createRedis(redisUrl: string): Redis {
  return new Redis(redisUrl, {
    maxRetriesPerRequest: null, // required by BullMQ
    enableReadyCheck: true,
  });
}
