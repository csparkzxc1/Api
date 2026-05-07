import SwiftUI
import CapModels
import CapUI

struct GlanceView: View {
    @EnvironmentObject private var state: WatchAppState

    var body: some View {
        ZStack {
            Theme.Colors.bg.ignoresSafeArea()
            VStack(spacing: 8) {
                header
                content
            }
            .padding(.horizontal, 4)
        }
    }

    private var header: some View {
        HStack {
            Text("Cap")
                .font(Theme.font(.serifBody))
                .italic()
                .foregroundStyle(Theme.Colors.claude)
            Spacer()
            Text(timeString)
                .font(Theme.font(.monoXS))
                .foregroundStyle(Theme.Colors.textDim)
        }
    }

    @ViewBuilder
    private var content: some View {
        if let summary = state.summary, !summary.providers.isEmpty {
            DualGlance(
                claude: pick(.anthropic, in: summary.providers),
                codex:  pick(.openai,    in: summary.providers)
            )
        } else if let err = state.lastError {
            VStack(spacing: 6) {
                Image(systemName: "exclamationmark.triangle.fill")
                    .foregroundStyle(Theme.Colors.warn)
                Text(err)
                    .font(Theme.font(.bodySM))
                    .foregroundStyle(Theme.Colors.text)
                    .multilineTextAlignment(.center)
            }
        } else if state.summary?.providers.isEmpty == true {
            Text("Add an account on iPhone")
                .font(Theme.font(.bodySM))
                .foregroundStyle(Theme.Colors.textDim)
                .multilineTextAlignment(.center)
        } else {
            ProgressView().tint(Theme.Colors.textDim)
        }
    }

    private func pick(_ p: Provider, in list: [ProviderSummary]) -> ProviderSummary? {
        list.first(where: { $0.provider == p })
    }

    private var timeString: String {
        let f = DateFormatter(); f.dateFormat = "HH:mm"
        return f.string(from: Date())
    }
}

private struct DualGlance: View {
    let claude: ProviderSummary?
    let codex: ProviderSummary?

    var body: some View {
        VStack(spacing: 8) {
            ZStack {
                DualRing(
                    outer: claude?.percent ?? 0,
                    inner: codex?.percent  ?? 0
                )
                VStack(spacing: -2) {
                    HStack(alignment: .firstTextBaseline, spacing: 1) {
                        Text("\(Int((claude?.percent ?? 0) * 100))")
                            .font(Theme.font(.monoLG))
                            .foregroundStyle(Theme.Colors.text)
                        Text("%")
                            .font(Theme.font(.monoSM))
                            .foregroundStyle(Theme.Colors.textDim)
                    }
                    Text("CLAUDE")
                        .font(Theme.font(.mono2XS))
                        .tracking(Theme.Tracking.labelCaps)
                        .foregroundStyle(Theme.Colors.textDim)
                }
            }
            .frame(width: 130, height: 130)

            HStack(alignment: .center) {
                statItem(dot: .claude, value: percentText(claude))
                Spacer()
                resetCountdown(from: claude)
                Spacer()
                statItem(dot: .codex, value: dollarText(codex))
            }
            .padding(.horizontal, 8)
            .padding(.top, 4)
            .frame(maxWidth: .infinity)
        }
    }

    private func statItem(dot: BrandDot.Accent, value: String) -> some View {
        VStack(spacing: 3) {
            BrandDot(dot, size: 6)
            Text(value)
                .font(Theme.font(.bodySM))
                .foregroundStyle(Theme.Colors.text)
        }
    }

    private func resetCountdown(from p: ProviderSummary?) -> some View {
        let txt: String = {
            guard let s = p?.resets_at, let when = ISO8601DateFormatter().date(from: s) else { return "—" }
            let mins = max(0, Int(when.timeIntervalSinceNow / 60))
            let h = mins / 60; let m = mins % 60
            return h > 0 ? "\(h)h \(m)m" : "\(m)m"
        }()
        return VStack(spacing: 1) {
            Text(txt)
                .font(Theme.font(.bodySM))
                .foregroundStyle(Theme.Colors.warn)
            Text("UNTIL RESET")
                .font(Theme.font(.mono2XS))
                .tracking(Theme.Tracking.labelCaps)
                .foregroundStyle(Theme.Colors.textDim)
        }
    }

    private func percentText(_ p: ProviderSummary?) -> String {
        p?.percent.map { "\(Int($0 * 100))%" } ?? "—"
    }
    private func dollarText(_ p: ProviderSummary?) -> String {
        guard let p else { return "—" }
        return p.unit == .usd ? String(format: "$%.2f", p.used) : "\(Int(p.used)) tk"
    }
}
