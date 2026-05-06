import SwiftUI

struct OnboardingView: View {
    @EnvironmentObject private var state: AppState
    @State private var serverURL: String = "https://api.pulsewatch.app"
    @State private var deviceName: String = UIDevice.current.name
    @State private var working = false
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            Form {
                Section("Backend") {
                    TextField("https://api.example.com", text: $serverURL)
                        .keyboardType(.URL)
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)
                }
                Section("This device") {
                    TextField("Device name", text: $deviceName)
                }
                if let errorMessage {
                    Section { Text(errorMessage).foregroundStyle(.red) }
                }
                Section {
                    Button {
                        Task { await register() }
                    } label: {
                        if working { ProgressView() } else { Text("Continue") }
                    }
                    .disabled(working || URL(string: serverURL) == nil)
                }
            }
            .navigationTitle("PulseWatch")
        }
    }

    private func register() async {
        guard let url = URL(string: serverURL) else { return }
        working = true; errorMessage = nil
        defer { working = false }
        state.updateBaseURL(url)
        do {
            try await state.enroll(deviceName: deviceName.isEmpty ? nil : deviceName)
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
