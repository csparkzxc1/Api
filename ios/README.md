# PulseWatch iOS / watchOS

SwiftUI phone app with a paired watchOS target.

## Layout

```
ios/
├── project.yml                      # XcodeGen manifest
├── PulseWatch/                      # phone app target
│   ├── PulseWatchApp.swift
│   ├── AppState.swift
│   ├── Onboarding/
│   ├── Dashboard/
│   ├── Accounts/
│   ├── Settings/
│   └── Resources/                   # Info.plist + Assets.xcassets
└── PulseWatchKit/                   # Swift Package
    ├── Package.swift
    ├── Sources/
    │   ├── PulseWatchModels/        # Codable DTOs mirroring openapi.yaml
    │   ├── PulseWatchVault/         # Keychain, EnvelopeCipher (ECIES), SessionStore
    │   └── PulseWatchAPI/           # APIClient + EnrollmentFlow
    └── Tests/
        └── PulseWatchKitTests/
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

## Watch updates

M3 will add the watchOS target with `WidgetKit` complications and
`WatchConnectivity` sync. M6 wires APNs to push complication-update tokens.
