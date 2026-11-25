import SwiftUI
import UIKit
import UserNotifications
import VamoKit

/// Notification permission and the APNs token. The app asks at a moment that explains itself
/// (the Notifications screen, or right after a booking), never at launch.
@MainActor @Observable
final class PushCenter {
    private(set) var status: UNAuthorizationStatus = .notDetermined

    func refresh() async {
        status = await UNUserNotificationCenter.current().notificationSettings().authorizationStatus
        // Apple recommends registering on every launch once allowed (tokens can change).
        if status == .authorized || status == .provisional { UIApplication.shared.registerForRemoteNotifications() }
    }

    func requestPermission() async {
        let granted = (try? await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .badge, .sound])) ?? false
        await refresh()
        if granted { UIApplication.shared.registerForRemoteNotifications() }
    }
}

/// UIKit entry points SwiftUI doesn't cover: the APNs token and notification taps.
final class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    @MainActor var session: SessionStore?
    @MainActor var navigator: Navigator?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        return true
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        let token = deviceTokenHex(deviceToken)
        Task { @MainActor in await session?.registerDevice(token: token) }
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        // Expected in Debug and on the simulator without an APNs-enabled signing team ([USER]).
        print("Push registration failed: \(error.localizedDescription)")
    }

    /// Show notifications while the app is open, too (the server already decided they matter).
    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification) async -> UNNotificationPresentationOptions {
        Task { @MainActor in await session?.refreshUnread() }
        return [.banner, .list, .sound, .badge]
    }

    /// A tapped notification opens its link (once signed in, if needed).
    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse) async {
        let link = response.notification.request.content.userInfo["link"] as? String
        await MainActor.run {
            navigator?.pending = PushPayload.link(from: link.map { ["link": $0] } ?? [:])
        }
    }
}

/// "Turn on notifications", shown where it makes sense until the user decides.
struct PushPrompt: View {
    var message = "Get a notification when a booking changes or someone messages you."
    @Environment(PushCenter.self) private var push

    var body: some View {
        if push.status == .notDetermined {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: "bell.badge").font(.title3).foregroundStyle(Color.accentColor)
                VStack(alignment: .leading, spacing: 8) {
                    Text(message).font(.subheadline)
                    Button("Turn on notifications") { Task { await push.requestPermission() } }
                        .buttonStyle(.borderedProminent).controlSize(.small)
                        .accessibilityIdentifier("push.enable")
                }
            }
            .padding(.vertical, 4)
        }
    }
}
