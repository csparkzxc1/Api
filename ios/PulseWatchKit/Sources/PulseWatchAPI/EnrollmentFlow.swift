import Foundation
import CryptoKit
import PulseWatchModels
import PulseWatchVault

/// High-level helpers that compose the API client with the vault — the things
/// the UI actually wants.
public final class EnrollmentFlow: @unchecked Sendable {
    private let client: APIClient
    public init(client: APIClient) { self.client = client }

    /// Performs `POST /v1/auth/devices` and persists the bearer token. Returns
    /// the device id so the caller can show it on the device-management screen.
    public func enrollDevice(
        platform: DevicePlatform,
        deviceName: String?,
        pairingCode: String? = nil
    ) async throws -> String {
        let kp = Curve25519.KeyAgreement.PrivateKey()
        let s = try await client.enrollDevice(
            platform: platform,
            publicKey: kp.publicKey.rawRepresentation,
            pairingCode: pairingCode,
            deviceName: deviceName
        )
        let expires = ISO8601DateFormatter().date(from: s.expires_at) ?? Date(timeIntervalSinceNow: 90 * 86400)
        try client.session.save(.init(deviceId: s.device_id, token: s.token, expiresAt: expires, baseURL: client.baseURL))
        return s.device_id
    }

    public func enrollPhone(deviceName: String?) async throws -> String {
        try await enrollDevice(platform: .ios, deviceName: deviceName)
    }

    /// Wraps the provider key for the backend and creates the account. The
    /// plaintext provider key is zeroed before this method returns.
    public func enrollProviderAccount(
        provider: Provider,
        label: String,
        providerKey: String,
        orgId: String? = nil
    ) async throws -> Account {
        let wrap = try await client.currentWrappingKey()
        guard let recipient = Data(base64Encoded: wrap.public_key) else {
            throw APIError.http(status: -1, body: "bad wrapping key")
        }
        var keyBytes = Data(providerKey.utf8)
        defer { keyBytes.resetBytes(in: 0..<keyBytes.count) }

        let envelope = try EnvelopeCipher.seal(plaintext: keyBytes, recipientRawPublicKey: recipient)
        return try await client.createAccount(.init(
            provider: provider,
            label: label,
            wrapped_key: envelope.base64EncodedString(),
            kid: wrap.kid,
            org_id: orgId
        ))
    }
}
