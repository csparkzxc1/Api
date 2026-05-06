import Foundation

public enum Provider: String, Codable, CaseIterable, Sendable {
    case anthropic
    case openai
}

public enum DevicePlatform: String, Codable, Sendable {
    case ios, android, watchos, wearos, desktop
}

public enum UsageWindow: String, Codable, CaseIterable, Sendable {
    case hour, day, week, month, reset_window
}

public enum UsageBucket: String, Codable, Sendable { case hour, day }
public enum UsageUnit: String, Codable, Sendable { case usd, tokens, requests }
public enum AccountStatus: String, Codable, Sendable { case pending, active, error }
public enum AlertScope: String, Codable, Sendable {
    case provider_day, provider_month, claude_code_reset_window
}

public struct Session: Codable, Sendable {
    public let device_id: String
    public let token: String
    public let expires_at: String
}

public struct WrappingKey: Codable, Sendable {
    public let kid: String
    public let public_key: String
    public let alg: String
}

public struct AccountCreate: Codable, Sendable {
    public let provider: Provider
    public let label: String
    public let wrapped_key: String
    public let kid: String
    public let org_id: String?

    public init(provider: Provider, label: String, wrapped_key: String, kid: String, org_id: String? = nil) {
        self.provider = provider
        self.label = label
        self.wrapped_key = wrapped_key
        self.kid = kid
        self.org_id = org_id
    }
}

public struct Account: Codable, Identifiable, Sendable {
    public let id: String
    public let provider: Provider
    public let label: String
    public let org_id: String?
    public let status: AccountStatus
    public let error_message: String?
    public let last_polled_at: String?
    public let created_at: String
}

public struct ProviderSummary: Codable, Sendable, Identifiable {
    public let provider: Provider
    public let label: String?
    public let used: Double
    public let limit: Double?
    public let unit: UsageUnit
    public let percent: Double?
    public let resets_at: String?
    public let projected_exhaustion_at: String?

    public var id: String { "\(provider.rawValue):\(unit.rawValue)" }
}

public struct UsageSummary: Codable, Sendable {
    public let generated_at: String
    public let window: UsageWindow
    public let providers: [ProviderSummary]
}

public struct UsagePoint: Codable, Sendable {
    public let t: String
    public let value: Double
    public let group: String?
    public let unit: UsageUnit?
}

public struct UsageSeries: Codable, Sendable {
    public let bucket: UsageBucket
    public let points: [UsagePoint]
}

public struct AlertThresholdInput: Codable, Sendable {
    public let scope: AlertScope
    public let provider: Provider?
    public let percent: Double
    public let haptic: Bool?
}

public struct AlertThreshold: Codable, Identifiable, Sendable {
    public let id: String
    public let scope: AlertScope
    public let provider: Provider?
    public let percent: Double
    public let haptic: Bool?
    public let last_fired_at: String?
    public let created_at: String
}

public struct DeviceEnrollRequest: Codable, Sendable {
    public let platform: DevicePlatform
    public let public_key: String
    public let pairing_code: String
    public let device_name: String?
}
