import SwiftUI

struct SettingsView: View {
    @EnvironmentObject private var state: AppState

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
        }
    }
}

private extension Bundle {
    var shortVersion: String {
        (infoDictionary?["CFBundleShortVersionString"] as? String) ?? "0.0"
    }
}
