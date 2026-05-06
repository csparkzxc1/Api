# PulseWatch iOS / watchOS (M2 + M3)

SwiftUI phone app with a paired watchOS target.

## Targets

- `PulseWatch` — iOS 17+ phone app (SwiftUI + Combine)
- `PulseWatchWatch Watch App` — watchOS 10+ companion (SwiftUI + WidgetKit)
- `PulseWatchKit` — shared Swift package: API client, key vault, models

## Key vault

`PulseWatchKit/Sources/Vault` uses the iOS Keychain (`kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`) and a per-account X25519 key. Provider API keys are encrypted with libsodium `crypto_secretbox` and the resulting ciphertext is uploaded as `wrapped_key` per `openapi.yaml`.

## Watch updates

- Complications: `WidgetKit` timeline entries refreshed every 15 minutes by `BGAppRefreshTask`.
- Push: `PKPushRegistry` on the phone forwards to the watch via `WCSession.transferUserInfo` so the complication can refresh on threshold-fire events without keeping the watch awake.

Implementation lands in M2/M3.
