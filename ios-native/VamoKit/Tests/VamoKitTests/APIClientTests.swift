import Foundation
import Testing
@testable import VamoKit

/// Answers requests from a handler and records them, so the client can be tested without a server.
final class StubProtocol: URLProtocol, @unchecked Sendable {
    nonisolated(unsafe) static var handler: (@Sendable (URLRequest) throws -> (Int, Data))?
    nonisolated(unsafe) static var requests: [URLRequest] = []
    private static let lock = NSLock()

    static func reset(_ handler: @escaping @Sendable (URLRequest) throws -> (Int, Data)) {
        lock.withLock { self.handler = handler; requests = [] }
    }

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func stopLoading() {}

    override func startLoading() {
        var request = request
        // URLSession moves the body to a stream; read it back for assertions.
        if request.httpBody == nil, let stream = request.httpBodyStream {
            stream.open()
            var data = Data()
            var buffer = [UInt8](repeating: 0, count: 4096)
            while stream.hasBytesAvailable {
                let count = stream.read(&buffer, maxLength: buffer.count)
                if count <= 0 { break }
                data.append(buffer, count: count)
            }
            stream.close()
            request.httpBody = data
        }
        let handler = Self.lock.withLock { Self.requests.append(request); return Self.handler }
        do {
            let (status, body) = try handler!(request)
            client?.urlProtocol(self, didReceive: HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: body)
            client?.urlProtocolDidFinishLoading(self)
        } catch {
            client?.urlProtocol(self, didFailWithError: error)
        }
    }
}

@Suite(.serialized)
struct APIClientTests {
    func client(token: String? = "tok_123") -> APIClient {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [StubProtocol.self]
        return APIClient(baseURL: URL(string: "http://localhost:3100")!, session: APIClient.makeSession(configuration: configuration), token: { token })
    }

