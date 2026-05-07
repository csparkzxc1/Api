import XCTest
import CryptoKit
@testable import CapVault

final class EnvelopeCipherTests: XCTestCase {
    func testRoundTrip() throws {
        let recipient = Curve25519.KeyAgreement.PrivateKey()
        let plaintext = Data("sk-ant-api03-fake".utf8)
        let wrapped = try EnvelopeCipher.seal(
            plaintext: plaintext,
            recipientRawPublicKey: recipient.publicKey.rawRepresentation
        )
        let opened = try EnvelopeCipher.open(wrapped: wrapped, recipientPrivateKey: recipient)
        XCTAssertEqual(opened, plaintext)
    }

    func testTamperedTagFails() throws {
        let recipient = Curve25519.KeyAgreement.PrivateKey()
        var wrapped = try EnvelopeCipher.seal(
            plaintext: Data("hi".utf8),
            recipientRawPublicKey: recipient.publicKey.rawRepresentation
        )
        wrapped[wrapped.count - 1] ^= 0x01
        XCTAssertThrowsError(try EnvelopeCipher.open(wrapped: wrapped, recipientPrivateKey: recipient))
    }

    func testWrongRecipientFails() throws {
        let a = Curve25519.KeyAgreement.PrivateKey()
        let b = Curve25519.KeyAgreement.PrivateKey()
        let wrapped = try EnvelopeCipher.seal(
            plaintext: Data("hi".utf8),
            recipientRawPublicKey: a.publicKey.rawRepresentation
        )
        XCTAssertThrowsError(try EnvelopeCipher.open(wrapped: wrapped, recipientPrivateKey: b))
    }
}
