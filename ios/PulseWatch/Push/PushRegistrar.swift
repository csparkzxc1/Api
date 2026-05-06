import Foundation
import UIKit
import UserNotifications
import WidgetKit
import PulseWatchAPI
import PulseWatchModels

/// Bridges the iOS APNs lifecycle with the backend.
///
/// 1. Asks the user for permission once we have a session.
/// 2. Calls `registerForRemoteNotifications` so the OS yields an APNs token.
/// 3. Forwards the token to `PUT /v1/devices/push-token`.
/// 4. On a "complication-refresh" silent push, kicks `WidgetCenter` so the
///    watch face complication and the iOS widget update without waiting for
///    their next scheduled refresh.
@MainActor
final class PushRegistrar: NSObject, UNUserNotificationCenterDelegate {

    static let shared = PushRegistrar()

    private weak var state: AppState?

    func attach(state: AppState) {
        self.state = state
        UNUserNotificationCenter.current().delegate = self
    }

    func requestPermissionAndRegister() {
        let center = UNUserNotificationCenter.current()
        center.requestAuthorization(options: [.alert, .badge, .sound]) { granted, _ in
            guard granted else { return }
            DispatchQueue.main.async {
                UIApplication.shared.registerForRemoteNotifications()
            }
        }
    }

    /// Called from `application(_:didRegisterForRemoteNotificationsWithDeviceToken:)`.
    func deliver(apnsToken: Data) {
        guard let state else { return }
        let hex = apnsToken.map { String(format: "%02x", $0) }.joined()
        Task { @MainActor in
            do {
                try await state.client.putPushToken(.init(
                    platform: .ios,
                    apns_token: hex,
                    apns_environment: PushRegistrar.environment,
                    fcm_token: nil
                ))
            } catch {
                state.lastError = "push registration: \(error.localizedDescription)"
            }
        }
    }

    /// User-foreground notifications: show as banner.
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        completionHandler([.banner, .sound])
    }

    /// User tapped a notification: refresh dashboard + widgets.
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        Task { @MainActor in
            await state?.refresh()
            WidgetCenter.shared.reloadAllTimelines()
            completionHandler()
        }
    }

    private static var environment: PushEnvironment {
        #if DEBUG
        return .sandbox
        #else
        return .production
        #endif
    }
}
