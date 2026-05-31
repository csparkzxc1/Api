# Cap Backend

Fastify + TypeScript, PostgreSQL, Redis, BullMQ.

## Run locally

```bash
cp .env.example .env
docker compose up -d postgres redis  # from repo root
pnpm install                          # from repo root
pnpm --filter @cap-app/backend migrate
pnpm --filter @cap-app/backend dev          # API on :8080
pnpm --filter @cap-app/backend worker       # poll workers (separate terminal)
```

## Routes

See `openapi.yaml` at the repo root — also served at `GET /openapi.yaml`.

| Method | Path                                  | Notes |
|--------|---------------------------------------|-------|
| GET    | `/healthz`                            | liveness probe (public) |
| GET    | `/health`                             | liveness probe, alias of `/healthz` (Railway default) |
| GET    | `/ready`                              | readiness probe — pings Postgres + Redis, 503 on failure |
| POST   | `/v1/auth/devices`                    | enroll a device, returns bearer token |
| DELETE | `/v1/auth/devices/:id`                | revoke |
| GET    | `/v1/wrapping-keys/current`           | current ECIES public key for provider-key wrapping |
| GET    | `/v1/accounts`                        | list provider accounts |
| POST   | `/v1/accounts`                        | enroll provider account (ECIES-wrapped key) |
| GET    | `/v1/accounts/:id`                    | |
| DELETE | `/v1/accounts/:id`                    | soft delete |
| POST   | `/v1/accounts/:id/refresh`            | enqueue an immediate poll |
| GET    | `/v1/usage/summary?window=`           | watch-friendly snapshot |
| GET    | `/v1/usage/series?from=&to=&bucket=`  | dashboard series |
| GET/PUT| `/v1/alerts/thresholds`               | alert thresholds |
| POST   | `/v1/agent/ingest`                    | desktop-agent log counters |

## Encryption

Two distinct keys, two roles:

- **Wrapping key** (`WRAPPING_KID`/`WRAPPING_PRIVKEY`): X25519 keypair. The
  phone fetches the public part from `/v1/wrapping-keys/current` and encrypts
  the provider API key with `X25519-HKDF-SHA256-AES256GCM`. The plaintext
  exists on the server only on the call stack of `POST /v1/accounts` —
  decapsulated, re-wrapped under the KEK, and discarded with `Buffer.fill(0)`.
- **At-rest KEK** (`KEK_KID`/`KEK_KEYS`): AES-256-GCM key (rotatable, kid'd).
  Used by `wrapDataKey`/`unwrapDataKey` to encrypt provider keys in
  `accounts.wrapped_key`. The polling worker is the only code path that
  unwraps; the plaintext is zeroed immediately after the HTTP call.

In production, replace both with KMS-managed keys so the master material
never leaves the HSM.

## Polling

`workers/run.ts` is a separate process. Each minute it asks the DB for accounts
whose `last_polled_at` is older than `POLL_INTERVAL_SECONDS` and enqueues one
job per account, jittered by `POLL_JITTER_SECONDS`. The worker fetches the
provider Admin/Usage APIs over a 36-hour lookback and upserts into
`usage_facts` so late-arriving buckets are reconciled.

## Deployment

### Railway

Railway picks up `railway.json` at the repo root. The Dockerfile CMD runs
`db/migrate.js` before `server.js`, so schema bootstrap is automatic on every
deploy. Required env vars: `DATABASE_URL`, `REDIS_URL`, `KEK_KID`, `KEK_KEYS`,
`WRAPPING_KID`, `WRAPPING_PRIVKEY`. On first boot with the wrapping envs set,
migrate.ts seeds `wrapping_keys` idempotently.

The poll worker is **not** part of the web service. Without it, jobs accumulate
in Redis but never process — `last_polled_at` stays NULL and clients see no
usage data. To enable polling, add a second Railway service:

1. Project dashboard → **`+ New`** → **`GitHub Repo`** → same `csparkzxc1/cap`.
2. Name it `cap-worker` (or similar).
3. **Settings** → **Config-as-Code** → **Config Path**: `railway.worker.json`.
   This swaps the worker's start command to `node dist/workers/run.js` and
   drops the HTTP healthcheck (a worker has no port to probe — leaving the
   default `railway.json` config in place causes a restart loop).
4. **Settings** → **Source** → Branch: same branch as web, Auto Deploy: ON.
5. **Settings** → **Networking** → do **not** generate a public domain.
6. **Variables** → copy every var from the web service (right-click → Copy on
   the web service's Variables panel, then paste into the worker). The worker
   loads the same `loadConfig()` so it needs the full set including KEK / wrapping.
7. Deploy. Watch Deploy Logs for `worker started` — that's the ready signal.

### Fly

`fly.toml` already defines both `app` (web) and `worker` processes; `flyctl
deploy` brings them up together. Healthcheck path is `/healthz`.