    @Test func postsTheCommandWithTheBearerToken() async throws {
        StubProtocol.reset { _ in (200, Data(#"{"data":{"items":[],"unread":3}}"#.utf8)) }
        let page = try await client().run(.notificationsList, NotificationsInput(limit: 1))
        #expect(page.unread == 3)
        let request = try #require(StubProtocol.requests.first)
        #expect(request.url?.absoluteString == "http://localhost:3100/api/commands/notifications.list")
        #expect(request.httpMethod == "POST")
        #expect(request.value(forHTTPHeaderField: "Authorization") == "Bearer tok_123")
        #expect(request.value(forHTTPHeaderField: "Content-Type") == "application/json")
        #expect(request.value(forHTTPHeaderField: "Cookie") == nil)
        #expect(request.httpBody.map { String(decoding: $0, as: UTF8.self) } == #"{"limit":1}"#)
    }

    @Test func sendsNoAuthorizationWhenSignedOutAndDecodesNullData() async throws {
        StubProtocol.reset { _ in (200, Data(#"{"data":null}"#.utf8)) }
        let account = try await client(token: nil).run(.accountMe)
        #expect(account == nil)
        #expect(StubProtocol.requests.first?.value(forHTTPHeaderField: "Authorization") == nil)
        #expect(StubProtocol.requests.first?.httpBody.map { String(decoding: $0, as: UTF8.self) } == "{}")
    }

    @Test func surfacesTheServersErrorVerbatim() async {
        StubProtocol.reset { _ in (409, Data(#"{"error":{"code":"conflict","message":"Cancel or finish your booked sessions first.","details":{"n":2}}}"#.utf8)) }
        await #expect(throws: APIError(code: "conflict", message: "Cancel or finish your booked sessions first.", status: 409, details: .object(["n": .number(2)]))) {
            _ = try await client().run(.accountMe)
        }
    }

    @Test func fallsBackToTheWebsWordingWhenTheBodyIsNotJSON() async {
        StubProtocol.reset { _ in (502, Data("<html>Bad gateway</html>".utf8)) }
        await #expect(throws: APIError(code: "internal", message: "Something went wrong.", status: 502)) { _ = try await client().run(.accountMe) }
    }

    @Test func reportsNetworkFailuresAndUndecodableData() async throws {
        StubProtocol.reset { _ in throw URLError(.notConnectedToInternet) }
        do { _ = try await client().run(.accountMe); Issue.record("expected an error") } catch {
            #expect(error.code == "network" && error.status == 0 && !error.message.isEmpty)
        }
        StubProtocol.reset { _ in (200, Data(#"{"data":{"unexpected":true}}"#.utf8)) }
        do { _ = try await client().run(.notificationsList, NotificationsInput()); Issue.record("expected an error") } catch {
            #expect(error.code == "decoding" && error.message == "Something went wrong.")
        }
    }

    @Test func devSignInReturnsTheToken() async throws {
        StubProtocol.reset { _ in (200, Data(#"{"data":{"ok":true,"token":"usr_1.123.sig"}}"#.utf8)) }
        let token = try await client(token: "ignored").devSignIn(email: "maya@demo.vamoverse.app")
        #expect(token == "usr_1.123.sig")
        let request = try #require(StubProtocol.requests.first)
        #expect(request.url?.path() == "/api/auth/dev")
        #expect(request.value(forHTTPHeaderField: "Authorization") == nil)
        #expect(request.httpBody.map { String(decoding: $0, as: UTF8.self) } == #"{"email":"maya@demo.vamoverse.app"}"#)
    }
}

/// Production sign-in (Supabase): an expired access token is refreshed once and the request retried.
/// Nested in APIClientTests so it shares that suite's serialization (StubProtocol is global).
extension APIClientTests {
@Suite
struct TokenRefreshTests {
    actor Tokens {
        var current: String?
        var refreshes = 0
        let next: String?
        init(current: String?, next: String?) { self.current = current; self.next = next }
        func get() -> String? { current }
        func refresh() -> String? { refreshes += 1; current = next; return next }
    }

    func client(_ tokens: Tokens, refreshing: Bool = true) -> APIClient {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [StubProtocol.self]
        var refresh: (@Sendable () async -> String?)?
        if refreshing { refresh = { await tokens.refresh() } }
        return APIClient(baseURL: URL(string: "http://localhost:3100")!, session: APIClient.makeSession(configuration: configuration),
                         token: { await tokens.get() }, refresh: refresh)
    }

    static let unauthorized = Data(#"{"error":{"code":"unauthorized","message":"Please sign in."}}"#.utf8)

    /// 401 for anything but "Bearer fresh".
    static func onlyFresh(_ request: URLRequest) -> (Int, Data) {
        request.value(forHTTPHeaderField: "Authorization") == "Bearer fresh" ? (200, Data(#"{"data":{"items":[],"unread":4}}"#.utf8)) : (401, unauthorized)
    }

    @Test func refreshesOnceAndRetriesWithTheNewToken() async throws {
        StubProtocol.reset(Self.onlyFresh)
        let tokens = Tokens(current: "expired", next: "fresh")
        let page = try await client(tokens).run(.notificationsList, NotificationsInput())
        #expect(page.unread == 4)
        #expect(await tokens.refreshes == 1)
        #expect(StubProtocol.requests.map { $0.value(forHTTPHeaderField: "Authorization") } == ["Bearer expired", "Bearer fresh"])
    }

    @Test func givesUpWhenRefreshFailsOrTheRetryIsAlsoRejected() async {
        StubProtocol.reset { _ in (401, Self.unauthorized) }
        let failed = Tokens(current: "expired", next: nil)
        await #expect(throws: APIError(code: "unauthorized", message: "Please sign in.", status: 401)) { _ = try await client(failed).run(.accountMe) }
        #expect(await failed.refreshes == 1)
        #expect(StubProtocol.requests.count == 1)

        StubProtocol.reset { _ in (401, Self.unauthorized) }
        let revoked = Tokens(current: "expired", next: "also-rejected")
        await #expect(throws: APIError.self) { _ = try await client(revoked).run(.accountMe) }
        #expect(await revoked.refreshes == 1)
        #expect(StubProtocol.requests.count == 2) // one retry, no loop
    }

    @Test func doesNotRefreshWhenSignedOutOrInDevMode() async {
        StubProtocol.reset { _ in (401, Self.unauthorized) }
        let signedOut = Tokens(current: nil, next: "fresh")
        await #expect(throws: APIError.self) { _ = try await client(signedOut).run(.notificationsList, NotificationsInput()) }
        #expect(await signedOut.refreshes == 0)

        let dev = Tokens(current: "dev-token", next: "fresh")
        await #expect(throws: APIError.self) { _ = try await client(dev, refreshing: false).run(.notificationsList, NotificationsInput()) }
        #expect(await dev.refreshes == 0)
        #expect(StubProtocol.requests.count == 2)
    }
}
}
