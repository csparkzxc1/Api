package app.cap.ui.accounts

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.Card
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import app.cap.core.api.Account
import app.cap.core.api.AccountStatus
import app.cap.ui.AppState
import app.cap.ui.AppViewModel

@Composable
fun AccountsScreen(state: AppState, viewModel: AppViewModel, modifier: Modifier = Modifier) {
    var sheet by remember { mutableStateOf(false) }
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)

    Box(modifier.fillMaxSize()) {
        if (state.accounts.isEmpty()) {
            Text(
                "No accounts yet — tap + to add Anthropic or OpenAI.",
                modifier = Modifier.align(Alignment.Center).padding(24.dp),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        } else {
            LazyColumn(
                contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
                modifier = Modifier.fillMaxSize(),
            ) {
                items(state.accounts, key = { it.id }) { acc ->
                    AccountRow(acc) { viewModel.deleteAccount(acc.id) }
                }
            }
        }

        FloatingActionButton(
            onClick = { sheet = true },
            modifier = Modifier.align(Alignment.BottomEnd).padding(16.dp),
        ) { Icon(Icons.Default.Add, null) }
    }

    if (sheet) {
        ModalBottomSheet(onDismissRequest = { sheet = false }, sheetState = sheetState) {
            AddAccountSheet(viewModel = viewModel, onDone = { sheet = false })
        }
    }
}

@Composable
private fun AccountRow(account: Account, onDelete: () -> Unit) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp),
        ) {
            Column(Modifier.weight(1f)) {
                Text(account.label, style = MaterialTheme.typography.titleMedium)
                Text(
                    account.provider.name.lowercase().replaceFirstChar { it.uppercaseChar() },
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Text(
                when (account.status) {
                    AccountStatus.ACTIVE -> "Active"
                    AccountStatus.PENDING -> "Pending"
                    AccountStatus.ERROR -> "Error"
                },
                color = when (account.status) {
                    AccountStatus.ACTIVE -> MaterialTheme.colorScheme.primary
                    AccountStatus.PENDING -> MaterialTheme.colorScheme.onSurfaceVariant
                    AccountStatus.ERROR -> MaterialTheme.colorScheme.error
                },
            )
            IconButton(onClick = onDelete) { Icon(Icons.Default.Delete, "Delete") }
        }
    }
}
