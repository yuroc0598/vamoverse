import Foundation

// Codable models for command outputs. Unknown fields are ignored; fields the app can live
// without are optional so a server addition never breaks decoding. Money is integer cents.

/// `account.me`: the signed-in account (src/server/modules/users/accounts.ts `Actor`).
public struct Account: Codable, Sendable, Equatable {
    public let userId: String
    public let email: String?
    public let phone: String?
    public let displayName: String
    public let isAdmin: Bool
    public let adultConfirmed: Bool
    public let onboarded: Bool
    public let playerId: String
    public let providerId: String?

    public var isProvider: Bool { providerId != nil }
    /// "Maya" from "Maya Chen", as the web greets ("Hi, Maya").
    public var firstName: String { String(displayName.split(separator: " ").first ?? Substring(displayName)) }
}

/// `notifications.list`
public struct NotificationsPage: Codable, Sendable, Equatable {
    public let items: [NotificationItem]
    public let unread: Int
}

public struct NotificationItem: Codable, Sendable, Equatable, Identifiable {
    public let id: String
    public let kind: String
    public let title: String
    public let body: String
    /// A web path (`/b/<id>?t=…`, `/sessions/<id>`, …) for the router.
    public let link: String?
    public let readAt: Date?
    public let createdAt: Date
}

public struct NotificationsInput: Encodable, Sendable {
    public let limit: Int?
    public init(limit: Int? = nil) { self.limit = limit }
}
