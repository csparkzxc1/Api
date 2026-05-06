import { request } from 'undici';

const BASE = 'https://api.openai.com';

export interface OpenAIUsageBucket {
  start_time: number; // unix seconds
  end_time: number;
  results?: {
    input_tokens?: number;
    output_tokens?: number;
    num_model_requests?: number;
    model?: string;
  }[];
}

export interface OpenAICostBucket {
  start_time: number;
  end_time: number;
  results?: { amount: { value: number; currency: string } }[];
}

export interface OpenAIFetchOpts {
  apiKey: string; // sk-admin-... for /organization/usage|costs
  orgId: string;
  startTime: number; // unix seconds
  endTime?: number;
  bucketWidth?: '1m' | '1h' | '1d';
}

// Usage API: /v1/organization/usage/completions and friends
// https://platform.openai.com/docs/api-reference/usage
export async function fetchOpenAIUsage(opts: OpenAIFetchOpts): Promise<OpenAIUsageBucket[]> {
  const url = new URL('/v1/organization/usage/completions', BASE);
  url.searchParams.set('start_time', String(opts.startTime));
  if (opts.endTime) url.searchParams.set('end_time', String(opts.endTime));
  url.searchParams.set('bucket_width', opts.bucketWidth ?? '1h');
  url.searchParams.set('group_by', 'model');

  const out: OpenAIUsageBucket[] = [];
  let page: string | undefined;
  do {
    if (page) url.searchParams.set('page', page);
    const res = await request(url.toString(), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${opts.apiKey}`,
        'OpenAI-Organization': opts.orgId,
      },
    });
    if (res.statusCode >= 400) {
      const body = await res.body.text();
      throw new Error(`openai usage ${res.statusCode}: ${body.slice(0, 256)}`);
    }
    const json = (await res.body.json()) as {
      data?: OpenAIUsageBucket[];
      next_page?: string;
    };
    for (const b of json.data ?? []) out.push(b);
    page = json.next_page;
  } while (page);
  return out;
}

export async function fetchOpenAICost(opts: OpenAIFetchOpts): Promise<OpenAICostBucket[]> {
  const url = new URL('/v1/organization/costs', BASE);
  url.searchParams.set('start_time', String(opts.startTime));
  if (opts.endTime) url.searchParams.set('end_time', String(opts.endTime));
  url.searchParams.set('bucket_width', '1d');

  const res = await request(url.toString(), {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      'OpenAI-Organization': opts.orgId,
    },
  });
  if (res.statusCode >= 400) {
    const body = await res.body.text();
    throw new Error(`openai cost ${res.statusCode}: ${body.slice(0, 256)}`);
  }
  const json = (await res.body.json()) as { data?: OpenAICostBucket[] };
  return json.data ?? [];
}
