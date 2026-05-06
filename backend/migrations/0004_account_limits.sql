-- Per-account daily and monthly caps (USD or tokens) so the threshold
-- evaluator stops relying on hardcoded fallbacks. NULL = no cap.
alter table accounts
  add column if not exists daily_cap_usd double precision,
  add column if not exists monthly_cap_usd double precision,
  add column if not exists daily_cap_tokens bigint;

-- Claude Code Pro/Max 5h rolling window. The desktop agent supplies the
-- counters via `agent_samples`; the evaluator aggregates the last 5h and
-- compares to this cap.
alter table accounts
  add column if not exists reset_window_cap_tokens bigint,
  add column if not exists reset_window_seconds integer not null default 18000;
