package app.pulsewatch.ui

import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.BarChart
import androidx.compose.material.icons.filled.Key
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import app.pulsewatch.ui.accounts.AccountsScreen
import app.pulsewatch.ui.dashboard.DashboardScreen
import app.pulsewatch.ui.onboarding.OnboardingScreen
import app.pulsewatch.ui.settings.SettingsScreen

@Composable
fun RootScreen(state: AppState, viewModel: AppViewModel) {
    if (state.session == null) {
        OnboardingScreen(state = state, viewModel = viewModel)
        return
    }

    var tab by rememberSaveable { mutableStateOf(0) }
    Scaffold(
        bottomBar = {
            NavigationBar {
                NavigationBarItem(
                    selected = tab == 0,
                    onClick = { tab = 0 },
                    icon = { Icon(Icons.Default.BarChart, null) },
                    label = { Text("Dashboard") },
                )
                NavigationBarItem(
                    selected = tab == 1,
                    onClick = { tab = 1 },
                    icon = { Icon(Icons.Default.Key, null) },
                    label = { Text("Accounts") },
                )
                NavigationBarItem(
                    selected = tab == 2,
                    onClick = { tab = 2 },
                    icon = { Icon(Icons.Default.Settings, null) },
                    label = { Text("Settings") },
                )
            }
        }
    ) { padding ->
        when (tab) {
            0 -> DashboardScreen(state, viewModel, Modifier.padding(padding))
            1 -> AccountsScreen(state, viewModel, Modifier.padding(padding))
            else -> SettingsScreen(state, viewModel, Modifier.padding(padding))
        }
    }
}
