package app.cap.wear

import android.app.Application
import app.cap.core.api.ApiClient
import app.cap.core.api.EnrollmentFlow
import app.cap.core.vault.SessionStore

class WearApp : Application() {

    lateinit var sessionStore: SessionStore
        private set
    private var _client: ApiClient? = null

    override fun onCreate() {
        super.onCreate()
        sessionStore = SessionStore(this)
        rebuild()
    }

    fun rebuild() {
        val s = sessionStore.load()
        _client = s?.let { ApiClient(it.baseUrl, sessionStore) }
    }

    fun apiClient(): ApiClient? = _client ?: run { rebuild(); _client }
    fun enrollment(): EnrollmentFlow? = apiClient()?.let(::EnrollmentFlow)

    companion object {
        fun from(application: Application): WearApp = application as WearApp
    }
}
