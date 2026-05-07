import Foundation
import SwiftUI
import CapAPI
import CapModels
import CapVault

@MainActor
final class AppState: ObservableObject {
    @Published var baseURL: URL
    @Published var session: SessionStore.Stored?
    @Published var accounts: [Account] = []
    @Published var summary: UsageSummary?
    @Published var lastError: String?

    let store: SessionStore
    private(set) var client: APIClient
    private(set) var enrollment: EnrollmentFlow

    init() {
        let store = SessionStore()
        let stored = store.load()
        let url = stored?.baseURL ?? URL(string: "https://api.cap.app")!
        self.store = store
        self.session = stored
        self.baseURL = url
        let client = APIClient(baseURL: url, session: store)
        self.client = client
        self.enrollment = EnrollmentFlow(client: client)
    }

    func updateBaseURL(_ url: URL) {
        baseURL = url
        client = APIClient(baseURL: url, session: store)
        enrollment = EnrollmentFlow(client: client)
    }

    func refresh() async {
        guard session != nil else { return }
        do {
            async let a = client.listAccounts()
            async let s = client.usageSummary(window: .day)
            self.accounts = try await a
            self.summary = try await s
            self.lastError = nil
        } catch {
            self.lastError = error.localizedDescription
        }
    }

    func enroll(deviceName: String?) async throws {
        _ = try await enrollment.enrollPhone(deviceName: deviceName)
        self.session = store.load()
    }

    func signOut() {
        try? store.clear()
        session = nil
        accounts = []
        summary = nil
    }
}
