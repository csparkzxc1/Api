import SwiftUI

struct SettingsView: View {
    @EnvironmentObject private var state: AppState
    @State private var pairing = false

    var body: some View {
        NavigationStack {
            Form {
                Section("Backend") {
                    LabeledContent("URL", value: state.baseURL.absoluteString)
                    if let session = state.session {
                        LabeledContent("Device", value: session.deviceId)
                        LabeledContent("Expires") {
                            Text(session.expiresAt, style: .date)
                        }
                    }
                }
                Section("Apple Watch") {
                    Button {
                        pairing = true
                    } label: {
                        Label("Pair Apple Watch", systemImage: "applewatch.and.arrow.forward")
                    }
                }
                Section {
                    Button("Sign out", role: .destructive) {
                        state.signOut()
                    }
                }
                Section {
                    LabeledContent("Version", value: Bundle.main.shortVersion)
                }
            }
            .navigationTitle("Settings")
            .sheet(isPresented: $pairing) {
                PairWatchView()
            }
        }
    }
}

private extension Bundle {
    var shortVersion: String {
        (infoDictionary?["CFBundleShortVersionString"] as? String) ?? "0.0"
    }
}
