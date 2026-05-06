#if canImport(WatchConnectivity)
import Foundation
import WatchConnectivity
import PulseWatchVault
import PulseWatchModels

/// Cross-platform thin wrapper over `WCSession` used by both the phone and
/// watch apps. Forwards the bearer session and any pairing codes between the
/// paired devices.
public final class WatchSync: NSObject, WCSessionDelegate, @unchecked Sendable {
    public enum Payload: String { case session, pairingCode }

    public static let shared = WatchSync()
    public var onSessionReceived: ((SessionStore.Stored) -> Void)?
    public var onPairingCodeReceived: ((String) -> Void)?

    private override init() { super.init() }

    public var isSupported: Bool { WCSession.isSupported() }

    public func activate() {
        guard WCSession.isSupported() else { return }
        let s = WCSession.default
        s.delegate = self
        s.activate()
    }

    /// Phone → Watch: forward the bearer session so the watch can call the API
    /// directly. Uses `transferUserInfo` so delivery is guaranteed even when
    /// the watch is currently asleep.
    public func sendSession(_ stored: SessionStore.Stored) throws {
        let encoder = JSONEncoder(); encoder.dateEncodingStrategy = .iso8601
        let payload: [String: Any] = [
            "kind": Payload.session.rawValue,
            "data": try encoder.encode(stored)
        ]
        WCSession.default.transferUserInfo(payload)
    }

    /// Phone → Watch: forward a pairing code so the watch can call
    /// `POST /v1/auth/devices` and obtain its own device session.
    public func sendPairingCode(_ code: String) {
        let payload: [String: Any] = [
            "kind": Payload.pairingCode.rawValue,
            "code": code
        ]
        WCSession.default.transferUserInfo(payload)
    }

    // MARK: WCSessionDelegate

    public func session(
        _ session: WCSession,
        activationDidCompleteWith activationState: WCSessionActivationState,
        error: Error?
    ) {}

    #if os(iOS)
    public func sessionDidBecomeInactive(_ session: WCSession) {}
    public func sessionDidDeactivate(_ session: WCSession) { session.activate() }
    #endif

    public func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any] = [:]) {
        guard let kindRaw = userInfo["kind"] as? String,
              let kind = Payload(rawValue: kindRaw) else { return }
        switch kind {
        case .session:
            guard let data = userInfo["data"] as? Data else { return }
            let decoder = JSONDecoder(); decoder.dateDecodingStrategy = .iso8601
            if let stored = try? decoder.decode(SessionStore.Stored.self, from: data) {
                onSessionReceived?(stored)
            }
        case .pairingCode:
            if let code = userInfo["code"] as? String { onPairingCodeReceived?(code) }
        }
    }
}
#endif
