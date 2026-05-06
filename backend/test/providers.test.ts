/**
 * Provider client regression tests. These pin the request shape (path,
 * headers, query params) and the parser against captured fixtures of what
 * Anthropic Admin and OpenAI Usage actually return — including pagination,
 * empty buckets, and missing optional fields.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MockAgent, setGlobalDispatcher, getGlobalDispatcher } from 'undici';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  fetchAnthropicMessageUsage,
  fetchAnthropicCost,
} from '../src/providers/anthropic.js';
import { fetchOpenAIUsage, fetchOpenAICost } from '../src/providers/openai.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtures = (name: string) =>
  readFile(path.join(here, 'fixtures', name), 'utf8').then(JSON.parse);

let original: ReturnType<typeof getGlobalDispatcher>;
let agent: MockAgent;

beforeEach(() => {
  original = getGlobalDispatcher();
  agent = new MockAgent();
  agent.disableNetConnect();
  setGlobalDispatcher(agent);
});

afterEach(async () => {
  await agent.close();
  setGlobalDispatcher(original);
});

describe('Anthropic Admin usage_report/messages', () => {
  it('walks pagination and returns every bucket in order', async () => {
    const p1 = await fixtures('anthropic_usage_p1.json');
    const p2 = await fixtures('anthropic_usage_p2.json');
    const pool = agent.get('https://api.anthropic.com');
    pool
      .intercept({ path: /^\/v1\/organizations\/usage_report\/messages\?(?!.*page=).*$/ })
      .reply(200, p1, { headers: { 'content-type': 'application/json' } });
    pool
      .intercept({ path: /^\/v1\/organizations\/usage_report\/messages\?.*page=page2/ })
      .reply(200, p2, { headers: { 'content-type': 'application/json' } });

    const out = await fetchAnthropicMessageUsage({
      adminKey: 'sk-ant-admin01-test',
      startingAt: '2026-05-05T00:00:00Z',
      bucketWidth: '1h',
    });

    // 3 non-zero entries (the haiku zero-row passes through; aggregator drops it)
    expect(out.length).toBe(4);
    expect(out[0]!.model).toBe('claude-sonnet-4-6');
    expect(out[0]!.input_tokens).toBe(12000);
    expect(out[3]!.model).toBe('claude-opus-4-7');
  });

  it('sends the admin key as x-api-key header', async () => {
    const pool = agent.get('https://api.anthropic.com');
    pool
      .intercept({
        path: /^\/v1\/organizations\/usage_report\/messages/,
        headers: { 'x-api-key': 'sk-ant-admin01-magic' },
      })
      .reply(200, { data: [] });

    await fetchAnthropicMessageUsage({
      adminKey: 'sk-ant-admin01-magic',
      startingAt: '2026-05-05T00:00:00Z',
    });
    // If the header didn't match, intercept would fall through to a network
    // attempt — which we've disabled — and the call would throw.
  });

  it('fetchAnthropicCost returns flattened cost buckets', async () => {
    const cost = await fixtures('anthropic_cost.json');
    const pool = agent.get('https://api.anthropic.com');
    pool
      .intercept({ path: /^\/v1\/organizations\/cost_report/ })
      .reply(200, cost);

    const out = await fetchAnthropicCost({
      adminKey: 'sk-ant-admin01-test',
      startingAt: '2026-05-05T00:00:00Z',
    });
    expect(out).toEqual([
      {
        starting_at: '2026-05-06T00:00:00Z',
        ending_at: '2026-05-07T00:00:00Z',
        amount: { value: 14.62, currency: 'USD' },
      },
    ]);
  });

  it('surfaces a 4xx body in the thrown error', async () => {
    const pool = agent.get('https://api.anthropic.com');
    pool.intercept({ path: /^\/v1\/organizations\/usage_report\/messages/ }).reply(
      401,
      { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } },
    );
    await expect(
      fetchAnthropicMessageUsage({ adminKey: 'sk-bad', startingAt: '2026-05-05T00:00:00Z' }),
    ).rejects.toThrow(/anthropic 401/);
  });
});

describe('OpenAI Usage v1', () => {
  it('parses completions usage with multiple models per bucket', async () => {
    const usage = await fixtures('openai_usage.json');
    const pool = agent.get('https://api.openai.com');
    pool
      .intercept({
        path: /^\/v1\/organization\/usage\/completions/,
        headers: {
          authorization: 'Bearer sk-admin-test',
          'openai-organization': 'org-test',
        },
      })
      .reply(200, usage);

    const out = await fetchOpenAIUsage({
      apiKey: 'sk-admin-test',
      orgId: 'org-test',
      startTime: 1714867200,
      bucketWidth: '1h',
    });

    expect(out).toHaveLength(2);
    expect(out[0]!.results).toHaveLength(2);
    expect(out[1]!.results).toEqual([]);
  });

  it('aggregates cost across multiple result rows in a bucket', async () => {
    const cost = await fixtures('openai_cost.json');
    const pool = agent.get('https://api.openai.com');
    pool.intercept({ path: /^\/v1\/organization\/costs/ }).reply(200, cost);

    const out = await fetchOpenAICost({
      apiKey: 'sk-admin-test',
      orgId: 'org-test',
      startTime: 1714867200,
    });
    expect(out).toHaveLength(1);
    expect(out[0]!.results).toHaveLength(2);
    expect(out[0]!.results![0]!.amount.value).toBeCloseTo(4.20);
  });

  it('surfaces a 403 body in the thrown error', async () => {
    const pool = agent.get('https://api.openai.com');
    pool
      .intercept({ path: /^\/v1\/organization\/usage\/completions/ })
      .reply(403, { error: { message: 'forbidden' } });

    await expect(
      fetchOpenAIUsage({ apiKey: 'sk', orgId: 'org', startTime: 0 }),
    ).rejects.toThrow(/openai usage 403/);
  });
});
