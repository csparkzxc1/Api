package app.cap.wear.push

import android.content.ComponentName
import android.util.Log
import androidx.wear.tiles.TileService
import androidx.wear.watchface.complications.datasource.ComplicationDataSourceUpdateRequester
import app.cap.core.api.PushPlatform
import app.cap.core.api.PushTokenInput
import app.cap.wear.WearApp
import app.cap.wear.complication.UsageComplicationDataSourceService
import app.cap.wear.tile.UsageTileService
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

class WearMessagingService : FirebaseMessagingService() {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onNewToken(token: String) {
        val app = applicationContext as? WearApp ?: return
        scope.launch {
            runCatching {
                app.apiClient()?.putPushToken(
                    PushTokenInput(platform = PushPlatform.WEAROS, fcm_token = token)
                )
            }.onFailure { Log.w(TAG, "register fcm token failed", it) }
        }
    }

    override fun onMessageReceived(message: RemoteMessage) {
        // Threshold push or generic refresh: kick the Tile and complication
        // before their next scheduled cycle.
        TileService.getUpdater(this).requestUpdate(UsageTileService::class.java)
        ComplicationDataSourceUpdateRequester.create(
            context = this,
            complicationDataSourceComponent = ComponentName(this, UsageComplicationDataSourceService::class.java),
        ).requestUpdateAll()
        Log.d(TAG, "fcm message: ${message.data}")
    }

    private companion object { const val TAG = "CapWearFcm" }
}
