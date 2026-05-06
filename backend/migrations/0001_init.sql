create extension if not exists "pgcrypto";

create table users (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);

create table devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  platform text not null check (platform in ('ios','android','watchos','wearos','desktop')),
  device_name text,
  public_key bytea not null,
  pairing_code_hash bytea,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
create index devices_user_idx on devices(user_id) where revoked_at is null;

create table sessions (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references devices(id) on delete cascade,
  token_hash bytea not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
create index sessions_active_idx on sessions(token_hash) where revoked_at is null;

create table accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  provider text not null check (provider in ('anthropic','openai')),
  label text not null,
  org_id text,
  -- envelope-encrypted provider key
  kid text not null,
  wrapped_key bytea not null,
  status text not null default 'pending' check (status in ('pending','active','error')),
  error_message text,
  last_polled_at timestamptz,
  created_at timestamptz not null default now(),
  removed_at timestamptz
);
create index accounts_user_idx on accounts(user_id) where removed_at is null;

-- canonical, append-only usage facts. one row per (account, bucket_start, model, unit).
create table usage_facts (
  account_id uuid not null references accounts(id) on delete cascade,
  bucket_start timestamptz not null,
  bucket text not null check (bucket in ('hour','day')),
  model text not null default '',
  unit text not null check (unit in ('usd','tokens','requests')),
  value double precision not null,
  source text not null check (source in ('provider_api','desktop_agent')),
  ingested_at timestamptz not null default now(),
  primary key (account_id, bucket_start, bucket, model, unit, source)
);
create index usage_facts_account_time_idx on usage_facts(account_id, bucket_start desc);

-- raw samples coming from the desktop agent (Claude Code / Codex CLI logs)
create table agent_samples (
  id bigserial primary key,
  user_id uuid not null references users(id) on delete cascade,
  agent_id uuid not null,
  source text not null check (source in ('claude_code','codex_cli')),
  occurred_at timestamptz not null,
  model text,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cache_read_tokens integer not null default 0,
  cache_write_tokens integer not null default 0,
  cost_usd double precision not null default 0,
  ingested_at timestamptz not null default now()
);
create index agent_samples_user_time_idx on agent_samples(user_id, occurred_at desc);

create table alert_thresholds (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  scope text not null check (scope in ('provider_day','provider_month','claude_code_reset_window')),
  provider text check (provider in ('anthropic','openai')),
  percent double precision not null check (percent >= 0 and percent <= 1),
  haptic boolean not null default true,
  last_fired_at timestamptz,
  created_at timestamptz not null default now()
);
create index alert_thresholds_user_idx on alert_thresholds(user_id);

create table push_tokens (
  device_id uuid primary key references devices(id) on delete cascade,
  apns_token text,
  fcm_token text,
  updated_at timestamptz not null default now()
);
