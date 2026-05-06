package app.pulsewatch.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.pulsewatch.PulseWatchApp
import app.pulsewatch.core.api.Account
import app.pulsewatch.core.api.DevicePlatform
import app.pulsewatch.core.api.Pairing
import app.pulsewatch.core.api.Provider
import app.pulsewatch.core.api.UsageSummary
import app.pulsewatch.core.api.UsageWindow
import app.pulsewatch.core.vault.StoredSession
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class AppState(
    val baseUrl: String = "https://api.pulsewatch.app",
    val session: StoredSession? = null,
    val accounts: List<Account> = emptyList(),
    val summary: UsageSummary? = null,
    val pairing: Pairing? = null,
    val error: String? = null,
)

class AppViewModel(private val app: PulseWatchApp) : ViewModel() {
    private val _state = MutableStateFlow(
        AppState(
            baseUrl = app.sessionStore.load()?.baseUrl ?: "https://api.pulsewatch.app",
            session = app.sessionStore.load(),
        )
    )
    val state: StateFlow<AppState> = _state.asStateFlow()

    init {
        if (_state.value.session != null) refresh()
    }

    fun setBaseUrl(url: String) {
        app.rebuildClient(url)
        _state.update { it.copy(baseUrl = url) }
    }

    fun enroll(deviceName: String?) = viewModelScope.launch {
        runCatching {
            app.enrollment.enrollDevice(DevicePlatform.ANDROID, deviceName)
        }.onSuccess {
            val s = app.sessionStore.load()
            _state.update { it.copy(session = s, error = null) }
            s?.let { app.wearSync.pushSession(it) }
            refresh()
        }.onFailure { e ->
            _state.update { it.copy(error = e.message) }
        }
    }

    fun refresh() = viewModelScope.launch {
        runCatching {
            val accounts = app.apiClient.listAccounts()
            val summary = app.apiClient.usageSummary(UsageWindow.DAY)
            accounts to summary
        }.onSuccess { (a, s) ->
            _state.update { it.copy(accounts = a, summary = s, error = null) }
        }.onFailure { e ->
            _state.update { it.copy(error = e.message) }
        }
    }

    fun addAccount(provider: Provider, label: String, key: String, orgId: String?) =
        viewModelScope.launch {
            runCatching {
                app.enrollment.enrollProviderAccount(provider, label, key, orgId)
            }.onSuccess {
                refresh()
            }.onFailure { e ->
                _state.update { it.copy(error = e.message) }
            }
        }

    fun deleteAccount(id: String) = viewModelScope.launch {
        runCatching { app.apiClient.deleteAccount(id) }
        refresh()
    }

    fun generatePairingCode() = viewModelScope.launch {
        runCatching { app.apiClient.createPairing() }
            .onSuccess { p ->
                _state.update { it.copy(pairing = p, error = null) }
                runCatching { app.wearSync.pushPairingCode(p.code) }
            }
            .onFailure { e -> _state.update { it.copy(error = e.message) } }
    }

    fun signOut() = viewModelScope.launch {
        app.sessionStore.clear()
        _state.update { it.copy(session = null, accounts = emptyList(), summary = null, pairing = null) }
    }
}
