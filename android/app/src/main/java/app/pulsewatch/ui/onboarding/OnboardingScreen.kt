package app.pulsewatch.ui.onboarding

import android.os.Build
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import app.pulsewatch.ui.AppState
import app.pulsewatch.ui.AppViewModel

@Composable
fun OnboardingScreen(state: AppState, viewModel: AppViewModel, modifier: Modifier = Modifier) {
    var url by remember { mutableStateOf(state.baseUrl) }
    var deviceName by remember { mutableStateOf("${Build.MANUFACTURER} ${Build.MODEL}") }

    LaunchedEffect(url) { viewModel.setBaseUrl(url) }

    Column(
        modifier = modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Text("PulseWatch", style = androidx.compose.material3.MaterialTheme.typography.headlineLarge)
        Spacer(Modifier.height(8.dp))
        OutlinedTextField(
            value = url, onValueChange = { url = it },
            label = { Text("Backend URL") },
            singleLine = true,
        )
        OutlinedTextField(
            value = deviceName, onValueChange = { deviceName = it },
            label = { Text("Device name") },
            singleLine = true,
        )
        if (state.error != null) {
            Text(state.error, color = androidx.compose.material3.MaterialTheme.colorScheme.error)
        }
        Button(onClick = { viewModel.enroll(deviceName.takeIf { it.isNotBlank() }) }) {
            Text("Continue")
        }
    }
}
