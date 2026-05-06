import WidgetKit
import Foundation
import PulseWatchAPI
import PulseWatchModels
import PulseWatchVault

struct UsageEntry: TimelineEntry {
    let date: Date
    let provider: ProviderSummary?
    let placeholder: Bool
}

struct UsageProvider: TimelineProvider {
    private let store = SessionStore(service: "app.pulsewatch.session")

    func placeholder(in context: Context) -> UsageEntry {
        UsageEntry(date: Date(), provider: sample, placeholder: true)
    }

    func getSnapshot(in context: Context, completion: @escaping (UsageEntry) -> Void) {
        Task {
            let entry = await fetchOnce() ?? UsageEntry(date: Date(), provider: sample, placeholder: true)
            completion(entry)
        }
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<UsageEntry>) -> Void) {
        Task {
            let now = Date()
            let entry = (await fetchOnce()) ?? UsageEntry(date: now, provider: nil, placeholder: false)
            // Refresh every 15 minutes; on watchOS, the system caps actual cadence.
            let next = now.addingTimeInterval(15 * 60)
            completion(Timeline(entries: [entry], policy: .after(next)))
        }
    }

    private func fetchOnce() async -> UsageEntry? {
        guard let stored = store.load() else { return nil }
        let client = APIClient(baseURL: stored.baseURL, session: store)
        do {
            let summary = try await client.usageSummary(window: .day)
            // Pick the highest-percent provider so the complication shows the
            // wrist-glance metric users actually care about: the most-stressed quota.
            let pick = summary.providers.max(by: { ($0.percent ?? 0) < ($1.percent ?? 0) })
            return UsageEntry(date: Date(), provider: pick, placeholder: false)
        } catch {
            return UsageEntry(date: Date(), provider: nil, placeholder: false)
        }
    }

    private var sample: ProviderSummary {
        ProviderSummary(
            provider: .anthropic,
            label: "Claude",
            used: 12.40,
            limit: 20.0,
            unit: .usd,
            percent: 0.62,
            resets_at: nil,
            projected_exhaustion_at: nil
        )
    }
}
