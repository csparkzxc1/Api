package app.cap.ui.accounts

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import app.cap.core.api.Provider
import app.cap.ui.AppViewModel

@Composable
fun AddAccountSheet(viewModel: AppViewModel, onDone: () -> Unit) {
    var provider by remember { mutableStateOf(Provider.ANTHROPIC) }
    var label by remember { mutableStateOf("") }
    var apiKey by remember { mutableStateOf("") }
    var orgId by remember { mutableStateOf("") }

    Column(
        modifier = Modifier.padding(24.dp).fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text("New account", style = MaterialTheme.typography.titleLarge)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            FilterChip(
                selected = provider == Provider.ANTHROPIC,
                onClick = { provider = Provider.ANTHROPIC },
                label = { Text("Anthropic") },
            )
            FilterChip(
                selected = provider == Provider.OPENAI,
                onClick = { provider = Provider.OPENAI },
                label = { Text("OpenAI") },
            )
        }
        OutlinedTextField(
            value = label, onValueChange = { label = it },
            label = { Text("Label") },
            singleLine = true,
        )
        if (provider == Provider.OPENAI) {
            OutlinedTextField(
                value = orgId, onValueChange = { orgId = it },
                label = { Text("OpenAI org id") },
                singleLine = true,
            )
        }
        OutlinedTextField(
            value = apiKey, onValueChange = { apiKey = it },
            label = { Text(if (provider == Provider.ANTHROPIC) "Admin API key (sk-ant-admin01-…)" else "API key (sk-…)") },
            singleLine = true,
            visualTransformation = PasswordVisualTransformation(),
        )
        Text(
            "The key is encrypted on this device with the backend's wrapping public key before being sent. Plaintext never leaves your phone.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Button(
            enabled = label.isNotBlank() && apiKey.length >= 8,
            onClick = {
                viewModel.addAccount(
                    provider = provider,
                    label = label,
                    key = apiKey,
                    orgId = orgId.takeIf { provider == Provider.OPENAI && it.isNotBlank() },
                )
                onDone()
            },
        ) { Text("Save") }
    }
}
