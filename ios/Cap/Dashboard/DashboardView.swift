import SwiftUI
import CapModels
import CapUI

struct DashboardView: View {
    @EnvironmentObject private var state: AppState

    var body: some View {
        ZStack {
            Theme.Colors.bg.ignoresSafeArea()
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    Greeting()
                    StatusRow(servicesCount: state.accounts.count, lastSyncSeconds: 12)

                    if let summary = state.summary {
                        ForEach(summary.providers) { p in
                            ProviderCard(summary: p)
                        }
                        if summary.providers.isEmpty { EmptyState() }
                    } else if let err = state.lastError {
                        ErrorBanner(message: err)
                    } else {
                        ProgressView().tint(Theme.Colors.textDim)
                    }

                    QuickActionsRow()
                }
                .padding(.horizontal, 18)
                .padding(.top, 12)
                .padding(.bottom, 24)
            }
            .refreshable { await state.refresh() }
        }
    }
}

// MARK: - Greeting + status -----------------------------------------------

private struct Greeting: View {
    var body: some View {
        let hour = Calendar.current.component(.hour, from: Date())
        let kind: String = hour < 12 ? "Good morning" : (hour < 18 ? "Good afternoon" : "Good evening")
        VStack(alignment: .leading, spacing: 2) {
            Text(kind + ",")
                .font(Theme.font(.displayMD))
                .foregroundStyle(Theme.Colors.text)
            Text("welcome back")
                .font(Theme.font(.displayMD))
                .italic()
                .foregroundStyle(Theme.Colors.claude)
        }
    }
}

private struct StatusRow: View {
    let servicesCount: Int
    let lastSyncSeconds: Int
    var body: some View {
        HStack(spacing: 8) {
            BrandDot(.success, size: 5)
            Text("\(servicesCount) services connected · synced \(lastSyncSeconds)s ago")
                .font(Theme.font(.bodySM))
                .tracking(0.5)
                .foregroundStyle(Theme.Colors.textDim)
        }
    }
}

// MARK: - Provider card ---------------------------------------------------

struct ProviderCard: View {
    let summary: ProviderSummary

    var body: some View {
        let accent: BrandDot.Accent = summary.provider == .anthropic ? .claude : .codex
        let cardAccent: HaloCard<AnyView>.Accent = summary.provider == .anthropic ? .claude : .codex
        HaloCard(accent: cardAccent) {
            AnyView(
                VStack(alignment: .leading, spacing: 16) {
                    header(accent: accent)
                    body(accent: accent)
                    Sparkline(values: sparklineValues, nowIndex: 6, accent: accent)
                    axis
                }
            )
        }
    }

    @ViewBuilder
    private func header(accent: BrandDot.Accent) -> some View {
        HStack {
            HStack(spacing: 8) {
                BrandDot(accent)
                Text(headerText.uppercased())
                    .font(Theme.font(.monoSM))
                    .tracking(Theme.Tracking.mediumCaps)
                    .foregroundStyle(Theme.Colors.text)
            }
            Spacer()
            Text(rightLabel)
                .font(Theme.font(.bodySM))
                .foregroundStyle(Theme.Colors.textDim)
        }
    }

    @ViewBuilder
    private func body(accent: BrandDot.Accent) -> some View {
        HStack(spacing: 18) {
            ZStack {
                Donut(progress: progress, accent: accent, lineWidth: 8, diameter: 78)
                HStack(alignment: .firstTextBaseline, spacing: 1) {
                    Text("\(Int(progress * 100))")
                        .font(Theme.font(.monoMD))
                        .foregroundStyle(Theme.Colors.text)
                    Text("%")
                        .font(Theme.font(.bodySM))
                        .foregroundStyle(Theme.Colors.textDim)
                }
            }
            VStack(alignment: .leading, spacing: 7) {
                ForEach(infoRows, id: \.0) { row in
                    HStack {
                        Text(row.0)
                            .font(Theme.font(.monoSM))
                            .foregroundStyle(Theme.Colors.textDim)
                        Spacer()
                        Text(row.1)
                            .font(Theme.font(.monoSM))
                            .foregroundStyle(Theme.Colors.text)
                    }
                }
            }
        }
    }

