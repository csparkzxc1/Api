package app.cap.core.api

import android.util.Base64
import app.cap.core.vault.EnvelopeCipher
import app.cap.core.vault.SessionStore
import app.cap.core.vault.StoredSession
import org.bouncycastle.crypto.params.X25519PrivateKeyParameters
import java.security.SecureRandom

class EnrollmentFlow(private val client: ApiClient) {

    suspend fun enrollDevice(
        platform: DevicePlatform,
        deviceName: String?,
        pairingCode: String? = null,
    ): String {
        // X25519 keypair carried over the enrollment for forward use; M3-equivalent
        // of the iOS phone↔watch handoff.
        val priv = X25519PrivateKeyParameters(SecureRandom())
        val pub = ByteArray(32).also { priv.generatePublicKey().encode(it, 0) }

        val session = client.enrollDevice(
            DeviceEnrollRequest(
                platform = platform,
                public_key = Base64.encodeToString(pub, Base64.NO_WRAP),
                pairing_code = pairingCode,
                device_name = deviceName,
            )
        )
        client.sessionStore.save(
            StoredSession(
                deviceId = session.device_id,
                token = session.token,
                expiresAt = session.expires_at,
                baseUrl = client.baseUrl,
            )
        )
        return session.device_id
    }

    /**
     * Wraps the provider key for the backend's current X25519 wrapping public
     * key and creates the account. The plaintext byte array is zeroed before
     * this method returns.
     */
    suspend fun enrollProviderAccount(
        provider: Provider,
        label: String,
        providerKey: String,
        orgId: String? = null,
    ): Account {
        val wrap = client.currentWrappingKey()
        val recipient = Base64.decode(wrap.public_key, Base64.NO_WRAP)
        val plaintext = providerKey.toByteArray(Charsets.UTF_8)
        try {
            val envelope = EnvelopeCipher.seal(plaintext, recipient)
            return client.createAccount(
                AccountCreate(
                    provider = provider,
                    label = label,
                    wrapped_key = Base64.encodeToString(envelope, Base64.NO_WRAP),
                    kid = wrap.kid,
                    org_id = orgId,
                )
            )
        } finally {
            java.util.Arrays.fill(plaintext, 0)
        }
    }
}
