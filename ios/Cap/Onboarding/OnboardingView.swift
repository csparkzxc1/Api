import SwiftUI
import CapUI

struct OnboardingView: View {
    @EnvironmentObject private var state: AppState
    @State private var serverURL: String = "https://api.cap.app"
    @State private var deviceName: String = UIDevice.current.name
    @State private var working = false
    @State private var errorMessage: String?

    var body: some View {
        ZStack {
            Theme.Colors.bg.ignoresSafeArea()
            VStack(alignment: .leading, spacing: 28) {
                HStack(spacing: 12) {
                    BrandDot(.claude, size: 6)
                    Text("CAP · v0.1")
                        .font(Theme.font(.monoXS))
                        .tracking(Theme.Tracking.labelCaps)
                        .foregroundStyle(Theme.Colors.textDim)
                }

                VStack(alignment: .leading, spacing: 4) {
                    Text("Cap.")
                        .font(Theme.font(.displayLG))
                        .italic()
                        .foregroundStyle(Theme.Colors.text)
                    Text("Your AI usage,")
                        .font(Theme.font(.displayLG))
                        .italic()
                        .foregroundStyle(Theme.Colors.claude)
                    Text("at a wrist's glance.")
                        .font(Theme.font(.displayLG))
                        .italic()
                        .foregroundStyle(Theme.Colors.text)
                }

                VStack(alignment: .leading, spacing: 14) {
                    Field(label: "BACKEND", text: $serverURL, placeholder: "https://api.example.com", monospaced: true)
                    Field(label: "DEVICE",  text: $deviceName, placeholder: "iPhone", monospaced: false)
                }

                if let errorMessage {
                    HStack(alignment: .top, spacing: 8) {
                        Image(systemName: "exclamationmark.triangle.fill")
                            .foregroundStyle(Theme.Colors.warn)
                        Text(errorMessage)
                            .font(Theme.font(.bodyMD))
                            .foregroundStyle(Theme.Colors.text)
                    }
                }

                Spacer()

                Button { Task { await register() } } label: {
                    HStack {
                        if working {
                            ProgressView().tint(Theme.Colors.bg)
                        } else {
                            Text("CONTINUE")
                                .font(Theme.font(.monoSM))
                                .tracking(Theme.Tracking.labelCaps)
                                .foregroundStyle(Theme.Colors.bg)
                        }
                        Spacer()
                        Image(systemName: "arrow.right")
                            .foregroundStyle(Theme.Colors.bg)
                    }
                    .padding(.vertical, 16)
                    .padding(.horizontal, 18)
                    .background(Theme.Colors.claude, in: RoundedRectangle(cornerRadius: Theme.Radius.pill, style: .continuous))
                }
                .disabled(working || URL(string: serverURL) == nil)
            }
            .padding(.horizontal, 24)
            .padding(.top, 64)
            .padding(.bottom, 24)
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

private struct Field: View {
    let label: String
    @Binding var text: String
    let placeholder: String
    let monospaced: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label)
                .font(Theme.font(.monoXS))
                .tracking(Theme.Tracking.labelCaps)
                .foregroundStyle(Theme.Colors.textDim)
            TextField(placeholder, text: $text)
                .font(monospaced ? Theme.font(.monoSM) : Theme.font(.bodyLG))
                .foregroundStyle(Theme.Colors.text)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .padding(.vertical, 10)
                .padding(.horizontal, 14)
                .background(Theme.Colors.panel, in: RoundedRectangle(cornerRadius: Theme.Radius.chip, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: Theme.Radius.chip, style: .continuous)
                        .stroke(Theme.Colors.border, lineWidth: 1)
                )
        }
    }
}
