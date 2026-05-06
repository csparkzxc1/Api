package app.pulsewatch.ui.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import app.pulsewatch.ui.AppState
import app.pulsewatch.ui.AppViewModel

@Composable
fun SettingsScreen(state: AppState, viewModel: AppViewModel, modifier: Modifier = Modifier) {
    Column(
        modifier = modifier.fillMaxSize().padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Text("Backend", style = MaterialTheme.typography.titleMedium)
        Text(state.baseUrl, style = MaterialTheme.typography.bodyMedium)
        state.session?.let {
            Text("Device id: ${it.deviceId}", style = MaterialTheme.typography.bodySmall)
            Text("Expires: ${it.expiresAt}", style = MaterialTheme.typography.bodySmall)
        }

        HorizontalDivider()

        Text("Wear OS", style = MaterialTheme.typography.titleMedium)
        Button(onClick = { viewModel.generatePairingCode() }) { Text("Pair Wear OS device") }
        state.pairing?.let { p ->
            Text(
                "Pairing code: ${p.code}",
                style = MaterialTheme.typography.headlineMedium.copy(
                    fontFamily = FontFamily.Monospace,
                    fontWeight = FontWeight.SemiBold,
                ),
            )
            Text(
                "Open PulseWatch on your watch to accept (expires ${p.expires_at})",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }

        HorizontalDivider()

        OutlinedButton(onClick = { viewModel.signOut() }) { Text("Sign out") }
    }
}
