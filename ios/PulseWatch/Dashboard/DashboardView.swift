import SwiftUI
import PulseWatchModels

struct DashboardView: View {
    @EnvironmentObject private var state: AppState

    var body: some View {
        NavigationStack {
            List {
                if let summary = state.summary {
                    Section("Today") {
                        ForEach(summary.providers) { p in
                            ProviderCard(summary: p)
                        }
                        if summary.providers.isEmpty {
                            ContentUnavailableView(
                                "No usage yet",
                                systemImage: "waveform.path.ecg",
                                description: Text("Add an Anthropic or OpenAI account to start tracking.")
                            )
                        }
                    }
                } else if state.lastError != nil {
                    Text(state.lastError ?? "")
                        .foregroundStyle(.red)
                } else {
                    ProgressView()
                }
            }
            .navigationTitle("Dashboard")
            .refreshable { await state.refresh() }
        }
    }
}

struct ProviderCard: View {
    let summary: ProviderSummary

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(summary.provider.rawValue.capitalized).font(.headline)
                Spacer()
                if let percent = summary.percent {
                    Text("\(Int(percent * 100))%")
                        .font(.subheadline.monospacedDigit())
                        .foregroundStyle(percent > 0.9 ? .red : .secondary)
                }
            }
            Text(formatUsed())
                .font(.title2.monospacedDigit())
            if let resetsAt = summary.resets_at, let when = ISO8601DateFormatter().date(from: resetsAt) {
                Text("Resets \(when.formatted(.relative(presentation: .named)))")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            if let percent = summary.percent {
                ProgressView(value: percent)
                    .tint(percent > 0.9 ? .red : .accentColor)
            }
        }
        .padding(.vertical, 4)
    }

    private func formatUsed() -> String {
        switch summary.unit {
        case .usd:
            let f = NumberFormatter(); f.numberStyle = .currency; f.currencyCode = "USD"
            return f.string(from: NSNumber(value: summary.used)) ?? "$\(summary.used)"
        case .tokens:
            return "\(Int(summary.used).formatted(.number)) tokens"
        case .requests:
            return "\(Int(summary.used).formatted(.number)) requests"
        }
    }
}
