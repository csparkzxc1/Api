package app.cap.core

import app.cap.core.vault.EnvelopeCipher
import org.bouncycastle.crypto.params.X25519PrivateKeyParameters
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertThrows
import org.junit.Test
import java.security.SecureRandom

class EnvelopeCipherTest {

    @Test fun roundTrips() {
        val priv = X25519PrivateKeyParameters(SecureRandom())
        val pubBytes = ByteArray(32).also { priv.generatePublicKey().encode(it, 0) }
        val privBytes = ByteArray(32).also { priv.encode(it, 0) }
        val plain = "sk-ant-api03-fake".toByteArray()

        val wrapped = EnvelopeCipher.seal(plain, pubBytes)
        val opened = EnvelopeCipher.open(wrapped, privBytes)
        assertArrayEquals(plain, opened)
    }

    @Test fun tamperedPayloadFails() {
        val priv = X25519PrivateKeyParameters(SecureRandom())
        val pubBytes = ByteArray(32).also { priv.generatePublicKey().encode(it, 0) }
        val privBytes = ByteArray(32).also { priv.encode(it, 0) }
        val wrapped = EnvelopeCipher.seal("hi".toByteArray(), pubBytes)
        wrapped[wrapped.size - 1] = (wrapped[wrapped.size - 1].toInt() xor 1).toByte()
        assertThrows(Exception::class.java) { EnvelopeCipher.open(wrapped, privBytes) }
    }
}
