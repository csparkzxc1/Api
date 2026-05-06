import SwiftUI
import PulseWatchAPI
import PulseWatchSync
import PulseWatchVault

@main
struct PulseWatchApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) var appDelegate
    @StateObject private var state = AppState()

    init() {
        WatchSync.shared.activate()
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(state)
                .task {
                    PushRegistrar.shared.attach(state: state)
                    if state.session != nil {
                        PushRegistrar.shared.requestPermissionAndRegister()
                    }
                }
                .onChange(of: state.session?.token) { _, newToken in
                    if let stored = state.session {
                        try? WatchSync.shared.sendSession(stored)
                    }
                    if newToken != nil {
                        PushRegistrar.shared.requestPermissionAndRegister()
                    }
                }
        }
    }
}

struct RootView: View {
    @EnvironmentObject private var state: AppState

    var body: some View {
        Group {
            if state.session == nil {
                OnboardingView()
            } else {
                MainTabs()
            }
        }
        .task { await state.refresh() }
    }
}

struct MainTabs: View {
    var body: some View {
        TabView {
            DashboardView()
                .tabItem { Label("Dashboard", systemImage: "chart.bar.fill") }
            AccountsView()
                .tabItem { Label("Accounts", systemImage: "key.fill") }
            SettingsView()
                .tabItem { Label("Settings", systemImage: "gearshape.fill") }
        }
    }
}
