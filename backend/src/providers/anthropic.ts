import { request } from 'undici';

const BASE = 'https://api.anthropic.com';

export interface AnthropicUsageBucket {
  starting_at: string;
  ending_at: string;
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
  model?: string;
}

export interface AnthropicCostBucket {
  starting_at: string;
  ending_at: string;
  amount: { value: number; currency: string };
}

export interface FetchUsageOpts {
  adminKey: string;
  startingAt: string; // ISO
  endingAt?: string;
  bucketWidth?: '1m' | '1h' | '1d';
}

// Admin API: /v1/organizations/usage_report/messages
// https://docs.anthropic.com/en/api/admin-api/usage-cost
export async function fetchAnthropicMessageUsage(
  opts: FetchUsageOpts,
): Promise<AnthropicUsageBucket[]> {
  const url = new URL('/v1/organizations/usage_report/messages', BASE);
  url.searchParams.set('starting_at', opts.startingAt);
  if (opts.endingAt) url.searchParams.set('ending_at', opts.endingAt);
  url.searchParams.set('bucket_width', opts.bucketWidth ?? '1h');

  const out: AnthropicUsageBucket[] = [];
  let nextPage: string | undefined;
  do {
    if (nextPage) url.searchParams.set('page', nextPage);
    const res = await request(url.toString(), {
      method: 'GET',
      headers: {
        'x-api-key': opts.adminKey,
        'anthropic-version': '2023-06-01',
      },
    });
    if (res.statusCode >= 400) {
      const body = await res.body.text();
      throw new Error(`anthropic ${res.statusCode}: ${body.slice(0, 256)}`);
    }
    const json = (await res.body.json()) as {
      data?: { results?: AnthropicUsageBucket[] }[];
      next_page?: string;
    };
    for (const entry of json.data ?? []) {
      for (const bucket of entry.results ?? []) out.push(bucket);
    }
    nextPage = json.next_page;
  } while (nextPage);
  return out;
}

export async function fetchAnthropicCost(
  opts: FetchUsageOpts,
): Promise<AnthropicCostBucket[]> {
  const url = new URL('/v1/organizations/cost_report', BASE);
  url.searchParams.set('starting_at', opts.startingAt);
  if (opts.endingAt) url.searchParams.set('ending_at', opts.endingAt);
  url.searchParams.set('bucket_width', '1d');

  const res = await request(url.toString(), {
    method: 'GET',
    headers: {
      'x-api-key': opts.adminKey,
      'anthropic-version': '2023-06-01',
    },
  });
  if (res.statusCode >= 400) {
    const body = await res.body.text();
    throw new Error(`anthropic cost ${res.statusCode}: ${body.slice(0, 256)}`);
  }
  const json = (await res.body.json()) as {
    data?: { results?: AnthropicCostBucket[] }[];
  };
  const out: AnthropicCostBucket[] = [];
  for (const entry of json.data ?? []) {
    for (const r of entry.results ?? []) out.push(r);
  }
  return out;
}
