import SwiftUI
import VamoKit

@main
struct VamoverseApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @State private var session = SessionStore()
    @State private var toasts = Toasts()
    @State private var navigator = Navigator()
    @State private var push = PushCenter()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(session)
                .environment(toasts)
                .environment(navigator)
                .environment(push)
                .toastOverlay(toasts)
                .onAppear {
                    appDelegate.session = session
                    appDelegate.navigator = navigator
                    if let link = AppConfig.openLinkOnLaunch { navigator.pending = AppLink.parse(link) }
                }
                .tint(.accentColor)
        }
    }
}

/// Signed out → sign in; not onboarded → onboarding; otherwise the tabs for the account's role.
/// Links (vamoverse://, universal links, notification taps) go through the navigator; a guest
/// booking link (/b/<id>?t=…) opens even when signed out, as on the web.
struct RootView: View {
    @Environment(SessionStore.self) private var session
    @Environment(Navigator.self) private var navigator
    @Environment(PushCenter.self) private var push
    @Environment(Toasts.self) private var toasts
    @Environment(\.scenePhase) private var scenePhase
    @State private var guestBooking: GuestBooking?

    struct GuestBooking: Identifiable {
        let id: String
        let token: String
    }

    var body: some View {
        Group {
            switch session.phase {
            case .loading:
                ProgressView().controlSize(.large)
            case .signedOut:
                SignInView()
            case .unavailable(let error):
                ContentUnavailableView {
                    if error.code == "network" {
                        Label("Can’t reach Vamoverse", systemImage: "wifi.exclamationmark")
                    } else {
                        Label("Something went wrong", systemImage: "exclamationmark.triangle")
                    }
                } description: {
                    Text(error.message)
                } actions: {
                    Button("Try again") { Task { await session.start() } }.buttonStyle(.borderedProminent)
                }
            case .signedIn(let account) where !account.onboarded:
                OnboardingScreen(account: account)
            case .signedIn(let account):
                MainTabs(account: account)
            }
        }
        .task {
            await session.start()
            await push.refresh()
            if let url = AppConfig.openURLOnLaunch { open(url) }
        }
        .onChange(of: scenePhase) { _, phase in
            // Refetch on return to the app (another device, the web, or a hosted page may have changed things).
            if phase == .active, session.account != nil { Task { await session.reload() } }
        }
        .onChange(of: session.account?.userId) { _, userId in
            if userId != nil { guestBooking = nil }
        }
        .onOpenURL(perform: open)
        .fullScreenCover(item: $guestBooking) { guest in
            GuestBookingView(bookingId: guest.id, token: guest.token)
        }
    }

    private func open(_ url: URL) {
        // The Supabase email link / OAuth callback.
        if url.scheme == "vamoverse", url.host == "login-callback" {
            guard case .supabase(let supabase) = session.mode else { return }
            Task {
                do { try await supabase.handleCallback(url); await session.reload() }
                catch { toasts.error(APIError(code: "unauthorized", message: SupabaseSignIn.message(error), status: 401)) }
            }
            return
        }
        let link = AppLink.parse(url.absoluteString)
        if session.account == nil, case .booking(let id, let token?) = link {
            guestBooking = GuestBooking(id: id, token: token)
            return
        }
        // Opens now if the tabs are showing, otherwise right after sign-in.
        navigator.pending = link
    }
}

/// A booking opened from its signed link without signing in (the web's /b/<id>?t=…).
private struct GuestBookingView: View {
    let bookingId: String
    let token: String
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            BookingScreen(bookingId: bookingId, token: token)
                .safeAreaInset(edge: .bottom) {
                    Text("Keep this link to manage your booking, or sign in to see all your bookings.")
                        .font(.footnote).foregroundStyle(.secondary).multilineTextAlignment(.center)
                        .padding().frame(maxWidth: .infinity).background(.bar)
                }
                .toolbar {
                    ToolbarItem(placement: .topBarLeading) { Button("Sign in") { dismiss() } }
                }
                .navigationDestination(for: AppLink.self) { link in WebOnlyScreen(path: link.path) }
        }
    }
}
