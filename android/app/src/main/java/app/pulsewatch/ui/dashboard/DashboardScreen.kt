package app.pulsewatch.ui.dashboard

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.unit.dp
import app.pulsewatch.core.api.Provider
import app.pulsewatch.core.api.ProviderSummary
import app.pulsewatch.core.api.UsageUnit
import app.pulsewatch.ui.AppState
import app.pulsewatch.ui.AppViewModel
import app.pulsewatch.ui.theme.LocalThrottlePalette
import app.pulsewatch.ui.theme.ThrottleShape
import app.pulsewatch.ui.theme.ThrottleType

@Composable
fun DashboardScreen(state: AppState, viewModel: AppViewModel, modifier: Modifier = Modifier) {
    val palette = LocalThrottlePalette.current
    Box(modifier.fillMaxSize().background(palette.bg)) {
        LazyColumn(
            contentPadding = androidx.compose.foundation.layout.PaddingValues(
                horizontal = 18.dp, vertical = 16.dp,
            ),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            item { Greeting() }
            item { StatusRow(state.accounts.size, lastSyncSeconds = 12) }
            if (state.summary == null) {
                item {
                    Text(
                        state.error ?: "Loading…",
                        style = ThrottleType.BodyMD,
                        color = if (state.error != null) palette.warn else palette.textDim,
                    )
                }
            } else if (state.summary.providers.isEmpty()) {
                item { EmptyState() }
            } else {
                items(state.summary.providers) { ProviderCard(it) }
            }
            item { QuickActionsRow() }
        }
    }
}

@Composable
private fun Greeting() {
    val palette = LocalThrottlePalette.current
    val hour = java.util.Calendar.getInstance().get(java.util.Calendar.HOUR_OF_DAY)
    val kind = if (hour < 12) "Good morning" else if (hour < 18) "Good afternoon" else "Good evening"
    Column {
        Text("$kind,", style = ThrottleType.DisplayMD, color = palette.text, fontStyle = FontStyle.Italic)
        Text("welcome back", style = ThrottleType.DisplayMD, color = palette.claude, fontStyle = FontStyle.Italic)
    }
}

@Composable
private fun StatusRow(servicesCount: Int, lastSyncSeconds: Int) {
    val p = LocalThrottlePalette.current
    Row(verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.size(5.dp).clip(RoundedCornerShape(50)).background(p.success))
        Spacer(Modifier.width(8.dp))
        Text(
            "$servicesCount services connected · synced ${lastSyncSeconds}s ago",
            style = ThrottleType.BodySM,
            color = p.textDim,
        )
    }
}

@Composable
private fun ProviderCard(s: ProviderSummary) {
    val p = LocalThrottlePalette.current
    val isClaude = s.provider == Provider.ANTHROPIC
    val accent = if (isClaude) p.claude else p.codex
    val glow = if (isClaude) p.claudeGlow else p.codexGlow

    Box(
        modifier = Modifier
            .fillMaxWidth()
            .clip(ThrottleShape.Card)
            .background(p.panel)
            .border(1.dp, p.border, ThrottleShape.Card)
    ) {
        // Top-right radial halo.
        Canvas(Modifier.fillMaxWidth().height(160.dp)) {
            drawCircle(
                brush = Brush.radialGradient(
                    colors = listOf(glow, Color.Transparent),
                    center = androidx.compose.ui.geometry.Offset(size.width - 30f, -30f),
                    radius = 320f,
                ),
                radius = 320f,
                center = androidx.compose.ui.geometry.Offset(size.width - 30f, -30f),
            )
        }

        Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            // Header
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    Modifier
                        .size(8.dp)
                        .clip(RoundedCornerShape(50))
                        .background(accent),
                )
                Spacer(Modifier.width(8.dp))
                Text(
                    if (isClaude) "CLAUDE CODE · MAX" else "OPENAI · CODEX",
                    style = ThrottleType.MonoSM,
                    color = p.text,
                )
                Spacer(Modifier.weight(1f))
                Text(rightLabel(s), style = ThrottleType.BodySM, color = p.textDim)
            }
            // Body
            Row(
                horizontalArrangement = Arrangement.spacedBy(18.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(contentAlignment = Alignment.Center, modifier = Modifier.size(78.dp)) {
                    Donut(progress = (s.percent ?: 0.0).toFloat(), color = accent, glow = glow)
                    Row(verticalAlignment = Alignment.Bottom) {
                        Text(
                            "${((s.percent ?: 0.0) * 100).toInt()}",
                            style = ThrottleType.MonoMD, color = p.text,
                        )
                        Text("%", style = ThrottleType.BodySM, color = p.textDim)
                    }
                }
                Column(verticalArrangement = Arrangement.spacedBy(7.dp), modifier = Modifier.weight(1f)) {
                    InfoRows(s)
                }
            }
            // Sparkline
            Sparkline(values = sparklineValues(isClaude), nowIndex = 6, color = accent, glow = glow)
            // Axis
            Row {
                val labels = if (isClaude) listOf("−5h", "NOW", "+5h") else listOf("00:00", "NOW", "23:59")
                Text(labels[0], style = ThrottleType.Mono2XS, color = p.textFaint)
                Spacer(Modifier.weight(1f))
                Text(labels[1], style = ThrottleType.Mono2XS, color = p.textFaint)
                Spacer(Modifier.weight(1f))
                Text(labels[2], style = ThrottleType.Mono2XS, color = p.textFaint)
            }
        }
    }
}

