-- The original push_tokens table from migration 0001 lacked a couple of fields
-- the dispatcher needs: which environment APNs uses (sandbox vs production),
-- which platform the token belongs to, and a soft-delete column for tokens
-- that the provider has marked as unregistered.
alter table push_tokens
  add column if not exists platform text check (platform in ('ios','watchos','android','wearos')),
  add column if not exists apns_environment text check (apns_environment in ('sandbox','production')),
  add column if not exists last_error text,
  add column if not exists invalidated_at timestamptz;

create index if not exists push_tokens_platform_idx on push_tokens(platform) where invalidated_at is null;
