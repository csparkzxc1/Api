package app.pulsewatch.wear.glance

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.wear.compose.foundation.lazy.ScalingLazyColumn
import androidx.wear.compose.foundation.lazy.items
import androidx.wear.compose.foundation.lazy.rememberScalingLazyListState
import androidx.wear.compose.material.Button
import androidx.wear.compose.material.CircularProgressIndicator
import androidx.wear.compose.material.Icon
import androidx.wear.compose.material.MaterialTheme
import androidx.wear.compose.material.Text
import androidx.wear.compose.material.TimeText
import app.pulsewatch.core.api.ProviderSummary
import app.pulsewatch.core.api.UsageSummary
import app.pulsewatch.core.api.UsageUnit
import app.pulsewatch.core.api.UsageWindow
import app.pulsewatch.wear.WearApp
import kotlinx.coroutines.launch

@Composable
fun GlanceScreen(app: WearApp) {
    var summary by remember { mutableStateOf<UsageSummary?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    suspend fun load() {
        val client = app.apiClient()
        if (client == null) { error = "Open PulseWatch on your phone."; return }
        runCatching { client.usageSummary(UsageWindow.DAY) }
            .onSuccess { summary = it; error = null }
            .onFailure { error = it.message }
    }

    LaunchedEffect(Unit) { load() }

    val state = rememberScalingLazyListState()
    Column(modifier = Modifier.fillMaxSize()) {
        TimeText()
        ScalingLazyColumn(
            modifier = Modifier.fillMaxSize().padding(horizontal = 8.dp),
            state = state,
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            when {
                summary == null && error == null -> item { CircularProgressIndicator() }
                error != null -> item {
                    Text(
                        error!!,
                        color = MaterialTheme.colors.error,
                        modifier = Modifier.padding(horizontal = 8.dp),
                    )
                }
                summary?.providers?.isEmpty() == true -> item {
                    Text("Add an account on phone")
                }
                else -> items(summary!!.providers) { ProviderRow(it) }
            }
            item {
                Button(onClick = { scope.launch { load() } }) {
                    Icon(Icons.Default.Refresh, contentDescription = "Refresh")
                }
            }
        }
    }
}

@Composable
private fun ProviderRow(p: ProviderSummary) {
    val percent = (p.percent ?: 0.0).coerceIn(0.0, 1.0)
    val color = when {
        percent > 0.9 -> Color(0xFFE11D48)
        percent > 0.75 -> Color(0xFFF59E0B)
        else -> MaterialTheme.colors.primary
    }
    val isClaude = p.provider == app.pulsewatch.core.api.Provider.ANTHROPIC
    val brand = if (isClaude) Color(0xFFD97757) else Color(0xFF10A37F)
    val ringColor = if (percent > 0.9) Color(0xFFE11D48) else if (percent > 0.75) Color(0xFFE8B54A) else brand
    Row(verticalAlignment = Alignment.CenterVertically) {
        androidx.compose.foundation.Canvas(modifier = Modifier.size(36.dp)) {
            val stroke = 4.dp.toPx()
            drawArc(
                color = brand.copy(alpha = 0.16f),
                startAngle = 0f, sweepAngle = 360f, useCenter = false,
                style = androidx.compose.ui.graphics.drawscope.Stroke(width = stroke),
            )
            drawArc(
                color = ringColor,
                startAngle = -90f, sweepAngle = (360f * percent).toFloat(), useCenter = false,
                style = androidx.compose.ui.graphics.drawscope.Stroke(
                    width = stroke,
                    cap = androidx.compose.ui.graphics.StrokeCap.Round,
                ),
            )
        }
        Spacer(Modifier.size(8.dp))
        Column {
            Text(
                p.provider.name.lowercase().replaceFirstChar { it.uppercaseChar() },
                fontWeight = FontWeight.SemiBold,
            )
            Text(
                when (p.unit) {
                    UsageUnit.USD -> String.format("$%.2f", p.used)
                    UsageUnit.TOKENS -> "${p.used.toLong()} tk"
                    UsageUnit.REQUESTS -> "${p.used.toLong()} req"
                },
                color = MaterialTheme.colors.onSurfaceVariant,
            )
        }
    }
}
