import SwiftUI
import PulseWatchAPI
import PulseWatchModels

struct AddAccountView: View {
    @EnvironmentObject private var state: AppState
    @Environment(\.dismiss) private var dismiss

    let onCreated: (Account) -> Void

    @State private var provider: Provider = .anthropic
    @State private var label: String = ""
    @State private var apiKey: String = ""
    @State private var orgId: String = ""
    @State private var working = false
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            Form {
                Section("Provider") {
                    Picker("Provider", selection: $provider) {
                        Text("Anthropic").tag(Provider.anthropic)
                        Text("OpenAI").tag(Provider.openai)
                    }
                    .pickerStyle(.segmented)
                }
                Section("Details") {
                    TextField("Label (e.g. Personal)", text: $label)
                    if provider == .openai {
                        TextField("OpenAI org id (org-…)", text: $orgId)
                            .autocorrectionDisabled()
                            .textInputAutocapitalization(.never)
                    }
                }
                Section {
                    SecureField(provider == .anthropic ? "Admin API key (sk-ant-admin01-…)" : "API key (sk-…)",
                                text: $apiKey)
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)
                } footer: {
                    Text("The key is encrypted on this device with the backend's wrapping public key before being sent. Plaintext never leaves your phone.")
                }
                if let errorMessage {
                    Section { Text(errorMessage).foregroundStyle(.red) }
                }
            }
            .navigationTitle("New Account")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { Task { await save() } }
                        .disabled(working || label.isEmpty || apiKey.count < 8)
                }
            }
        }
    }

    private func save() async {
        working = true; errorMessage = nil
        defer { working = false }
        do {
            let account = try await state.enrollment.enrollProviderAccount(
                provider: provider,
                label: label,
                providerKey: apiKey,
                orgId: provider == .openai ? orgId : nil
            )
            onCreated(account)
            await state.refresh()
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