@Composable
private fun InfoRows(s: ProviderSummary) {
    val p = LocalThrottlePalette.current
    val rows = if (s.provider == Provider.ANTHROPIC) {
        listOf(
            "Used"   to s.used.toLong().toString(),
            "Limit"  to (s.limit?.toLong()?.toString() ?: "—"),
            "Window" to "5h rolling",
        )
    } else {
        listOf(
            "Today"  to "$" + "%.2f".format(s.used) + " / $" + "%.2f".format(s.limit ?: 0.0),
            "Unit"   to s.unit.name.lowercase(),
            "Reset"  to (s.resets_at ?: "—"),
        )
    }
    rows.forEach { (label, value) ->
        Row {
            Text(label, style = ThrottleType.MonoSM, color = p.textDim)
            Spacer(Modifier.weight(1f))
            Text(value, style = ThrottleType.MonoSM, color = p.text)
        }
    }
}

@Composable
private fun Donut(progress: Float, color: Color, glow: Color) {
    Canvas(Modifier.fillMaxSize()) {
        val stroke = 8.dp.toPx()
        val pad = stroke / 2
        val rect = androidx.compose.ui.geometry.Rect(
            left = pad, top = pad,
            right = size.width - pad, bottom = size.height - pad,
        )
        drawArc(
            color = color.copy(alpha = 0.16f),
            startAngle = 0f, sweepAngle = 360f, useCenter = false,
            style = Stroke(width = stroke),
            topLeft = rect.topLeft, size = Size(rect.width, rect.height),
        )
        drawArc(
            color = color,
            startAngle = -90f, sweepAngle = 360f * progress.coerceIn(0f, 1f),
            useCenter = false,
            style = Stroke(width = stroke, cap = StrokeCap.Round),
            topLeft = rect.topLeft, size = Size(rect.width, rect.height),
        )
        // glow layer (single pass; HW renderer averages)
        drawArc(
            color = glow,
            startAngle = -90f, sweepAngle = 360f * progress.coerceIn(0f, 1f),
            useCenter = false,
            style = Stroke(width = stroke + 4f, cap = StrokeCap.Round),
            topLeft = rect.topLeft, size = Size(rect.width, rect.height),
        )
    }
}

@Composable
private fun Sparkline(values: List<Float>, nowIndex: Int, color: Color, glow: Color) {
    val p = LocalThrottlePalette.current
    Row(
        verticalAlignment = Alignment.Bottom,
        horizontalArrangement = Arrangement.spacedBy(3.dp),
        modifier = Modifier.fillMaxWidth().height(30.dp),
    ) {
        values.forEachIndexed { i, v ->
            val isPast = i <= nowIndex
            Box(
                modifier = Modifier
                    .weight(1f)
                    .height((30 * v.coerceIn(0.04f, 1f)).dp)
                    .clip(RoundedCornerShape(2.dp))
                    .background(if (isPast) color else p.borderBright)
                    .then(
                        if (i == nowIndex) Modifier.border(
                            1.dp, Color.White.copy(alpha = 0.15f), RoundedCornerShape(2.dp),
                        ) else Modifier
                    )
            )
        }
    }
}

@Composable
private fun QuickActionsRow() {
    Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
        QuickAction("Alerts", "80 / 95%", Modifier.weight(1f))
        QuickAction("Sync",   "5 min",    Modifier.weight(1f))
    }
}

@Composable
private fun QuickAction(label: String, value: String, modifier: Modifier) {
    val p = LocalThrottlePalette.current
    Row(
        modifier = modifier
            .clip(ThrottleShape.Pill)
            .background(p.panel2)
            .border(1.dp, p.border, ThrottleShape.Pill)
            .padding(horizontal = 14.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(label.uppercase(), style = ThrottleType.BodySM, color = p.textDim)
        Spacer(Modifier.weight(1f))
        Text(value, style = ThrottleType.BodySM, color = p.text)
    }
}

@Composable
private fun EmptyState() {
    val p = LocalThrottlePalette.current
    Column(
        modifier = Modifier.fillMaxWidth().padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Text("No accounts yet", style = ThrottleType.SerifBody, color = p.text)
        Text(
            "Add Anthropic or OpenAI on the Accounts tab to start tracking.",
            style = ThrottleType.BodyMD, color = p.textDim,
        )
    }
}

private fun rightLabel(s: ProviderSummary): String = when (s.unit) {
    UsageUnit.USD      -> "$" + "%.2f".format(s.used) + " today"
    UsageUnit.TOKENS   -> "${s.used.toLong()} tokens"
    UsageUnit.REQUESTS -> "${s.used.toLong()} requests"
}

private fun sparklineValues(isClaude: Boolean): List<Float> = if (isClaude)
    listOf(0.24f, 0.38f, 0.55f, 0.42f, 0.68f, 0.80f, 0.62f, 0f, 0f, 0f, 0f, 0f)
else
    listOf(0.18f, 0.34f, 0.48f, 0.62f, 0.55f, 0.78f, 0.88f, 0f, 0f, 0f, 0f, 0f)
