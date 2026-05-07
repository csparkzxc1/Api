# Cap Android / Wear OS

Compose phone app paired with a Wear OS app that ships a Tile and a Watch
Face Complication. Three Gradle modules, one shared crypto/API core.

## Layout

```
android/
├── settings.gradle.kts
├── build.gradle.kts
├── gradle.properties
├── gradle/libs.versions.toml      # version catalog
├── core/                          # :core — Android library
│   └── src/main/java/app/cap/core/
│       ├── api/                   # Models, ApiClient, EnrollmentFlow
│       ├── vault/                 # SessionStore (EncryptedSharedPreferences),
│       │                          # EnvelopeCipher (ECIES; BouncyCastle)
│       └── sync/                  # Data Layer paths shared with :wear
├── app/                           # :app — phone application
│   └── src/main/java/app/cap/
│       ├── CapApp.kt       # Application + service locator
│       ├── MainActivity.kt
│       ├── ui/                    # Compose: Onboarding, Dashboard, Accounts,
│       │                          # AddAccountSheet, Settings + Pair Wear
│       └── sync/WearSync.kt       # phone → wear via play-services-wearable
└── wear/                          # :wear — watch application
    └── src/main/java/app/cap/wear/
        ├── WearApp.kt             # Application
        ├── MainActivity.kt        # Compose for Wear glance
        ├── glance/GlanceScreen.kt
        ├── tile/UsageTileService.kt
        ├── complication/UsageComplicationDataSourceService.kt
        └── sync/WearDataListenerService.kt
```

## Build

```bash
cd android
./gradlew :core:test                  # ECIES round-trip
./gradlew :app:assembleDebug          # phone APK
./gradlew :wear:assembleDebug         # watch APK
```

The wrapper script `gradlew` is intentionally not committed; run
`gradle wrapper --gradle-version 8.10` once to generate it locally.

## Provider-key encryption

When the user adds an Anthropic or OpenAI account:

1. The phone fetches `GET /v1/wrapping-keys/current` → `{ kid, public_key, alg }`.
2. `EnvelopeCipher.seal` encrypts the provider key with X25519 + HKDF-SHA256 +
   AES-256-GCM. Wire format: `eph_pub(32) || iv(12) || tag(16) || ciphertext`,
   base64-encoded as `wrapped_key`.
3. The plaintext byte array is zeroed (`Arrays.fill(plaintext, 0)`) in a
   `finally` block before returning.
4. `POST /v1/accounts` ships `{ provider, label, wrapped_key, kid, org_id? }`.

Identical wire format to the iOS `EnvelopeCipher.swift` and the backend
`security/ecies.ts`. Cross-platform interoperability is covered by
`EnvelopeCipherTest` on Android and `ecies.test.ts` on the backend.

## Phone ↔ Wear pairing

1. Phone calls `POST /v1/auth/pairings` and gets a 6-digit, 5-minute,
   single-use code.
2. `WearSync.pushPairingCode(code)` writes a `PutDataItem` on
   `/cap/pairing` via `play-services-wearable`.
3. The watch's `WearDataListenerService.onDataChanged` consumes it and calls
   `POST /v1/auth/devices` with `pairing_code` so the watch joins the same
   `user_id` and gets its own bearer token.
4. The same listener service handles `/cap/session` for the
   read-only path used before the watch enrolls itself.
5. After either path, the listener triggers
   `TileService.getUpdater(...).requestUpdate(...)` and
   `ComplicationDataSourceUpdateRequester.requestUpdateAll()`.

## Tile + Complication

- Tile: `UsageTileService` renders the round Throttle face — radial halo,
  dashed dial, mono type stack — with native `android.graphics.Canvas`
  in `TileRenderer.kt`, ships it as an `InlineImageResource` (ARGB_8888),
  and hosts it inside a single proto-layout `Image` element. This is
  the only practical way to get the mockup's gradient + dashed dial
  past proto-layout's primitive set. Refresh cadence is 15 minutes
  (`freshnessIntervalMillis`); FCM pushes call `requestUpdate(...)`
  to refresh sooner on threshold breaches.
- Complication: `UsageComplicationDataSourceService` supports `SHORT_TEXT`,
  `RANGED_VALUE`, and `LONG_TEXT`. M6 will replace the
  `UPDATE_PERIOD_SECONDS` poll with FCM data-only pushes that call
  `requestUpdateAll()` immediately on threshold-fire events.
