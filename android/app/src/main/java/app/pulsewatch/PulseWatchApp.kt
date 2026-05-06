package app.pulsewatch

import android.app.Application
import app.pulsewatch.core.api.ApiClient
import app.pulsewatch.core.api.EnrollmentFlow
import app.pulsewatch.core.vault.SessionStore
import app.pulsewatch.sync.WearSync

class PulseWatchApp : Application() {

    lateinit var sessionStore: SessionStore
        private set
    lateinit var apiClient: ApiClient
        private set
    lateinit var enrollment: EnrollmentFlow
        private set
    lateinit var wearSync: WearSync
        private set

    override fun onCreate() {
        super.onCreate()
        sessionStore = SessionStore(this)
        rebuildClient(sessionStore.load()?.baseUrl ?: "https://api.pulsewatch.app")
        wearSync = WearSync(this).also { it.start() }
    }

    fun rebuildClient(baseUrl: String) {
        apiClient = ApiClient(baseUrl, sessionStore)
        enrollment = EnrollmentFlow(apiClient)
    }

    companion object {
        fun from(application: Application): PulseWatchApp = application as PulseWatchApp
    }
}
