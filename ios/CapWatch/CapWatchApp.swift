import SwiftUI
import WidgetKit
import CapAPI
import CapSync

@main
struct CapWatchApp: App {
    @StateObject private var state = WatchAppState()

    init() {
        WatchSync.shared.activate()
    }

    var body: some Scene {
        WindowGroup {
            RootWatchView().environmentObject(state)
        }
    }
}

struct RootWatchView: View {
    @EnvironmentObject private var state: WatchAppState

    var body: some View {
        Group {
            if state.session == nil {
                WaitingForPhoneView()
            } else {
                GlanceView()
            }
        }
        .task { await state.bootstrap() }
        .onChange(of: state.summary?.generated_at) { _, _ in
            WidgetCenter.shared.reloadAllTimelines()
        }
    }
}

struct WaitingForPhoneView: View {
    var body: some View {
        VStack(spacing: 8) {
            Image(systemName: "applewatch.and.arrow.forward")
                .font(.largeTitle)
            Text("Open Cap on iPhone and tap")
                .font(.footnote)
                .multilineTextAlignment(.center)
            Text("Pair Apple Watch")
                .font(.footnote.bold())
                .multilineTextAlignment(.center)
        }
        .padding()
    }
}
