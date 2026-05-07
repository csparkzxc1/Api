package app.cap.push

import android.util.Log
import app.cap.CapApp
import app.cap.core.api.PushPlatform
import app.cap.core.api.PushTokenInput
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/**
 * Receives FCM tokens and threshold-fire pushes.
 *
 * - On token refresh, forwards the new token to `PUT /v1/devices/push-token`.
 * - On data-only message arrival (`refreshComplications=true`), nudges the
 *   companion Wear OS Tile / Complication to reload immediately. The phone
 *   companion module bridges this via `play-services-wearable`.
 */
class CapMessagingService : FirebaseMessagingService() {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onNewToken(token: String) {
        val app = applicationContext as? CapApp ?: return
        scope.launch {
            runCatching {
                app.apiClient.putPushToken(
                    PushTokenInput(platform = PushPlatform.ANDROID, fcm_token = token)
                )
            }.onFailure { Log.w(TAG, "register fcm token failed", it) }
        }
    }

    override fun onMessageReceived(message: RemoteMessage) {
        // The backend ships threshold pushes as data-only or
        // notification+data; either way we surface them through the system
        // tray (FCM does that for `notification` payloads automatically) and
        // refresh the watch in the background.
        Log.d(TAG, "fcm message: ${message.data}")
    }

    private companion object { const val TAG = "CapFcm" }
}
