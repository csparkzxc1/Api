import Foundation
import PulseWatchModels
import PulseWatchVault

public enum APIError: Error, LocalizedError {
    case http(status: Int, body: String)
    case decode(Error)
    case transport(Error)
    case notAuthenticated

    public var errorDescription: String? {
        switch self {
        case .http(let s, let b): return "HTTP \(s): \(b)"
        case .decode(let e): return "Decode: \(e.localizedDescription)"
        case .transport(let e): return e.localizedDescription
        case .notAuthenticated: return "Not signed in"
        }
    }
}

public final class APIClient: @unchecked Sendable {
    public let baseURL: URL
    public let session: SessionStore
    private let urlSession: URLSession
    private let decoder: JSONDecoder
    private let encoder: JSONEncoder

    public init(baseURL: URL, session: SessionStore = SessionStore(), urlSession: URLSession = .shared) {
        self.baseURL = baseURL
        self.session = session
        self.urlSession = urlSession
        let d = JSONDecoder(); d.keyDecodingStrategy = .useDefaultKeys
        self.decoder = d
        let e = JSONEncoder(); e.keyEncodingStrategy = .useDefaultKeys
        self.encoder = e
    }

    // MARK: auth

    public func enrollDevice(
        platform: DevicePlatform,
        publicKey: Data,
        pairingCode: String? = nil,
        deviceName: String?
    ) async throws -> Session {
        let body = DeviceEnrollRequest(
            platform: platform,
            public_key: publicKey.base64EncodedString(),
            pairing_code: pairingCode,
            device_name: deviceName
        )
        return try await send("/v1/auth/devices", method: "POST", body: body, authed: false)
    }

    public func createPairing() async throws -> Pairing {
        try await send("/v1/auth/pairings", method: "POST", body: EmptyBody())
    }

    // MARK: wrapping keys

    public func currentWrappingKey() async throws -> WrappingKey {
        try await send("/v1/wrapping-keys/current", method: "GET")
    }

    // MARK: accounts

    public func listAccounts() async throws -> [Account] {
        try await send("/v1/accounts", method: "GET")
    }

    public func createAccount(_ create: AccountCreate) async throws -> Account {
        try await send("/v1/accounts", method: "POST", body: create)
    }

    public func deleteAccount(id: String) async throws {
        let _: EmptyResponse = try await send("/v1/accounts/\(id)", method: "DELETE", expectEmpty: true)
    }

    public func refreshAccount(id: String) async throws {
        let _: EmptyResponse = try await send("/v1/accounts/\(id)/refresh", method: "POST", expectEmpty: true)
    }

    // MARK: usage

    public func usageSummary(window: UsageWindow = .day) async throws -> UsageSummary {
        try await send("/v1/usage/summary?window=\(window.rawValue)", method: "GET")
    }

    public func usageSeries(
        accountId: String? = nil,
        from: Date,
        to: Date,
        bucket: UsageBucket = .day,
        groupBy: String = "none"
    ) async throws -> UsageSeries {
        let iso = ISO8601DateFormatter()
        var items = [
            URLQueryItem(name: "from", value: iso.string(from: from)),
            URLQueryItem(name: "to", value: iso.string(from: to)),
            URLQueryItem(name: "bucket", value: bucket.rawValue),
            URLQueryItem(name: "group_by", value: groupBy)
        ]
        if let accountId { items.append(URLQueryItem(name: "account_id", value: accountId)) }
        var comps = URLComponents()
        comps.queryItems = items
        let q = comps.percentEncodedQuery ?? ""
        return try await send("/v1/usage/series?\(q)", method: "GET")
    }

    // MARK: alerts

    public func listThresholds() async throws -> [AlertThreshold] {
        try await send("/v1/alerts/thresholds", method: "GET")
    }

    public func putThresholds(_ items: [AlertThresholdInput]) async throws -> [AlertThreshold] {
        try await send("/v1/alerts/thresholds", method: "PUT", body: items)
    }

    // MARK: push

    public func putPushToken(_ input: PushTokenInput) async throws {
        let _: EmptyResponse = try await send(
            "/v1/devices/push-token", method: "PUT", body: input, expectEmpty: true
        )
    }

    public func deletePushToken() async throws {
        let _: EmptyResponse = try await send(
            "/v1/devices/push-token", method: "DELETE", expectEmpty: true
        )
    }

    // MARK: low-level

    private struct EmptyResponse: Decodable {}
    private struct EmptyBody: Encodable {}

    private func send<R: Decodable>(
        _ path: String,
        method: String,
        body: Encodable? = nil,
        authed: Bool = true,
        expectEmpty: Bool = false
    ) async throws -> R {
        let trimmedBase = baseURL.absoluteString.hasSuffix("/")
            ? String(baseURL.absoluteString.dropLast()) : baseURL.absoluteString
        let prefix = path.hasPrefix("/") ? "" : "/"
        guard let url = URL(string: trimmedBase + prefix + path) else {
            throw APIError.http(status: -1, body: "bad url")
        }
        var req = URLRequest(url: url)
        req.httpMethod = method
        req.setValue("application/json", forHTTPHeaderField: "accept")

        if authed {
            guard let s = session.load() else { throw APIError.notAuthenticated }
            req.setValue("Bearer \(s.token)", forHTTPHeaderField: "authorization")
        }

        if let body {
            req.setValue("application/json", forHTTPHeaderField: "content-type")
            req.httpBody = try encoder.encode(AnyEncodable(body))
        }

        let (data, response): (Data, URLResponse)
        do {
            (data, response) = try await urlSession.data(for: req)
        } catch {
            throw APIError.transport(error)
        }
        guard let http = response as? HTTPURLResponse else {
            throw APIError.http(status: -1, body: "no response")
        }
        guard (200..<300).contains(http.statusCode) else {
            throw APIError.http(status: http.statusCode, body: String(data: data, encoding: .utf8) ?? "")
        }
        if expectEmpty {
            return try decoder.decode(R.self, from: Data("{}".utf8))
        }
        do {
            return try decoder.decode(R.self, from: data)
        } catch {
            throw APIError.decode(error)
        }
    }
}

// Erases Encodable so the `body` parameter can be heterogeneous.
private struct AnyEncodable: Encodable {
    let value: Encodable
    init(_ v: Encodable) { self.value = v }
    func encode(to encoder: Encoder) throws { try value.encode(to: encoder) }
}
