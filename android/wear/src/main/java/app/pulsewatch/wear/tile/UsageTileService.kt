package app.pulsewatch.wear.tile

import androidx.wear.protolayout.DimensionBuilders.dp
import androidx.wear.protolayout.LayoutElementBuilders
import androidx.wear.protolayout.ResourceBuilders
import androidx.wear.protolayout.TimelineBuilders
import androidx.wear.tiles.RequestBuilders
import androidx.wear.tiles.TileBuilders
import androidx.wear.tiles.TileService
import app.pulsewatch.core.api.Provider
import app.pulsewatch.core.api.ProviderSummary
import app.pulsewatch.core.api.UsageUnit
import app.pulsewatch.core.api.UsageWindow
import app.pulsewatch.wear.WearApp
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.future.future
import java.util.concurrent.atomic.AtomicReference

private const val FRESHNESS_MS = 15L * 60L * 1000L
private const val TILE_IMAGE_ID = "throttle-tile-bitmap"

/**
 * Tile service that renders the Throttle round-tile design with native
 * Android `Canvas`. The bitmap is shipped to the Tiles host via
 * `InlineImageResource` (ARGB_8888) and displayed inside a single
 * proto-layout `Image` element — this is the only practical way to get the
 * radial halo and dashed dial that proto-layout's primitives don't expose.
 */
class UsageTileService : TileService() {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    /// Holds the most recent rendered bitmap bytes between
    /// `onTileRequest` and `onTileResourcesRequest`. The Tiles host uses
    /// the version string to decide whether to re-fetch resources.
    private val cache = AtomicReference<Cached?>(null)
    private data class Cached(val bytes: ByteArray, val widthPx: Int, val heightPx: Int, val version: String)

    override fun onTileRequest(
        request: RequestBuilders.TileRequest,
    ): ListenableFuture<TileBuilders.Tile> = scope.future {
        val device = request.deviceConfiguration
        val density = applicationContext.resources.displayMetrics.density
        val widthPx = (device.screenWidthDp * density).toInt().coerceAtLeast(192)
        val heightPx = (device.screenHeightDp * density).toInt().coerceAtLeast(192)

        val content = collectContent()

        val bitmap = renderUsageTileBitmap(applicationContext, widthPx, heightPx, content)
        val bytes = bitmap.toArgb8888Bytes()
        bitmap.recycle()
        val version = "${content.hashCode()}-$widthPx"
        cache.set(Cached(bytes, widthPx, heightPx, version))

        val image = LayoutElementBuilders.Image.Builder()
            .setResourceId(TILE_IMAGE_ID)
            .setWidth(dp(device.screenWidthDp))
            .setHeight(dp(device.screenHeightDp))
            .setContentScaleMode(LayoutElementBuilders.CONTENT_SCALE_MODE_FILL_BOUNDS)
            .build()

        TileBuilders.Tile.Builder()
            .setResourcesVersion(version)
            .setFreshnessIntervalMillis(FRESHNESS_MS)
            .setTileTimeline(
                TimelineBuilders.Timeline.Builder()
                    .addTimelineEntry(
                        TimelineBuilders.TimelineEntry.Builder()
                            .setLayout(LayoutElementBuilders.Layout.Builder().setRoot(image).build())
                            .build()
                    )
                    .build()
            )
            .build()
    }

    override fun onTileResourcesRequest(
        request: RequestBuilders.ResourcesRequest,
    ): ListenableFuture<ResourceBuilders.Resources> {
        val cached = cache.get()
            ?: return Futures.immediateFuture(
                ResourceBuilders.Resources.Builder().setVersion("0").build()
            )
        val resources = ResourceBuilders.Resources.Builder()
            .setVersion(cached.version)
            .addIdToImageMapping(
                TILE_IMAGE_ID,
                ResourceBuilders.ImageResource.Builder()
                    .setInlineResource(
                        ResourceBuilders.InlineImageResource.Builder()
                            .setData(cached.bytes)
                            .setWidthPx(cached.widthPx)
                            .setHeightPx(cached.heightPx)
                            .setFormat(ResourceBuilders.IMAGE_FORMAT_ARGB_8888)
                            .build()
                    )
                    .build()
            )
            .build()
        return Futures.immediateFuture(resources)
    }

    private suspend fun collectContent(): TileContent {
        val app = WearApp.from(application)
        val client = app.apiClient()
            ?: return TileContent(
                label = "Open on iPhone",
                percent = 0.0,
                resetText = "—",
                secondary = null,
            )

        return runCatching { client.usageSummary(UsageWindow.DAY) }
            .map { summary ->
                val claude = summary.providers.firstOrNull { it.provider == Provider.ANTHROPIC }
                val codex  = summary.providers.firstOrNull { it.provider == Provider.OPENAI }
                val primary = claude ?: codex

                if (primary == null) {
                    return@map TileContent(
                        label = "No accounts",
                        percent = 0.0,
                        resetText = "Add on iPhone",
                        secondary = null,
                    )
                }

                TileContent(
                    label = labelFor(primary),
                    percent = primary.percent ?: 0.0,
                    resetText = resetText(primary),
                    secondary = secondaryFor(primary, codex),
                )
            }
            .getOrElse {
                TileContent(
                    label = "Sync error",
                    percent = 0.0,
                    resetText = "Retry in 15m",
                    secondary = null,
                )
            }
    }

    private fun labelFor(p: ProviderSummary): String =
        if (p.provider == Provider.ANTHROPIC) "Claude Code" else "OpenAI · Codex"

    private fun resetText(p: ProviderSummary): String {
        val resets = p.resets_at ?: return "—"
        return "resets $resets"
    }

    /// If the primary card is Claude and Codex is also enrolled, surface
    /// codex spend on the secondary line. Otherwise show the headline unit.
    private fun secondaryFor(primary: ProviderSummary, codex: ProviderSummary?): TileContent.SecondaryItem? {
        if (primary.provider == Provider.ANTHROPIC && codex != null) {
            val v = if (codex.unit == UsageUnit.USD) "$" + "%.2f".format(codex.used) else "${codex.used.toLong()} tk"
            return TileContent.SecondaryItem(value = v, label = "Codex left", accent = TileContent.Accent.CODEX)
        }
        return when (primary.unit) {
            UsageUnit.USD      -> TileContent.SecondaryItem("$" + "%.2f".format(primary.used), "today", TileContent.Accent.WARN)
            UsageUnit.TOKENS   -> TileContent.SecondaryItem("${primary.used.toLong()} tk", "today", TileContent.Accent.CLAUDE)
            UsageUnit.REQUESTS -> TileContent.SecondaryItem("${primary.used.toLong()} req", "today", TileContent.Accent.CLAUDE)
        }
    }
}
