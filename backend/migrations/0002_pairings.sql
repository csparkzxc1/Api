create table pairings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  issued_by_device uuid not null references devices(id) on delete cascade,
  code_hash bytea not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  consumed_by_device uuid references devices(id) on delete set null
);
create index pairings_user_idx on pairings(user_id) where consumed_at is null;
create index pairings_expires_idx on pairings(expires_at) where consumed_at is null;
