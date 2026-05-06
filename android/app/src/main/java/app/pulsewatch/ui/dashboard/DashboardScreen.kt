package app.pulsewatch.ui.dashboard

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Card
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import app.pulsewatch.core.api.ProviderSummary
import app.pulsewatch.core.api.UsageUnit
import app.pulsewatch.ui.AppState
import app.pulsewatch.ui.AppViewModel

@Composable
fun DashboardScreen(state: AppState, viewModel: AppViewModel, modifier: Modifier = Modifier) {
    Column(modifier.fillMaxSize().padding(16.dp)) {
        Text("Today", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.SemiBold)
        if (state.summary == null) {
            Text(
                state.error ?: "Loading…",
                color = if (state.error != null) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant,
            )
        } else if (state.summary.providers.isEmpty()) {
            Text("Add an account on the Accounts tab to start tracking.")
        } else {
            LazyColumn(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                items(state.summary.providers) { ProviderCard(it) }
            }
        }
    }
}

@Composable
private fun ProviderCard(p: ProviderSummary) {
    val percent = p.percent ?: 0.0
    val color = when {
        percent > 0.9 -> Color(0xFFE11D48)
        percent > 0.75 -> Color(0xFFF59E0B)
        else -> MaterialTheme.colorScheme.primary
    }
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    p.provider.name.lowercase().replaceFirstChar { it.uppercaseChar() },
                    style = MaterialTheme.typography.titleMedium,
                    modifier = Modifier.weight(1f),
                )
                p.percent?.let { Text("${(it * 100).toInt()}%", color = color) }
            }
            Text(
                formatUsed(p),
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.SemiBold,
            )
            LinearProgressIndicator(
                progress = { percent.toFloat().coerceIn(0f, 1f) },
                modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
                color = color,
            )
        }
    }
}

private fun formatUsed(p: ProviderSummary): String = when (p.unit) {
    UsageUnit.USD -> String.format("$%.2f", p.used)
    UsageUnit.TOKENS -> "${p.used.toLong()} tokens"
    UsageUnit.REQUESTS -> "${p.used.toLong()} requests"
}
