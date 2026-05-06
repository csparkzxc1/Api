import SwiftUI
import PulseWatchModels

struct GlanceView: View {
    @EnvironmentObject private var state: WatchAppState

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                if let summary = state.summary {
                    ForEach(summary.providers) { p in
                        ProviderRing(summary: p)
                    }
                    if summary.providers.isEmpty {
                        Text("Add an account on iPhone")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                } else if let err = state.lastError {
                    Text(err).foregroundStyle(.red).font(.footnote)
                } else {
                    ProgressView()
                }
            }
            .padding(.horizontal)
        }
        .navigationTitle("PulseWatch")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { Task { await state.refresh() } } label: {
                    Image(systemName: "arrow.clockwise")
                }
            }
        }
    }
}

struct ProviderRing: View {
    let summary: ProviderSummary

    var body: some View {
        HStack(spacing: 12) {
            ZStack {
                Circle().stroke(.quaternary, lineWidth: 4)
                Circle()
                    .trim(from: 0, to: CGFloat(summary.percent ?? 0))
                    .stroke(tint, style: StrokeStyle(lineWidth: 4, lineCap: .round))
                    .rotationEffect(.degrees(-90))
                Text(summary.percent.map { "\(Int($0 * 100))" } ?? "—")
                    .font(.caption.monospacedDigit().bold())
            }
            .frame(width: 44, height: 44)

            VStack(alignment: .leading, spacing: 2) {
                Text(summary.provider.rawValue.capitalized).font(.footnote.bold())
                Text(usedText).font(.caption2.monospacedDigit())
                    .foregroundStyle(.secondary)
            }
            Spacer()
        }
    }

    private var tint: Color {
        guard let p = summary.percent else { return .accentColor }
        return p > 0.9 ? .red : (p > 0.75 ? .orange : .accentColor)
    }

    private var usedText: String {
        switch summary.unit {
        case .usd: return String(format: "$%.2f", summary.used)
        case .tokens: return "\(Int(summary.used)) tk"
        case .requests: return "\(Int(summary.used)) req"
        }
    }
}
