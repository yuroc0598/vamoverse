import Foundation

/// A failed request. For server errors, `message` is the server's text and is shown to the user
/// verbatim; the server decides fees, permissions, and rules, so the app never rewords them.
public struct APIError: Error, Sendable, Equatable, LocalizedError {
    /// The server's code (`bad_request`, `unauthorized`, `forbidden`, `not_found`, `conflict`,
    /// `rate_limited`, `internal`), or `network` / `decoding` for failures on this side.
    public let code: String
    public let message: String
    /// HTTP status; 0 when the server was never reached.
    public let status: Int
    public let details: JSONValue?

    public init(code: String, message: String, status: Int, details: JSONValue? = nil) {
        self.code = code
        self.message = message
        self.status = status
        self.details = details
    }

    public var errorDescription: String? { message }

    /// The signed-in session is missing or expired.
    public var isUnauthorized: Bool { status == 401 }

    /// The web's fallback wording when the server sent no usable error (src/lib/client/api.ts).
    static let fallbackMessage = "Something went wrong."

    static func network(_ error: Error) -> APIError {
        let message = (error as? URLError)?.localizedDescription ?? error.localizedDescription
        return APIError(code: "network", message: message, status: 0)
    }

    static func decoding(_ command: String, _ error: Error, status: Int) -> APIError {
        APIError(code: "decoding", message: fallbackMessage, status: status, details: .string("\(command): \(error)"))
    }
}
