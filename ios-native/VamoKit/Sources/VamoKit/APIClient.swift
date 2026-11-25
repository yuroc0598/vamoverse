import Foundation

/// The one way the app talks to the server: `POST /api/commands/<name>`, the same endpoint and
/// rules as the web. The bearer token is the only credential: the URLSession is ephemeral with
/// no cookie storage, so nothing from a sign-in response can compete with it.
public final class APIClient: Sendable {
    public let baseURL: URL
    private let session: URLSession
    private let token: @Sendable () async -> String?
    private let refresh: (@Sendable () async -> String?)?

    /// - Parameters:
    ///   - token: the current bearer token, read before every request (nil when signed out).
    ///   - refresh: gets a new token after a 401 (Supabase refresh); the request is retried once
    ///     with it. nil (dev sign-in) means a 401 is final.
    public init(baseURL: URL, session: URLSession = APIClient.makeSession(), token: @escaping @Sendable () async -> String?,
                refresh: (@Sendable () async -> String?)? = nil) {
        self.baseURL = baseURL
        self.session = session
        self.token = token
        self.refresh = refresh
    }

    public static func makeSession(configuration: URLSessionConfiguration = .ephemeral) -> URLSession {
        configuration.httpCookieStorage = nil
        configuration.httpShouldSetCookies = false
        configuration.httpCookieAcceptPolicy = .never
        configuration.urlCache = nil
        configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
        configuration.timeoutIntervalForRequest = 30
        return URLSession(configuration: configuration)
    }

    public func run<Input, Output>(_ command: Command<Input, Output>, _ input: Input) async throws(APIError) -> Output {
        let body: Data
        do { body = try VamoJSON.encoder().encode(input) } catch { throw .decoding(command.name, error, status: 0) }
        let bearer = await token()
        do {
            return try await post(path: "api/commands/\(command.name)", body: body, label: command.name, bearer: bearer)
        } catch where error.isUnauthorized && bearer != nil {
            // The access token expired (or was revoked): refresh once and retry with the new one.
            guard let refresh, let fresh = await refresh(), fresh != bearer else { throw error }
            return try await post(path: "api/commands/\(command.name)", body: body, label: command.name, bearer: fresh)
        }
    }

    public func run<Output>(_ command: Command<NoInput, Output>) async throws(APIError) -> Output {
        try await run(command, NoInput())
    }

    /// Development sign-in (`/api/auth/dev`, dev servers only): returns the bearer token for `email`.
    public func devSignIn(email: String) async throws(APIError) -> String {
        struct Body: Encodable { let email: String }
        struct Result: Decodable { let token: String }
        let body: Data
        do { body = try VamoJSON.encoder().encode(Body(email: email)) } catch { throw .decoding("auth.dev", error, status: 0) }
        let result: Result = try await post(path: "api/auth/dev", body: body, label: "auth.dev", bearer: nil)
        return result.token
    }

    private struct Envelope<T: Decodable>: Decodable {
        let data: T
    }

    private struct ErrorEnvelope: Decodable {
        struct Body: Decodable {
            let code: String
            let message: String
            let details: JSONValue?
        }
        let error: Body
    }

    private func post<T: Decodable>(path: String, body: Data, label: String, bearer: String?) async throws(APIError) -> T {
        var request = URLRequest(url: baseURL.appending(path: path))
        request.httpMethod = "POST"
        request.httpBody = body
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let bearer { request.setValue("Bearer \(bearer)", forHTTPHeaderField: "Authorization") }

        let data: Data
        let response: URLResponse
        do { (data, response) = try await session.data(for: request) } catch { throw .network(error) }
        return try Self.decode(data, status: (response as? HTTPURLResponse)?.statusCode ?? 0, label: label)
    }

    /// A response body → the command's output, or the server's error (`{ error: { code, message } }`).
    static func decode<T: Decodable>(_ data: Data, status: Int, label: String) throws(APIError) -> T {
        let decoder = VamoJSON.decoder()
        guard (200..<300).contains(status) else {
            if let failure = try? decoder.decode(ErrorEnvelope.self, from: data) {
                throw APIError(code: failure.error.code, message: failure.error.message, status: status, details: failure.error.details)
            }
            throw APIError(code: "internal", message: APIError.fallbackMessage, status: status)
        }
        do { return try decoder.decode(Envelope<T>.self, from: data).data } catch { throw .decoding(label, error, status: status) }
    }
}
