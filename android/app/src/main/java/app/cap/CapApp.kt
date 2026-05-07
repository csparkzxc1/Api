package app.cap

import android.app.Application
import app.cap.core.api.ApiClient
import app.cap.core.api.EnrollmentFlow
import app.cap.core.vault.SessionStore
import app.cap.sync.WearSync

class CapApp : Application() {

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
        rebuildClient(sessionStore.load()?.baseUrl ?: "https://api.cap.app")
        wearSync = WearSync(this).also { it.start() }
    }

    fun rebuildClient(baseUrl: String) {
        apiClient = ApiClient(baseUrl, sessionStore)
        enrollment = EnrollmentFlow(apiClient)
    }

    companion object {
        fun from(application: Application): CapApp = application as CapApp
    }
}
