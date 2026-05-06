// Mirrors openapi.yaml. Keep field order/names — they're serialized as-is.
package app.pulsewatch.core.api

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
enum class Provider { @SerialName("anthropic") ANTHROPIC, @SerialName("openai") OPENAI }

@Serializable
enum class DevicePlatform {
    @SerialName("ios") IOS,
    @SerialName("android") ANDROID,
    @SerialName("watchos") WATCHOS,
    @SerialName("wearos") WEAROS,
    @SerialName("desktop") DESKTOP,
}

@Serializable
enum class UsageWindow {
    @SerialName("hour") HOUR,
    @SerialName("day") DAY,
    @SerialName("week") WEEK,
    @SerialName("month") MONTH,
    @SerialName("reset_window") RESET_WINDOW,
}

@Serializable
enum class UsageBucket { @SerialName("hour") HOUR, @SerialName("day") DAY }

@Serializable
enum class UsageUnit {
    @SerialName("usd") USD,
    @SerialName("tokens") TOKENS,
    @SerialName("requests") REQUESTS,
}

@Serializable
enum class AccountStatus {
    @SerialName("pending") PENDING,
    @SerialName("active") ACTIVE,
    @SerialName("error") ERROR,
}

@Serializable
enum class AlertScope {
    @SerialName("provider_day") PROVIDER_DAY,
    @SerialName("provider_month") PROVIDER_MONTH,
    @SerialName("claude_code_reset_window") CLAUDE_CODE_RESET_WINDOW,
}

@Serializable
data class Session(val device_id: String, val token: String, val expires_at: String)

@Serializable
data class Pairing(val code: String, val expires_at: String)

@Serializable
data class WrappingKey(val kid: String, val public_key: String, val alg: String)

@Serializable
data class DeviceEnrollRequest(
    val platform: DevicePlatform,
    val public_key: String,
    val pairing_code: String? = null,
    val device_name: String? = null,
)

@Serializable
data class AccountCreate(
    val provider: Provider,
    val label: String,
    val wrapped_key: String,
    val kid: String,
    val org_id: String? = null,
)

@Serializable
data class Account(
    val id: String,
    val provider: Provider,
    val label: String,
    val org_id: String? = null,
    val status: AccountStatus,
    val error_message: String? = null,
    val last_polled_at: String? = null,
    val created_at: String,
)

@Serializable
data class ProviderSummary(
    val provider: Provider,
    val label: String? = null,
    val used: Double,
    val limit: Double? = null,
    val unit: UsageUnit,
    val percent: Double? = null,
    val resets_at: String? = null,
    val projected_exhaustion_at: String? = null,
)

@Serializable
data class UsageSummary(
    val generated_at: String,
    val window: UsageWindow,
    val providers: List<ProviderSummary>,
)

@Serializable
data class UsagePoint(
    val t: String,
    val value: Double,
    val group: String? = null,
    val unit: UsageUnit? = null,
)

@Serializable
data class UsageSeries(val bucket: UsageBucket, val points: List<UsagePoint>)

@Serializable
data class AlertThresholdInput(
    val scope: AlertScope,
    val provider: Provider? = null,
    val percent: Double,
    val haptic: Boolean? = null,
)

@Serializable
enum class PushPlatform {
    @SerialName("ios") IOS,
    @SerialName("watchos") WATCHOS,
    @SerialName("android") ANDROID,
    @SerialName("wearos") WEAROS,
}

@Serializable
enum class PushEnvironment {
    @SerialName("sandbox") SANDBOX,
    @SerialName("production") PRODUCTION,
}

@Serializable
data class PushTokenInput(
    val platform: PushPlatform,
    val apns_token: String? = null,
    val apns_environment: PushEnvironment? = null,
    val fcm_token: String? = null,
)

@Serializable
data class AlertThreshold(
    val id: String,
    val scope: AlertScope,
    val provider: Provider? = null,
    val percent: Double,
    val haptic: Boolean? = null,
    val last_fired_at: String? = null,
    val created_at: String,
)
