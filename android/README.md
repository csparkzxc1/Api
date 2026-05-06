# PulseWatch Android / Wear OS (M4)

Compose phone app with a Wear OS Tile + Watch Face Complication module.

## Modules

- `:app` — phone app (Compose, Hilt, Retrofit)
- `:wear` — Wear OS app with `androidx.wear.tiles` and `androidx.wear.protolayout`
- `:core` — shared Kotlin module: API DTOs (mirrors `shared-types/`), key vault, sync

## Key vault

Provider API keys are encrypted via Tink AEAD with a key in `EncryptedSharedPreferences` (StrongBox-backed when available). Only the ciphertext + kid are uploaded.

## Tile freshness

`TileService.onTileRequest` returns a `Tile` with a `freshnessIntervalMillis` of 60s; updates pushed via FCM data-only messages call `TileService.getUpdater().requestUpdate(...)`.

Implementation lands in M4.
