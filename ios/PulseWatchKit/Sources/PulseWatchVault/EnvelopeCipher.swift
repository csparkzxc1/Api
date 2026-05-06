import Foundation
import CryptoKit

public enum EnvelopeCipherError: Error {
    case invalidPublicKey
    case sealFailed(Error)
}

public enum EnvelopeCipher {
    static let info = Data("pulsewatch v1".utf8)

    /// Wraps `plaintext` for delivery to `recipientRawPublicKey` (32-byte X25519 raw).
    /// Wire format matches backend `decapsulate`:
    ///   `eph_pub(32) || iv(12) || tag(16) || ciphertext`
    public static func seal(plaintext: Data, recipientRawPublicKey: Data) throws -> Data {
        guard recipientRawPublicKey.count == 32,
              let recipient = try? Curve25519.KeyAgreement.PublicKey(rawRepresentation: recipientRawPublicKey)
        else { throw EnvelopeCipherError.invalidPublicKey }

        let ephemeral = Curve25519.KeyAgreement.PrivateKey()
        let shared: SharedSecret
        do {
            shared = try ephemeral.sharedSecretFromKeyAgreement(with: recipient)
        } catch {
            throw EnvelopeCipherError.sealFailed(error)
        }

        let key = shared.hkdfDerivedSymmetricKey(
            using: SHA256.self,
            salt: recipientRawPublicKey,
            sharedInfo: info,
            outputByteCount: 32
        )

        let nonce = AES.GCM.Nonce()
        let sealed: AES.GCM.SealedBox
        do {
            sealed = try AES.GCM.seal(plaintext, using: key, nonce: nonce)
        } catch {
            throw EnvelopeCipherError.sealFailed(error)
        }

        var out = Data()
        out.reserveCapacity(32 + 12 + 16 + plaintext.count)
        out.append(ephemeral.publicKey.rawRepresentation)
        out.append(Data(nonce))
        out.append(sealed.tag)
        out.append(sealed.ciphertext)
        return out
    }

    /// Test helper — same logic as the backend, useful for unit tests.
    public static func open(wrapped: Data, recipientPrivateKey: Curve25519.KeyAgreement.PrivateKey) throws -> Data {
        guard wrapped.count >= 32 + 12 + 16 else { throw EnvelopeCipherError.invalidPublicKey }
        let ephRaw = wrapped.prefix(32)
        let nonceData = wrapped.dropFirst(32).prefix(12)
        let tag = wrapped.dropFirst(32 + 12).prefix(16)
        let ct = wrapped.dropFirst(32 + 12 + 16)

        let eph = try Curve25519.KeyAgreement.PublicKey(rawRepresentation: ephRaw)
        let shared = try recipientPrivateKey.sharedSecretFromKeyAgreement(with: eph)
        let key = shared.hkdfDerivedSymmetricKey(
            using: SHA256.self,
            salt: recipientPrivateKey.publicKey.rawRepresentation,
            sharedInfo: info,
            outputByteCount: 32
        )
        let nonce = try AES.GCM.Nonce(data: nonceData)
        let box = try AES.GCM.SealedBox(nonce: nonce, ciphertext: ct, tag: tag)
        return try AES.GCM.open(box, using: key)
    }
}
