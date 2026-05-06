package app.pulsewatch.wear.tile

import androidx.wear.protolayout.ColorBuilders.argb
import androidx.wear.protolayout.DimensionBuilders.dp
import androidx.wear.protolayout.LayoutElementBuilders
import androidx.wear.protolayout.ResourceBuilders
import androidx.wear.protolayout.TimelineBuilders
import androidx.wear.protolayout.material.Text
import androidx.wear.protolayout.material.Typography
import androidx.wear.protolayout.material.layouts.PrimaryLayout
import androidx.wear.tiles.RequestBuilders
import androidx.wear.tiles.TileBuilders
import androidx.wear.tiles.TileService
import app.pulsewatch.core.api.UsageWindow
import app.pulsewatch.wear.WearApp
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.future.future

private const val RESOURCES_VERSION = "1"
private const val FRESHNESS_MS = 15L * 60L * 1000L

class UsageTileService : TileService() {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onTileRequest(
        requestParams: RequestBuilders.TileRequest,
    ): ListenableFuture<TileBuilders.Tile> = scope.future {
        val app = WearApp.from(application)
        val client = app.apiClient()
        val (title, subtitle, percent) = if (client == null) {
            Triple("PulseWatch", "Open on phone", 0.0)
        } else {
            runCatching { client.usageSummary(UsageWindow.DAY) }
                .map { summary ->
                    val pick = summary.providers.maxByOrNull { it.percent ?: 0.0 }
                    if (pick == null) Triple("No accounts", "Add on phone", 0.0)
                    else Triple(
                        pick.provider.name.lowercase().replaceFirstChar { it.uppercaseChar() },
                        formatUsed(pick.unit, pick.used),
                        pick.percent ?: 0.0,
                    )
                }
                .getOrElse { Triple("PulseWatch", "Sync error", 0.0) }
        }

        val deviceParams = requestParams.deviceConfiguration

        val layout = PrimaryLayout.Builder(deviceParams)
            .setPrimaryLabelTextContent(
                Text.Builder(applicationContext, title)
                    .setColor(argb(0xFFFFFFFF.toInt()))
                    .setTypography(Typography.TYPOGRAPHY_TITLE3)
                    .build()
            )
            .setContent(
                Text.Builder(applicationContext, "${(percent * 100).toInt()}%")
                    .setColor(argb(rampColor(percent)))
                    .setTypography(Typography.TYPOGRAPHY_DISPLAY1)
                    .build()
            )
            .setSecondaryLabelTextContent(
                Text.Builder(applicationContext, subtitle)
                    .setColor(argb(0xFFB0B0B0.toInt()))
                    .setTypography(Typography.TYPOGRAPHY_BODY2)
                    .build()
            )
            .build()

        TileBuilders.Tile.Builder()
            .setResourcesVersion(RESOURCES_VERSION)
            .setFreshnessIntervalMillis(FRESHNESS_MS)
            .setTileTimeline(
                TimelineBuilders.Timeline.Builder()
                    .addTimelineEntry(
                        TimelineBuilders.TimelineEntry.Builder()
                            .setLayout(LayoutElementBuilders.Layout.Builder().setRoot(layout).build())
                            .build()
                    )
                    .build()
            )
            .build()
    }

    override fun onTileResourcesRequest(
        requestParams: RequestBuilders.ResourcesRequest,
    ): ListenableFuture<ResourceBuilders.Resources> =
        Futures.immediateFuture(
            ResourceBuilders.Resources.Builder().setVersion(RESOURCES_VERSION).build()
        )

    private fun formatUsed(unit: app.pulsewatch.core.api.UsageUnit, used: Double): String =
        when (unit) {
            app.pulsewatch.core.api.UsageUnit.USD -> String.format("$%.2f today", used)
            app.pulsewatch.core.api.UsageUnit.TOKENS -> "${used.toLong()} tokens"
            app.pulsewatch.core.api.UsageUnit.REQUESTS -> "${used.toLong()} req"
        }

    private fun rampColor(percent: Double): Int = when {
        percent > 0.9 -> 0xFFE11D48.toInt()
        percent > 0.75 -> 0xFFF59E0B.toInt()
        else -> 0xFF12C86E.toInt()
    }
}