    private var axis: some View {
        HStack {
            Text(axisLabels.0)
            Spacer()
            Text(axisLabels.1)
            Spacer()
            Text(axisLabels.2)
        }
        .font(Theme.font(.mono2XS))
        .tracking(Theme.Tracking.labelCaps)
        .foregroundStyle(Theme.Colors.textFaint)
        .padding(.top, 2)
    }

    // Display values. Replace with server-driven projection when
    // /v1/usage/summary returns it. Kept here so this view file stays
    // self-contained.
    private var headerText: String {
        summary.provider == .anthropic ? "Claude Code · Max" : "OpenAI · Codex"
    }
    private var rightLabel: String {
        switch summary.unit {
        case .usd:      return "$\(format(summary.used)) today"
        case .tokens:   return "\(Int(summary.used).formatted(.number)) tokens"
        case .requests: return "\(Int(summary.used).formatted(.number)) requests"
        }
    }
    private var progress: Double { summary.percent ?? 0 }
    private var infoRows: [(String, String)] {
        if summary.provider == .anthropic {
            return [
                ("Used",   "\(Int(summary.used).formatted(.number))"),
                ("Limit",  summary.limit.map { "\(Int($0).formatted(.number))" } ?? "—"),
                ("Window", "5h rolling"),
            ]
        } else {
            return [
                ("Today",  "$\(format(summary.used)) / $\(format(summary.limit ?? 0))"),
                ("Unit",   summary.unit.rawValue),
                ("Reset",  resetText),
            ]
        }
    }
    private var resetText: String {
        guard let s = summary.resets_at, let when = ISO8601DateFormatter().date(from: s) else { return "—" }
        return when.formatted(.relative(presentation: .named))
    }
    private var axisLabels: (String, String, String) {
        summary.provider == .anthropic
            ? ("−5h", "NOW", "+5h")
            : ("00:00", "NOW", "23:59")
    }
    private var sparklineValues: [Double] {
        if summary.provider == .anthropic {
            return [0.24, 0.38, 0.55, 0.42, 0.68, 0.80, 0.62, 0, 0, 0, 0, 0]
        } else {
            return [0.18, 0.34, 0.48, 0.62, 0.55, 0.78, 0.88, 0, 0, 0, 0, 0]
        }
    }
    private func format(_ n: Double) -> String { String(format: "%.2f", n) }
}

// MARK: - Quick actions ---------------------------------------------------

private struct QuickActionsRow: View {
    var body: some View {
        HStack(spacing: 10) {
            QuickAction(label: "Alerts", value: "80 / 95%")
            QuickAction(label: "Sync",   value: "5 min")
        }
    }
}

private struct QuickAction: View {
    let label: String
    let value: String
    var body: some View {
        HStack {
            Text(label.uppercased())
                .font(Theme.font(.bodySM))
                .tracking(Theme.Tracking.mediumCaps)
                .foregroundStyle(Theme.Colors.textDim)
            Spacer()
            Text(value)
                .font(Theme.font(.bodySM))
                .foregroundStyle(Theme.Colors.text)
        }
        .padding(12)
        .background(Theme.Colors.panel2, in: RoundedRectangle(cornerRadius: Theme.Radius.pill, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.pill, style: .continuous)
                .stroke(Theme.Colors.border, lineWidth: 1)
        )
    }
}

// MARK: - Empty / error states --------------------------------------------

private struct EmptyState: View {
    var body: some View {
        VStack(spacing: 8) {
            Image(systemName: "waveform.path.ecg")
                .font(.title)
                .foregroundStyle(Theme.Colors.textDim)
            Text("No accounts yet")
                .font(Theme.font(.serifBody))
                .foregroundStyle(Theme.Colors.text)
            Text("Add Anthropic or OpenAI on the Accounts tab to start tracking.")
                .font(Theme.font(.bodyMD))
                .foregroundStyle(Theme.Colors.textDim)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(24)
    }
}

private struct ErrorBanner: View {
    let message: String
    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundStyle(Theme.Colors.warn)
            Text(message)
                .font(Theme.font(.bodyMD))
                .foregroundStyle(Theme.Colors.text)
            Spacer()
        }
        .padding(14)
        .background(Theme.Colors.panel)
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.chip, style: .continuous)
                .stroke(Theme.Colors.borderBright, lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: Theme.Radius.chip, style: .continuous))
    }
}
