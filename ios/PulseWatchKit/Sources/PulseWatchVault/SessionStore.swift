import Foundation

/// Persists the bearer token + device id returned by `POST /v1/auth/devices`.
public final class SessionStore: @unchecked Sendable {
    public struct Stored: Codable, Sendable {
        public let deviceId: String
        public let token: String
        public let expiresAt: Date
        public let baseURL: URL
    }

    private let keychain: Keychain
    private let account = "session"
    private let lock = NSLock()
    private var cached: Stored?

    public init(service: String = "app.pulsewatch.session") {
        self.keychain = Keychain(service: service)
    }

    public func load() -> Stored? {
        lock.lock(); defer { lock.unlock() }
        if let cached { return cached }
        guard let data = try? keychain.data(account: account) else { return nil }
        let decoder = JSONDecoder(); decoder.dateDecodingStrategy = .iso8601
        let s = try? decoder.decode(Stored.self, from: data)
        cached = s
        return s
    }

    public func save(_ s: Stored) throws {
        lock.lock(); defer { lock.unlock() }
        let encoder = JSONEncoder(); encoder.dateEncodingStrategy = .iso8601
        try keychain.set(encoder.encode(s), account: account)
        cached = s
    }

    public func clear() throws {
        lock.lock(); defer { lock.unlock() }
        try keychain.remove(account: account)
        cached = nil
    }
}
