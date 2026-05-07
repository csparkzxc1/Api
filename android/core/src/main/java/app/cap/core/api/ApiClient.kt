package app.cap.core.api

import app.cap.core.vault.SessionStore
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import java.io.IOException
import java.util.concurrent.TimeUnit

class ApiException(val status: Int, body: String) : IOException("HTTP $status: $body")

class ApiClient(
    val baseUrl: String,
    val sessionStore: SessionStore,
    private val http: OkHttpClient = defaultClient(),
) {
    @PublishedApi internal val json: Json = Json { ignoreUnknownKeys = true; encodeDefaults = false }
    @PublishedApi internal val jsonMedia = "application/json".toMediaType()

    // Auth ------------------------------------------------------------------

    suspend fun enrollDevice(req: DeviceEnrollRequest): Session =
        post("/v1/auth/devices", req, authed = false)

    suspend fun createPairing(): Pairing = post<Unit?, Pairing>("/v1/auth/pairings", body = null)

    // Wrapping keys ---------------------------------------------------------

    suspend fun currentWrappingKey(): WrappingKey = get("/v1/wrapping-keys/current")

    // Accounts --------------------------------------------------------------

    suspend fun listAccounts(): List<Account> = get("/v1/accounts")
    suspend fun createAccount(req: AccountCreate): Account = post("/v1/accounts", req)
    suspend fun deleteAccount(id: String) {
        empty("/v1/accounts/$id", "DELETE")
    }

    suspend fun refreshAccount(id: String) {
        empty("/v1/accounts/$id/refresh", "POST")
    }

    // Usage -----------------------------------------------------------------

    suspend fun usageSummary(window: UsageWindow = UsageWindow.DAY): UsageSummary {
        val w = window.name.lowercase()
        return get("/v1/usage/summary?window=$w")
    }

    suspend fun usageSeries(
        from: String,
        to: String,
        bucket: UsageBucket = UsageBucket.DAY,
        accountId: String? = null,
        groupBy: String = "none",
    ): UsageSeries {
        val q = buildString {
            append("from=").append(from)
            append("&to=").append(to)
            append("&bucket=").append(bucket.name.lowercase())
            append("&group_by=").append(groupBy)
            if (accountId != null) append("&account_id=").append(accountId)
        }
        return get("/v1/usage/series?$q")
    }

    // Alerts ----------------------------------------------------------------

    suspend fun listThresholds(): List<AlertThreshold> = get("/v1/alerts/thresholds")
    suspend fun putThresholds(items: List<AlertThresholdInput>): List<AlertThreshold> =
        put("/v1/alerts/thresholds", items)

    // Push ------------------------------------------------------------------

    suspend fun putPushToken(input: PushTokenInput) {
        val payload = json.encodeToString(serializer<PushTokenInput>(), input)
        execute("/v1/devices/push-token", "PUT", payload, authed = true).close()
    }

    suspend fun deletePushToken() {
        empty("/v1/devices/push-token", "DELETE")
    }

    // Internals -------------------------------------------------------------

    private suspend inline fun <reified Res> get(path: String): Res =
        execute(path, "GET", body = null, authed = true).use { readBody(it) }

    private suspend inline fun <reified Req, reified Res> post(
        path: String, body: Req?, authed: Boolean = true,
    ): Res {
        val payload = body?.let { json.encodeToString(serializer(), it) }
        return execute(path, "POST", payload, authed).use { readBody(it) }
    }

    private suspend inline fun <reified Req, reified Res> put(path: String, body: Req): Res {
        val payload = json.encodeToString(serializer(), body)
        return execute(path, "PUT", payload, authed = true).use { readBody(it) }
    }

    private suspend fun empty(path: String, method: String) {
        execute(path, method, body = null, authed = true).close()
    }

    @PublishedApi
    internal inline fun <reified T> readBody(response: Response): T {
        val text = response.body!!.string()
        return json.decodeFromString(serializer(), text)
    }

    @PublishedApi
    internal suspend fun execute(
        path: String,
        method: String,
        body: String?,
        authed: Boolean,
    ): Response = withContext(Dispatchers.IO) {
        val url = (baseUrl.trimEnd('/') + path).toHttpUrl()
        val rb = body?.toRequestBody(jsonMedia)
            ?: if (method in setOf("POST", "PUT", "DELETE")) "".toRequestBody(jsonMedia) else null
        val builder = Request.Builder().url(url).method(method, rb).header("Accept", "application/json")
        if (authed) {
            val s = sessionStore.load() ?: throw ApiException(401, "no session")
            builder.header("Authorization", "Bearer ${s.token}")
        }
        val response = http.newCall(builder.build()).execute()
        if (!response.isSuccessful) {
            val text = response.body?.string().orEmpty()
            response.close()
            throw ApiException(response.code, text)
        }
        response
    }

    companion object {
        private fun defaultClient(): OkHttpClient = OkHttpClient.Builder()
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .callTimeout(60, TimeUnit.SECONDS)
            .build()
    }
}

// re-export so callers don't need to depend on kotlinx.serialization directly
@PublishedApi internal inline fun <reified T> serializer(): kotlinx.serialization.KSerializer<T> =
    kotlinx.serialization.serializer()
