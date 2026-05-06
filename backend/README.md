# PulseWatch Backend

Fastify + TypeScript, PostgreSQL, Redis, BullMQ.

## Run locally

```bash
cp .env.example .env
docker compose up -d postgres redis  # from repo root
pnpm install                          # from repo root
pnpm --filter @pulsewatch/backend migrate
pnpm --filter @pulsewatch/backend dev          # API on :8080
pnpm --filter @pulsewatch/backend worker       # poll workers (separate terminal)
```

## Routes

See `openapi.yaml` at the repo root — also served at `GET /openapi.yaml`.

| Method | Path                                  | Notes |
|--------|---------------------------------------|-------|
| GET    | `/healthz`                            | public |
| POST   | `/v1/auth/devices`                    | enroll a device, returns bearer token |
| DELETE | `/v1/auth/devices/:id`                | revoke |
| GET    | `/v1/accounts`                        | list provider accounts |
| POST   | `/v1/accounts`                        | enroll provider account (envelope-encrypted key) |
| GET    | `/v1/accounts/:id`                    | |
| DELETE | `/v1/accounts/:id`                    | soft delete |
| POST   | `/v1/accounts/:id/refresh`            | enqueue an immediate poll |
| GET    | `/v1/usage/summary?window=`           | watch-friendly snapshot |
| GET    | `/v1/usage/series?from=&to=&bucket=`  | dashboard series |
| GET/PUT| `/v1/alerts/thresholds`               | alert thresholds |
| POST   | `/v1/agent/ingest`                    | desktop-agent log counters |

## Encryption

`KEK_KEYS` is a comma-separated list of `kid:hex32`. The current key is named
by `KEK_KID`. Wrap/unwrap is AES-256-GCM with a fresh 96-bit IV per record. Key
rotation is by appending the new entry to `KEK_KEYS` and updating `KEK_KID`;
old ciphertext keeps unwrapping with the previous kid.

In production, replace `wrapDataKey`/`unwrapDataKey` with calls to AWS KMS
`Encrypt`/`Decrypt` so the master key never leaves the HSM.

## Polling

`workers/run.ts` is a separate process. Each minute it asks the DB for accounts
whose `last_polled_at` is older than `POLL_INTERVAL_SECONDS` and enqueues one
job per account, jittered by `POLL_JITTER_SECONDS`. The worker fetches the
provider Admin/Usage APIs over a 36-hour lookback and upserts into
`usage_facts` so late-arriving buckets are reconciled.
