package app.cap.wear.complication

import androidx.wear.watchface.complications.data.ComplicationData
import androidx.wear.watchface.complications.data.ComplicationType
import androidx.wear.watchface.complications.data.LongTextComplicationData
import androidx.wear.watchface.complications.data.PlainComplicationText
import androidx.wear.watchface.complications.data.RangedValueComplicationData
import androidx.wear.watchface.complications.data.ShortTextComplicationData
import androidx.wear.watchface.complications.datasource.ComplicationDataSourceService
import androidx.wear.watchface.complications.datasource.ComplicationRequest
import app.cap.core.api.ProviderSummary
import app.cap.core.api.UsageUnit
import app.cap.core.api.UsageWindow
import app.cap.wear.WearApp
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

class UsageComplicationDataSourceService : ComplicationDataSourceService() {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun getPreviewData(type: ComplicationType): ComplicationData? = when (type) {
        ComplicationType.SHORT_TEXT -> shortText(percent = 0.62, label = "Claude")
        ComplicationType.RANGED_VALUE -> ranged(percent = 0.62, label = "Claude")
        ComplicationType.LONG_TEXT -> longText("Claude", "$12.40 / $20")
        else -> null
    }

    override fun onComplicationRequest(request: ComplicationRequest, listener: ComplicationRequestListener) {
        scope.launch {
            val app = WearApp.from(application)
            val client = app.apiClient()
            val pick: ProviderSummary? = client?.let {
                runCatching { it.usageSummary(UsageWindow.DAY) }
                    .getOrNull()
                    ?.providers
                    ?.maxByOrNull { p -> p.percent ?: 0.0 }
            }
            val data: ComplicationData? = when (request.complicationType) {
                ComplicationType.SHORT_TEXT -> shortText(pick?.percent ?: 0.0, pickLabel(pick))
                ComplicationType.RANGED_VALUE -> ranged(pick?.percent ?: 0.0, pickLabel(pick))
                ComplicationType.LONG_TEXT -> longText(pickLabel(pick), pick?.let(::usedString) ?: "—")
                else -> null
            }
            listener.onComplicationData(data)
        }
    }

    private fun pickLabel(p: ProviderSummary?): String =
        p?.provider?.name?.lowercase()?.replaceFirstChar { it.uppercaseChar() } ?: "Cap"

    private fun usedString(p: ProviderSummary): String = when (p.unit) {
        UsageUnit.USD -> String.format("$%.2f", p.used)
        UsageUnit.TOKENS -> "${p.used.toLong()} tokens"
        UsageUnit.REQUESTS -> "${p.used.toLong()} req"
    }

    private fun shortText(percent: Double, label: String): ComplicationData =
        ShortTextComplicationData.Builder(
            text = PlainComplicationText.Builder("${(percent * 100).toInt()}%").build(),
            contentDescription = PlainComplicationText.Builder("$label usage").build(),
        ).setTitle(PlainComplicationText.Builder(label).build()).build()

    private fun ranged(percent: Double, label: String): ComplicationData =
        RangedValueComplicationData.Builder(
            value = (percent * 100).toFloat(),
            min = 0f, max = 100f,
            contentDescription = PlainComplicationText.Builder("$label usage").build(),
        )
            .setText(PlainComplicationText.Builder("${(percent * 100).toInt()}%").build())
            .setTitle(PlainComplicationText.Builder(label).build())
            .build()

    private fun longText(label: String, body: String): ComplicationData =
        LongTextComplicationData.Builder(
            text = PlainComplicationText.Builder(body).build(),
            contentDescription = PlainComplicationText.Builder("$label usage").build(),
        ).setTitle(PlainComplicationText.Builder(label).build()).build()
}
