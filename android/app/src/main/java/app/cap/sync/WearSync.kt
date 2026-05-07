package app.cap.sync

import android.content.Context
import app.cap.core.sync.DataLayer
import app.cap.core.vault.SessionStore
import app.cap.core.vault.StoredSession
import com.google.android.gms.wearable.PutDataMapRequest
import com.google.android.gms.wearable.Wearable
import kotlinx.coroutines.tasks.await
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

/**
 * Phone → Wear OS bridge over `play-services-wearable`. Mirrors the
 * WatchConnectivity flow on iOS. Forwards the bearer session immediately so
 * the watch can call the API, and forwards 6-digit pairing codes so the watch
 * can enroll itself.
 */
class WearSync(context: Context) {

    private val client = Wearable.getDataClient(context.applicationContext)

    fun start() = Unit // no-op for now; receiver is on the watch side.

    suspend fun pushSession(session: StoredSession) {
        val req = PutDataMapRequest.create(DataLayer.PATH_SESSION).apply {
            dataMap.putString(DataLayer.KEY_PAYLOAD, Json.encodeToString(session))
        }.asPutDataRequest().setUrgent()
        client.putDataItem(req).await()
    }

    suspend fun pushPairingCode(code: String) {
        val req = PutDataMapRequest.create(DataLayer.PATH_PAIRING).apply {
            dataMap.putString(DataLayer.KEY_PAIRING_CODE, code)
            // bump a fresh version so watchers see this as a new event
            dataMap.putLong("ts", System.currentTimeMillis())
        }.asPutDataRequest().setUrgent()
        client.putDataItem(req).await()
    }

    suspend fun clear(store: SessionStore) {
        store.clear()
        client.deleteDataItems(android.net.Uri.parse("wear:${DataLayer.PATH_SESSION}")).await()
    }
}
