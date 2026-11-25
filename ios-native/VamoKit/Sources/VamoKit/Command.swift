// A server command: POST /api/commands/<name> with `Input` as JSON, answered with `{ data: Output }`.
// Commands are declared once as typed constants (Commands+Catalog.swift), so call sites never use
// free-text names: `try await api.run(.accountMe)`.

public struct Command<Input: Encodable & Sendable, Output: Decodable & Sendable>: Sendable {
    public let name: String

    public init(_ name: String) {
        self.name = name
    }
}

/// The input of commands that take none (encodes as `{}`).
public struct NoInput: Encodable, Sendable, Equatable {
    public init() {}
}
