package app.pulsewatch.wear.sync

import android.content.ComponentName
import androidx.wear.tiles.TileService
import androidx.wear.watchface.complications.datasource.ComplicationDataSourceUpdateRequester
import app.pulsewatch.core.api.DevicePlatform
import app.pulsewatch.core.sync.DataLayer
import app.pulsewatch.core.vault.StoredSession
import app.pulsewatch.wear.WearApp
import app.pulsewatch.wear.complication.UsageComplicationDataSourceService
import app.pulsewatch.wear.tile.UsageTileService
import com.google.android.gms.wearable.DataEvent
import com.google.android.gms.wearable.DataEventBuffer
import com.google.android.gms.wearable.DataMapItem
import com.google.android.gms.wearable.WearableListenerService
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json

/**
 * Receives Data Layer pushes from the phone:
 *  - PATH_SESSION → store the bearer session and refresh the tile/complication.
 *  - PATH_PAIRING → call POST /v1/auth/devices with the pairing code so this
 *    watch gets its own bearer token.
 */
class WearDataListenerService : WearableListenerService() {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onDataChanged(events: DataEventBuffer) {
        events.forEach { event ->
            if (event.type != DataEvent.TYPE_CHANGED) return@forEach
            val item = event.dataItem
            when (item.uri.path) {
                DataLayer.PATH_SESSION -> handleSession(item)
                DataLayer.PATH_PAIRING -> handlePairing(item)
            }
        }
    }

    private fun handleSession(item: com.google.android.gms.wearable.DataItem) {
        val map = DataMapItem.fromDataItem(item).dataMap
        val payload = map.getString(DataLayer.KEY_PAYLOAD) ?: return
        val session: StoredSession = Json.decodeFromString(payload)
        val app = WearApp.from(application)
        app.sessionStore.save(session)
        app.rebuild()
        notifySurfaces()
    }

    private fun handlePairing(item: com.google.android.gms.wearable.DataItem) {
        val map = DataMapItem.fromDataItem(item).dataMap
        val code = map.getString(DataLayer.KEY_PAIRING_CODE) ?: return
        val app = WearApp.from(application)
        scope.launch {
            val enrollment = app.enrollment() ?: return@launch
            runCatching {
                enrollment.enrollDevice(
                    platform = DevicePlatform.WEAROS,
                    deviceName = android.os.Build.MODEL,
                    pairingCode = code,
                )
            }.onSuccess {
                app.rebuild()
                notifySurfaces()
            }
        }
    }

    private fun notifySurfaces() {
        TileService.getUpdater(this).requestUpdate(UsageTileService::class.java)
        ComplicationDataSourceUpdateRequester.create(
            context = this,
            complicationDataSourceComponent = ComponentName(this, UsageComplicationDataSourceService::class.java),
        ).requestUpdateAll()
    }
}
