import Foundation
import Observation
import UserNotifications
import VamoKit

/// Who is signed in, from `account.me`, plus the unread notification count for the bell.
/// Debug builds sign in with the dev route (token in the Keychain); Release builds use Supabase
/// Auth. Either way the API client reads the token before every request.
@MainActor @Observable
final class SessionStore {
    enum Phase: Equatable {
        case loading
        case signedOut
        case signedIn(Account)
        /// Launch failed (no network, or a server error); the screen offers "Try again".
        case unavailable(APIError)
    }

    enum Mode {
        case dev(TokenStore)
        case supabase(SupabaseSignIn)
        /// A Release build without a Supabase project configured.
        case unconfigured
    }

    private(set) var phase: Phase = .loading
    private(set) var unread = 0
    /// The server has a model key (the assistant button shows, as on the web).
    private(set) var assistantEnabled = false
    let api: APIClient
    let mode: Mode

    init(baseURL: URL = AppConfig.baseURL) {
        if AppConfig.usesDevSignIn {
            let tokens = TokenStore(server: baseURL)
            if AppConfig.resetSessionOnLaunch { tokens.clear() }
            mode = .dev(tokens)
            api = APIClient(baseURL: baseURL) { tokens.read() }
        } else if let supabase = SupabaseSignIn() {
            mode = .supabase(supabase)
            api = APIClient(baseURL: baseURL, token: { await supabase.accessToken() }, refresh: { await supabase.refreshedToken() })
        } else {
            mode = .unconfigured
            api = APIClient(baseURL: baseURL) { nil }
        }
    }

    var account: Account? {
        if case .signedIn(let account) = phase { return account }
        return nil
    }

    private var hasCredentials: Bool {
        switch mode {
        case .dev(let tokens): tokens.read() != nil
        case .supabase(let supabase): supabase.hasSession
        case .unconfigured: false
        }
    }

    /// On launch: signed out without credentials; otherwise ask the server who we are.
    func start() async {
        if let email = AppConfig.signInAsOnLaunch, account?.email != email {
            do { try await devSignIn(email: email); return } catch { phase = .unavailable(error); return }
        }
        guard hasCredentials else { phase = .signedOut; return }
        phase = .loading
        await reload()
    }

    /// Refetches the account (after onboarding, profile edits, sign-in, or returning to the app).
    func reload() async {
        do {
            if let account = try await api.run(.accountMe) {
                phase = .signedIn(account)
                await afterSignIn()
            } else {
                signOut() // expired or revoked
            }
        } catch {
            if case .signedIn = phase { return } // keep showing the app; the next refresh retries
            phase = .unavailable(error)
        }
    }

    /// Development sign-in (Debug builds against a dev server).
    func devSignIn(email: String) async throws(APIError) {
        guard case .dev(let tokens) = mode else { throw APIError(code: "forbidden", message: "Development sign-in is off in this build.", status: 403) }
        let token = try await api.devSignIn(email: email.trimmingCharacters(in: .whitespaces))
        tokens.save(token)
        guard let account = try await api.run(.accountMe) else {
            tokens.clear()
            throw APIError(code: "unauthorized", message: "Please sign in.", status: 401)
        }
        phase = .signedIn(account)
        await afterSignIn()
    }

    private func afterSignIn() async {
        await refreshUnread()
        assistantEnabled = (try? await api.run(.assistantHistory))?.enabled ?? false
        await registerPendingDevice()
    }

    func refreshUnread() async {
        guard account != nil, let page = try? await api.run(.notificationsList, NotificationsInput(limit: 1)) else { return }
        unread = page.unread
        try? await UNUserNotificationCenter.current().setBadgeCount(page.unread)
    }

    // MARK: Push devices

    private static let deviceTokenKey = "VamoDeviceToken"

    /// APNs gave us a token (after the user allowed notifications): save it for this account.
    func registerDevice(token: String) async {
        UserDefaults.standard.set(token, forKey: Self.deviceTokenKey)
        await registerPendingDevice()
    }

    private func registerPendingDevice() async {
        guard account != nil, let token = UserDefaults.standard.string(forKey: Self.deviceTokenKey) else { return }
        _ = try? await api.run(.devicesRegister, RegisterDeviceInput(token: token, environment: AppConfig.apnsEnvironment))
    }

    // MARK: Sign out

    /// Stops pushes to this device for this account, then forgets the credentials.
    func signOut() {
        if let device = UserDefaults.standard.string(forKey: Self.deviceTokenKey), account != nil {
            // Unregister with the credentials we still have, before they're cleared.
            let bearer: @Sendable () async -> String?
            switch mode {
            case .dev(let tokens): let token = tokens.read(); bearer = { token }
            case .supabase(let supabase): bearer = { await supabase.accessToken() }
            case .unconfigured: bearer = { nil }
            }
            let unregister = APIClient(baseURL: api.baseURL, token: bearer)
            let done: Task<Void, Never> = Task { _ = try? await unregister.run(.devicesUnregister, DeviceTokenInput(token: device)) }
            if case .supabase(let supabase) = mode { Task { await done.value; await supabase.signOut() } }
        } else if case .supabase(let supabase) = mode {
            Task { await supabase.signOut() }
        }
        if case .dev(let tokens) = mode { tokens.clear() }
        unread = 0
        assistantEnabled = false
        phase = .signedOut
        Task { try? await UNUserNotificationCenter.current().setBadgeCount(0) }
    }

    /// A signed-in call failed with 401 (after a refresh, in production): the session ended.
    func handle(_ error: APIError) {
        if error.isUnauthorized, account != nil { signOut() }
    }
}
