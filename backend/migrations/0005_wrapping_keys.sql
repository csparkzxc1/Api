-- Wrapping keypair registry. The phone fetches the active public key via
-- /v1/wrapping-keys/current and encapsulates provider API keys to it; the
-- backend decapsulates with the matching private key. The table makes the
-- key set DB-driven so rotation no longer requires a config redeploy.
-- The initial keypair is seeded by `db/migrate.ts` from the
-- WRAPPING_KID / WRAPPING_PRIVKEY env vars (idempotent on kid).
create table if not exists wrapping_keys (
  kid text primary key,
  alg text not null,
  public_key bytea not null,
  private_key bytea not null,
  created_at timestamptz not null default now(),
  retired_at timestamptz
);

create index if not exists wrapping_keys_active_idx
  on wrapping_keys(created_at desc) where retired_at is null;
