import SwiftUI
import PulseWatchAPI
import PulseWatchSync

struct PairWatchView: View {
    @EnvironmentObject private var state: AppState
    @Environment(\.dismiss) private var dismiss

    @State private var code: String?
    @State private var expiresAt: Date?
    @State private var working = false
    @State private var errorMessage: String?
    @State private var sentToWatch = false

    var body: some View {
        NavigationStack {
            VStack(spacing: 24) {
                Image(systemName: "applewatch.and.arrow.forward")
                    .font(.system(size: 56))
                    .foregroundStyle(.tint)

                if let code {
                    Text(formattedCode(code))
                        .font(.system(.largeTitle, design: .monospaced).weight(.semibold))
                        .tracking(8)
                    if let expiresAt {
                        Text("Expires \(expiresAt.formatted(.relative(presentation: .named)))")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                    Text(sentToWatch
                         ? "Sent to your Apple Watch."
                         : "Open PulseWatch on your Apple Watch and accept the prompt.")
                        .multilineTextAlignment(.center)
                        .foregroundStyle(.secondary)
                } else if working {
                    ProgressView()
                } else {
                    Text("Generate a one-time code so your Apple Watch can enroll as its own device.")
                        .multilineTextAlignment(.center)
                        .foregroundStyle(.secondary)
                    Button("Generate code") { Task { await generate() } }
                        .buttonStyle(.borderedProminent)
                }

                if let errorMessage {
                    Text(errorMessage).foregroundStyle(.red).font(.footnote)
                }

                Spacer()
            }
            .padding()
            .navigationTitle("Pair Apple Watch")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }

    private func generate() async {
        working = true; errorMessage = nil
        defer { working = false }
        do {
            let pairing = try await state.client.createPairing()
            code = pairing.code
            expiresAt = ISO8601DateFormatter().date(from: pairing.expires_at)
            // Forward to the watch over WC. The watch consumes it via its own
            // delegate and calls POST /v1/auth/devices on its side.
            if WatchSync.shared.isSupported {
                WatchSync.shared.sendPairingCode(pairing.code)
                sentToWatch = true
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func formattedCode(_ code: String) -> String {
        var s = code
        if s.count == 6 {
            s.insert(" ", at: s.index(s.startIndex, offsetBy: 3))
        }
        return s
    }
}
