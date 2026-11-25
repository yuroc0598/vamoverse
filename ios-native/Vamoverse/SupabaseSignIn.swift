import Auth
import AuthenticationServices
import CryptoKit
import Foundation

/// Production sign-in through Supabase Auth, the same accounts as the web: an email link, a
/// text-message code, Sign in with Apple, or Google. Links and OAuth come back to the app at
/// vamoverse://login-callback (PKCE: the code is exchanged by the app that started sign-in).
/// The session (access + refresh token) lives in the Keychain; the API client asks for the
/// access token before every request and refreshes once on a 401.
///
/// Needs the Supabase project URL and anon key in Config/Release.xcconfig, the callback URL in
/// Supabase's redirect allow-list, and the Apple and Google providers set up there ([USER]).
final class SupabaseSignIn: Sendable {
    static let callback = URL(string: "vamoverse://login-callback")!

    private let client: AuthClient

    /// nil when the build has no Supabase project configured.
    init?(bundle: Bundle = .main) {
        guard let urlText = bundle.object(forInfoDictionaryKey: "VamoSupabaseURL") as? String, !urlText.isEmpty,
              let url = URL(string: urlText)?.appending(path: "auth/v1"),
              let key = bundle.object(forInfoDictionaryKey: "VamoSupabaseAnonKey") as? String, !key.isEmpty else { return nil }
        client = AuthClient(
            url: url,
            headers: ["apikey": key, "Authorization": "Bearer \(key)"],
            flowType: .pkce,
            redirectToURL: Self.callback,
            localStorage: KeychainLocalStorage(service: "com.vamoverse.supabase"))
    }

    /// The current access token, refreshed first if it's about to expire; nil when signed out.
    func accessToken() async -> String? {
        try? await client.session.accessToken
    }

    /// A new access token after the server said the old one is no longer valid.
    func refreshedToken() async -> String? {
        try? await client.refreshSession().accessToken
    }

    var hasSession: Bool { client.currentSession != nil }

    func sendEmailLink(to email: String) async throws {
        try await client.signInWithOTP(email: email, redirectTo: Self.callback)
    }

    func sendTextCode(to phone: String) async throws {
        try await client.signInWithOTP(phone: phone)
    }

    func verifyTextCode(phone: String, code: String) async throws {
        try await client.verifyOTP(phone: phone, token: code, type: .sms)
    }

    func signInWithGoogle() async throws {
        try await client.signInWithOAuth(provider: .google, redirectTo: Self.callback)
    }

    /// Sign in with Apple: the app gets an identity token from Apple (with our hashed nonce) and
    /// Supabase verifies it.
    func signInWithApple(idToken: String, nonce: String) async throws {
        try await client.signInWithIdToken(credentials: OpenIDConnectCredentials(provider: .apple, idToken: idToken, nonce: nonce))
    }

    /// The email link opened the app at vamoverse://login-callback?code=…
    func handleCallback(_ url: URL) async throws {
        _ = try await client.session(from: url)
    }

    func signOut() async {
        try? await client.signOut(scope: .local)
    }

    /// A random nonce for Sign in with Apple: Apple gets its SHA-256, Supabase the original.
    static func makeNonce() -> (raw: String, hashed: String) {
        let raw = (0..<32).map { _ in String(format: "%02x", UInt8.random(in: 0...255)) }.joined()
        let hashed = SHA256.hash(data: Data(raw.utf8)).map { String(format: "%02x", $0) }.joined()
        return (raw, hashed)
    }

    /// Supabase errors carry a readable message; show it as is (like the web's toast).
    static func message(_ error: Error) -> String {
        if let auth = error as? AuthError { return auth.message }
        return error.localizedDescription
    }
}
