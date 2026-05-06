# PulseWatch iOS / watchOS

SwiftUI phone app with a paired watchOS target.

## Layout

```
ios/
├── project.yml                      # XcodeGen manifest
├── PulseWatch/                      # iOS phone app target
│   ├── PulseWatchApp.swift
│   ├── AppState.swift
│   ├── Onboarding/
│   ├── Dashboard/
│   ├── Accounts/
│   ├── Settings/                    # incl. PairWatchView
│   └── Resources/
├── PulseWatchWatch/                 # watchOS app target
│   ├── PulseWatchWatchApp.swift
│   ├── WatchAppState.swift
│   ├── GlanceView.swift
│   └── Resources/
├── PulseWatchComplications/         # watchOS WidgetKit extension
│   ├── PulseWatchComplications.swift  # WidgetBundle
│   ├── UsageProvider.swift            # TimelineProvider
│   ├── UsageComplication.swift        # 4 supported families
│   └── Resources/
└── PulseWatchKit/                   # Swift Package
    ├── Package.swift
    └── Sources/
        ├── PulseWatchModels/        # Codable DTOs mirroring openapi.yaml
        ├── PulseWatchVault/         # Keychain, EnvelopeCipher, SessionStore
        ├── PulseWatchSync/          # WatchConnectivity helper
        └── PulseWatchAPI/           # APIClient + EnrollmentFlow
```

## Generate the Xcode project

```bash
brew install xcodegen
cd ios && xcodegen generate
open PulseWatch.xcodeproj
```

`PulseWatchKit` is a local Swift Package consumed by the app target; you can
also run its tests with `swift test --package-path ios/PulseWatchKit`.

## Provider-key encryption

When the user adds an Anthropic or OpenAI account:

1. The app fetches `GET /v1/wrapping-keys/current` → `{ kid, public_key, alg }`.
2. `EnvelopeCipher.seal` encrypts the provider key with X25519 + HKDF-SHA256 +
   AES-256-GCM. Wire format: `eph_pub(32) || iv(12) || tag(16) || ciphertext`,
   base64-encoded as `wrapped_key`.
3. The plaintext `Data` buffer is zeroed before the function returns.
4. `POST /v1/accounts` sends `{ provider, label, wrapped_key, kid, org_id? }`.

The backend decapsulates with the matching X25519 private key, immediately
re-wraps the plaintext under its at-rest KEK, and never persists the bare key.

## Phone ↔ Watch pairing

Two-step flow that matches the OpenAPI:

1. The phone hits `POST /v1/auth/pairings` to mint a 6-digit, 5-minute,
   single-use code. The phone displays it (Settings → Pair Apple Watch) and
   forwards it to the watch via `WCSession.transferUserInfo`.
2. The watch receives the code in `WatchSync.shared.onPairingCodeReceived` and
   calls `POST /v1/auth/devices` with `pairing_code: <code>`. The backend
   joins the watch to the same `user_id`, returns a watch-scoped bearer token,
   and marks the pairing consumed.

Until the watch enrolls itself, the phone may also forward its own session via
`WatchSync.shared.sendSession`, giving the watch immediate read-only access.

## Complications

`PulseWatchComplications` is a WidgetKit extension that ships:
- `accessoryCorner`, `accessoryCircular`, `accessoryRectangular`,
  `accessoryInline`.
- `UsageProvider` reads the shared `SessionStore` from the keychain and calls
  `GET /v1/usage/summary?window=day`. It returns the highest-percent provider
  so the wrist-glance number is the quota the user is actually about to blow.
- Refresh policy is `.after(now + 15 min)`. M6 layers APNs `complication`
  tokens on top so threshold-fire events update sooner.
