package app.pulsewatch.core.vault

import org.bouncycastle.crypto.agreement.X25519Agreement
import org.bouncycastle.crypto.digests.SHA256Digest
import org.bouncycastle.crypto.generators.HKDFBytesGenerator
import org.bouncycastle.crypto.params.HKDFParameters
import org.bouncycastle.crypto.params.X25519PrivateKeyParameters
import org.bouncycastle.crypto.params.X25519PublicKeyParameters
import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

/**
 * Wire format (matches backend `decapsulate` and iOS `EnvelopeCipher`):
 *   `eph_pub(32) || iv(12) || tag(16) || ciphertext`
 *
 * HKDF salt is the recipient public key, info is the constant `pulsewatch v1`.
 */
object EnvelopeCipher {
    private const val PUB_LEN = 32
    private const val IV_LEN = 12
    private const val TAG_LEN = 16
    private val INFO = "pulsewatch v1".toByteArray(Charsets.UTF_8)
    private val secureRandom = SecureRandom()

    /** Encrypts `plaintext` for [recipientRawPublicKey] (32-byte X25519 raw). */
    fun seal(plaintext: ByteArray, recipientRawPublicKey: ByteArray): ByteArray {
        require(recipientRawPublicKey.size == PUB_LEN) { "recipient pubkey must be 32 bytes" }

        val ephPriv = X25519PrivateKeyParameters(secureRandom)
        val ephPubBytes = ByteArray(PUB_LEN).also { ephPriv.generatePublicKey().encode(it, 0) }

        val shared = ByteArray(X25519Agreement.SECRET_SIZE)
        X25519Agreement().apply { init(ephPriv) }
            .calculateAgreement(X25519PublicKeyParameters(recipientRawPublicKey, 0), shared, 0)

        val key = hkdfSha256(shared, salt = recipientRawPublicKey, info = INFO, length = 32)

        val iv = ByteArray(IV_LEN).also { secureRandom.nextBytes(it) }
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, SecretKeySpec(key, "AES"), GCMParameterSpec(TAG_LEN * 8, iv))
        val ctAndTag = cipher.doFinal(plaintext)

        // JCA returns ciphertext || tag; we want tag before ciphertext on the wire.
        val ctLen = ctAndTag.size - TAG_LEN
        val ct = ctAndTag.copyOfRange(0, ctLen)
        val tag = ctAndTag.copyOfRange(ctLen, ctAndTag.size)

        // zero the derived key — best-effort on the JVM
        java.util.Arrays.fill(key, 0)
        java.util.Arrays.fill(shared, 0)

        return ephPubBytes + iv + tag + ct
    }

    /** Test helper: opens a payload with the same recipient private key. */
    internal fun open(wrapped: ByteArray, recipientPrivateKey: ByteArray): ByteArray {
        require(wrapped.size >= PUB_LEN + IV_LEN + TAG_LEN) { "wrapped too short" }
        val ephPub = wrapped.copyOfRange(0, PUB_LEN)
        val iv = wrapped.copyOfRange(PUB_LEN, PUB_LEN + IV_LEN)
        val tag = wrapped.copyOfRange(PUB_LEN + IV_LEN, PUB_LEN + IV_LEN + TAG_LEN)
        val ct = wrapped.copyOfRange(PUB_LEN + IV_LEN + TAG_LEN, wrapped.size)

        val priv = X25519PrivateKeyParameters(recipientPrivateKey, 0)
        val recipientPubBytes = ByteArray(PUB_LEN).also { priv.generatePublicKey().encode(it, 0) }
        val shared = ByteArray(X25519Agreement.SECRET_SIZE)
        X25519Agreement().apply { init(priv) }
            .calculateAgreement(X25519PublicKeyParameters(ephPub, 0), shared, 0)
        val key = hkdfSha256(shared, salt = recipientPubBytes, info = INFO, length = 32)

        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, SecretKeySpec(key, "AES"), GCMParameterSpec(TAG_LEN * 8, iv))
        return cipher.doFinal(ct + tag)
    }

    private fun hkdfSha256(ikm: ByteArray, salt: ByteArray, info: ByteArray, length: Int): ByteArray {
        val out = ByteArray(length)
        HKDFBytesGenerator(SHA256Digest()).apply {
            init(HKDFParameters(ikm, salt, info))
            generateBytes(out, 0, length)
        }
        return out
    }
}
