package app.pulsewatch.core.vault

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

@Serializable
data class StoredSession(
    val deviceId: String,
    val token: String,
    val expiresAt: String,
    val baseUrl: String,
)

class SessionStore(context: Context) {
    private val prefs: SharedPreferences = run {
        val key = MasterKey.Builder(context.applicationContext)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()
        EncryptedSharedPreferences.create(
            context.applicationContext,
            "pulsewatch.session",
            key,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )
    }

    fun load(): StoredSession? = prefs.getString(KEY, null)?.let { Json.decodeFromString(it) }

    fun save(session: StoredSession) {
        prefs.edit().putString(KEY, Json.encodeToString(session)).apply()
    }

    fun clear() = prefs.edit().remove(KEY).apply()

    private companion object { const val KEY = "session" }
}
