import WidgetKit
import SwiftUI
import CapModels
import CapUI

struct UsageComplication: Widget {
    let kind: String = "UsageComplication"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: UsageProvider()) { entry in
            UsageComplicationView(entry: entry)
                .containerBackground(.fill.tertiary, for: .widget)
        }
        .configurationDisplayName("Usage")
        .description("AI API usage at a glance.")
        .supportedFamilies([
            .accessoryCorner,
            .accessoryCircular,
            .accessoryRectangular,
            .accessoryInline
        ])
    }
}

struct UsageComplicationView: View {
    @Environment(\.widgetFamily) private var family
    let entry: UsageEntry

    var body: some View {
        switch family {
        case .accessoryCorner: cornerView
        case .accessoryCircular: circularView
        case .accessoryRectangular: rectangularView
        case .accessoryInline: inlineView
        default: circularView
        }
    }

    private var inlineView: some View {
        Text(inlineText)
    }

    private var circularView: some View {
        Gauge(value: entry.provider?.percent ?? 0) {
            Text(providerInitial)
        } currentValueLabel: {
            Text(percentText)
                .font(.caption2.monospacedDigit())
        }
        .gaugeStyle(.accessoryCircularCapacity)
        .tint(tint)
    }

    private var cornerView: some View {
        Text(percentText)
            .font(.caption2.monospacedDigit())
            .widgetCurvesContent()
            .widgetLabel { Text(entry.provider?.provider.rawValue.capitalized ?? "Cap") }
    }

    private var rectangularView: some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack {
                Text(entry.provider?.provider.rawValue.capitalized ?? "Cap")
                    .font(.caption2.bold())
                Spacer()
                Text(percentText).font(.caption2.monospacedDigit())
            }
            ProgressView(value: entry.provider?.percent ?? 0)
                .tint(tint)
            Text(usedText)
                .font(.caption2.monospacedDigit())
                .foregroundStyle(.secondary)
        }
    }

    // MARK: - helpers

    private var providerInitial: String {
        switch entry.provider?.provider {
        case .anthropic: return "C"
        case .openai: return "O"
        default: return "•"
        }
    }

    private var percentText: String {
        guard let p = entry.provider?.percent else { return "—" }
        return "\(Int(p * 100))%"
    }

    private var inlineText: String {
        guard let p = entry.provider else { return "Cap" }
        let pct = p.percent.map { "\(Int($0 * 100))%" } ?? "—"
        return "\(p.provider.rawValue.capitalized) \(pct)"
    }

    private var usedText: String {
        guard let p = entry.provider else { return "—" }
        switch p.unit {
        case .usd: return String(format: "$%.2f", p.used)
        case .tokens: return "\(Int(p.used)) tk"
        case .requests: return "\(Int(p.used)) req"
        }
    }

    private var tint: Color {
        let providerColor: Color = entry.provider?.provider == .openai
            ? Theme.Colors.codex : Theme.Colors.claude
        guard let pct = entry.provider?.percent else { return providerColor }
        return pct > 0.9 ? Color(hex: 0xE11D48)
             : pct > 0.75 ? Theme.Colors.warn
             : providerColor
    }
}

private extension Color {
    init(hex: UInt32) {
        let r = Double((hex >> 16) & 0xFF) / 255
        let g = Double((hex >>  8) & 0xFF) / 255
        let b = Double( hex        & 0xFF) / 255
        self.init(red: r, green: g, blue: b)
    }
}

private extension View {
    @ViewBuilder
    func widgetCurvesContent() -> some View {
        if #available(watchOS 10.0, *) {
            self.widgetCurvesContentWhenAvailable()
        } else {
            self
        }
    }

    @available(watchOS 10.0, *)
    @ViewBuilder
    func widgetCurvesContentWhenAvailable() -> some View {
        // placeholder no-op; corner widgets curve automatically when the
        // content is a Text-shaped view, which it already is here.
        self
    }
}
