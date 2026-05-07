import Foundation
import SwiftUI
import WidgetKit
#if canImport(WatchKit)
import WatchKit
#endif
import CapAPI
import CapModels
import CapSync
import CapVault

@MainActor
final class WatchAppState: ObservableObject {
    @Published var session: SessionStore.Stored?
    @Published var summary: UsageSummary?
    @Published var lastError: String?

    private let store = SessionStore(service: "app.cap.session")
    private var client: APIClient?
    private var enrollment: EnrollmentFlow?

    init() {
        self.session = store.load()
        rebuildClient()
        WatchSync.shared.onSessionReceived = { [weak self] stored in
            Task { @MainActor in
                guard let self else { return }
                try? self.store.save(stored)
                self.session = stored
                self.rebuildClient()
                await self.refresh()
            }
        }
        WatchSync.shared.onPairingCodeReceived = { [weak self] code in
            Task { @MainActor in
                guard let self else { return }
                await self.consumePairingCode(code)
            }
        }
    }

    func bootstrap() async {
        if session != nil { await refresh() }
    }

    func refresh() async {
        guard let client else { return }
        do {
            summary = try await client.usageSummary(window: .day)
            lastError = nil
        } catch {
            lastError = error.localizedDescription
        }
    }

    private func rebuildClient() {
        guard let s = session else { client = nil; enrollment = nil; return }
        let c = APIClient(baseURL: s.baseURL, session: store)
        self.client = c
        self.enrollment = EnrollmentFlow(client: c)
    }

    /// Watch upgrades from "shared phone session" to "own session" by enrolling
    /// itself with the pairing code received from the phone.
    private func consumePairingCode(_ code: String) async {
        guard let enrollment else {
            lastError = "Receive a session from iPhone first."
            return
        }
        do {
            _ = try await enrollment.enrollDevice(
                platform: .watchos,
                deviceName: WKInterfaceDeviceName(),
                pairingCode: code
            )
            session = store.load()
            await refresh()
        } catch {
            lastError = error.localizedDescription
        }
    }
}

private func WKInterfaceDeviceName() -> String {
    #if canImport(WatchKit)
    return WKInterfaceDevice.current().name
    #else
    return "Apple Watch"
    #endif
}
