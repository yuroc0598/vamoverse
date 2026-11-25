import SwiftUI
import VamoKit

enum AppTab: Hashable {
    // Players and parents
    case home, find, messages, profile
    // Providers
    case today, schedule, crew, money
}

/// The selected tab and each tab's navigation stack. Anything that opens a screen by link
/// (notification taps, in-app links, the Debug `-VamoOpenLink` launch argument, later push and
/// universal links) calls `open(_:)`.
@MainActor @Observable
final class Navigator {
    var selected: AppTab = .home
    var paths: [AppTab: [AppLink]] = [:]
    /// Opened once the tabs appear (set before sign-in completes, e.g. by onboarding or launch).
    var pending: AppLink?
    /// The assistant sheet (one for the whole app, over any tab).
    var assistantOpen = false

    func path(for tab: AppTab) -> Binding<[AppLink]> {
        Binding { self.paths[tab] ?? [] } set: { self.paths[tab] = $0 }
    }

    /// Resets to the role's first tab (after sign-in or sign-out).
    func reset(isProvider: Bool) {
        paths = [:]
        assistantOpen = false
        selected = isProvider ? .today : .home
    }

    func open(_ link: AppLink, isProvider: Bool) {
        if let tab = rootTab(for: link, isProvider: isProvider) {
            selected = tab
            paths[tab] = []
            return
        }
        paths[selected, default: []].append(link)
    }

    /// Links that are a tab's root switch to that tab instead of pushing.
    private func rootTab(for link: AppLink, isProvider: Bool) -> AppTab? {
        switch link {
        case .home: isProvider ? .today : .home
        case .find: isProvider ? nil : .find
        case .messages: isProvider ? nil : .messages
        case .settings: isProvider ? nil : .profile
        case .schedule: isProvider ? .schedule : nil
        case .crew: isProvider ? .crew : nil
        case .money: isProvider ? .money : nil
        default: nil
        }
    }
}

/// The screen for a link pushed onto a tab's stack.
struct LinkDestination: View {
    let link: AppLink
    let account: Account

    var body: some View {
        switch link {
        case .home: if account.isProvider { ProviderTodayScreen(account: account) } else { HomeScreen(account: account) }
        case .find: FindScreen()
        case .provider(let slug): ProviderScreen(slug: slug, account: account)
        case .session(let id): SessionScreen(sessionId: id)
        case .booking(let id, let token): BookingScreen(bookingId: id, token: token)
        case .messages: MessagesScreen()
        case .conversation(let id): ConversationScreen(threadId: id)
        case .notifications: NotificationsScreen()
        case .settings: SettingsScreen(account: account)
        case .account: AccountScreen(account: account)
        case .family(let welcome): FamilyScreen(welcome: welcome)
        case .business(let welcome): BusinessScreen(account: account, welcome: welcome)
        case .payments: PaymentsScreen()
        case .payouts(let returned): PayoutsScreen(returned: returned)
        case .schedule: ScheduleScreen()
        case .manageSession(let id): ManageSessionScreen(sessionId: id)
        case .newOffering: NewOfferingScreen()
        case .offering(let id): OfferingScreen(offeringId: id)
        case .crew: CrewScreen()
        case .money: MoneyScreen()
        case .onboarding, .web: WebOnlyScreen(path: link.path)
        }
    }
}

/// A web page with no native screen yet: say so and offer the web version.
struct WebOnlyScreen: View {
    let path: String
    @Environment(SessionStore.self) private var session
    @Environment(\.openURL) private var openURL

    var body: some View {
        ContentUnavailableView {
            Label("Coming soon to the app", systemImage: "safari")
        } description: {
            Text("This screen is still on the web for now.")
        } actions: {
            Button("Open on the web") { openURL(session.api.baseURL.appending(path: path)) }.buttonStyle(.borderedProminent)
        }
    }
}
