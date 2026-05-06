import SwiftUI
import PulseWatchAPI
import PulseWatchVault

@main
struct PulseWatchApp: App {
    @StateObject private var state = AppState()

    var body: some Scene {
        WindowGroup {
            RootView().environmentObject(state)
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
