import Foundation

// Models for the player and parent screens (phase 3). Field names follow the server's JSON;
// see the matching fixtures in Tests/VamoKitTests/Fixtures. Money is integer cents; dates are
// decoded by VamoJSON; calendar dates (birthDate) stay "YYYY-MM-DD" strings.

/// A session as every session-facing page shows it (schedule/sessions.ts `SessionView`).
public struct SessionView: Codable, Sendable, Equatable, Identifiable, Hashable {
    public let id: String
    public let offeringId: String
    public let providerId: String
    public let providerSlug: String
    public let providerName: String
    /// private, semi_private, group, hitting
    public let kind: String
    public let title: String
    public let description: String?
    public let audience: String
    public let startsAt: Date
    public let endsAt: Date
    public let timezone: String
    public let capacity: Int
    public let priceCents: Int
    /// free, pay_now, pay_after, external
    public let paymentRule: String
    public let acceptsCredits: Bool
    public let levelSystem: String?
    public let levelMin: Double?
    public let levelMax: Double?
    /// scheduled, cancelled, completed
    public let status: String
    public let cancelReason: String?
    public let courtStatus: String?
    public let courtConfirmation: String?
    public let locationName: String?
    public let locationAddress: String?
    public let locationNote: String?
    public let note: String?
    public let seatsTaken: Int
    public let waitlistCount: Int
    public let requestedCount: Int?
    /// The session has begun (attendance can be taken).
    public let started: Bool?
    public let courtBookingUrl: String?
    public let courtBookingNote: String?
    public let cancelWindowHours: Int
    public let lateCancelFeePct: Int
    public let noShowFeePct: Int

    public var isFull: Bool { seatsTaken >= capacity }
    public var isCancelled: Bool { status == "cancelled" }
}

/// A player profile you manage: your own or a junior's (users/players.ts `Player`).
public struct Player: Codable, Sendable, Equatable, Identifiable, Hashable {
    public let id: String
    public let userId: String?
    public let guardianUserId: String?
    public let displayName: String
    public let birthDate: String?
    public let gender: String?
    public let utrSingles: Double?
    public let utrDoubles: Double?
    public let ntrp: Double?
    public let wtn: Double?
    public let utrProfileId: String?

    public var isJunior: Bool { guardianUserId != nil }
}

public struct Booking: Codable, Sendable, Equatable, Identifiable, Hashable {
    public let id: String
    public let sessionId: String
    public let offeringId: String
    public let providerId: String
    public let playerId: String?
    public let playerName: String
    /// held, invited, requested, confirmed, waitlisted, offered, cancelled, late_cancelled, no_show, attended, expired, declined
    public let status: String
    public let paymentRule: String
    public let priceCents: Int
    /// none, due, paid, paid_external, credit, refunded, waived, failed, disputed
    public let paymentStatus: String
    public let holdExpiresAt: Date?
    public let offerExpiresAt: Date?
    public let createdAt: Date

    /// Still in play (bookings/status.ts OPEN_STATUSES).
    public static let openStatuses: Set<String> = ["held", "invited", "requested", "confirmed", "waitlisted", "offered"]
    public var isOpen: Bool { Self.openStatuses.contains(status) }
}

/// `bookings.mine`: a booking with its session (the JSON is the booking's fields plus `session`).
public struct MyBooking: Decodable, Sendable, Equatable, Identifiable {
    public let booking: Booking
    public let session: SessionView
    public var id: String { booking.id }

    private enum Keys: String, CodingKey { case session }

    public init(from decoder: Decoder) throws {
        booking = try Booking(from: decoder)
        session = try decoder.container(keyedBy: Keys.self).decode(SessionView.self, forKey: .session)
    }
}

/// `bookings.get`
public struct BookingDetail: Decodable, Sendable, Equatable {
    public struct CancelTerms: Decodable, Sendable, Equatable {
        public let late: Bool
        public let refundCents: Int
        public let feeCents: Int
        /// "Full refund of $40." — the server's words, shown as is.
        public let summary: String
    }

    public struct Headline: Decodable, Sendable, Equatable {
        /// good, wait, bad
        public let tone: String
        public let title: String
        public let body: String?
    }

    public let booking: Booking
    public let session: SessionView
    public let playerName: String
    public let pendingPayment: Bool
    public let refundedCents: Int
    /// owner, provider, token
    public let access: String
    public let cancelTerms: CancelTerms?
    public let headline: Headline
}

/// `sessions.view`
public struct SessionPage: Decodable, Sendable, Equatable {
    public struct ExistingBooking: Decodable, Sendable, Equatable {
        public let id: String
        public let playerId: String?
        public let status: String
    }

    public let session: SessionView
    /// You and your juniors (empty when signed out).
    public let family: [Player]
    public let bookings: [ExistingBooking]
    public let credits: Int
    public let isOwner: Bool
    public let bookable: Bool

    /// The booking this page links to instead of the book panel (an open one).
    public var activeBooking: ExistingBooking? { bookings.first { Booking.openStatuses.contains($0.status) } }
}

/// `find.providers`
public struct ProviderCard: Decodable, Sendable, Equatable, Identifiable {
    public let id: String
    public let slug: String
    public let name: String
    public let headline: String?
    public let homeArea: String?
    public let offersCoaching: Bool
    public let offersHitting: Bool
    public let ratePrivateCents: Int?
    public let rateHittingCents: Int?
    public let safetyVerified: Bool
    public let ownNtrp: Double?
    public let ownUtr: Double?
    public let nextOpening: Date?
}

/// `schedule.public`
public struct PublicSchedule: Decodable, Sendable, Equatable {
    public struct Provider: Decodable, Sendable, Equatable {
        public let id: String
        public let slug: String
        public let displayName: String
        public let offersCoaching: Bool
        public let offersHitting: Bool
        public let headline: String?
        public let bio: String?
        public let homeArea: String?
        public let timezone: String
        public let ratePrivateCents: Int?
        public let rateHittingCents: Int?
        public let cancelWindowHours: Int
        public let lateCancelFeePct: Int
        public let noShowFeePct: Int
        public let safetyVerified: Bool
        public let acceptsPayments: Bool
    }

    public let provider: Provider
    public let sessions: [SessionView]
}

/// `packages.public`
public struct CreditPackage: Decodable, Sendable, Equatable, Identifiable {
    public let id: String
    public let name: String
    public let credits: Int
    public let priceCents: Int
    public let validDays: Int?
    public let kinds: [String]
}

/// `credits.mine`
public struct PackagePurchase: Decodable, Sendable, Equatable, Identifiable {
    public let id: String
    public let providerName: String
    public let name: String
    public let creditsTotal: Int
    public let creditsUsed: Int
    /// pending, active, refunded, canceled
    public let status: String
    public let expiresAt: Date?

    public var creditsLeft: Int { creditsTotal - creditsUsed }
    /// Shown on Home: active with credits left.
    public var isUsable: Bool { status == "active" && creditsUsed < creditsTotal }
}

/// `coaches.mine`
public struct MyCoach: Decodable, Sendable, Equatable, Identifiable {
    public let providerId: String
    public let slug: String
    public let name: String
    public let headline: String?
    public var id: String { providerId }
}

/// `messages.threads`
public struct MessageThread: Decodable, Sendable, Equatable, Identifiable {
    public let id: String
    /// direct, offering
    public let kind: String
    public let title: String
    public let lastMessageAt: Date?
    public let lastMessage: String?
    public let unread: Int

    /// "👥 Clinic" for series threads, as on the web.
    public var displayTitle: String { kind == "offering" ? "👥 \(title)" : title }
}

/// `messages.read`
public struct Conversation: Decodable, Sendable, Equatable {
    public struct Thread: Decodable, Sendable, Equatable {
        public let id: String
        public let title: String
        public let kind: String
        public var displayTitle: String { kind == "offering" ? "👥 \(title)" : title }
    }

    public let thread: Thread
    public let messages: [ChatMessage]
}

public struct ChatMessage: Decodable, Sendable, Equatable, Identifiable {
    public let id: String
    public let senderName: String
    public let body: String
    public let createdAt: Date
    public let mine: Bool
}

// MARK: Command results

/// Any result the app doesn't read (e.g. `{ removed: true }`).
public struct Ignored: Decodable, Sendable, Equatable {
    public init(from decoder: Decoder) throws {}
}

public struct CheckoutLink: Decodable, Sendable, Equatable {
    public let checkoutUrl: URL
}

public struct BookingCreated: Decodable, Sendable, Equatable {
    public let booking: Booking
    public let message: String?
    public let checkoutUrl: URL?
    /// `/b/<id>?t=<token>`
    public let manageUrl: String
}

public struct InviteAccepted: Decodable, Sendable, Equatable {
    public let confirmed: Int
    public let checkoutUrl: URL?
}

public struct BookingCancelled: Decodable, Sendable, Equatable {
    public let summary: String
}

public struct ThreadStarted: Decodable, Sendable, Equatable {
    public let threadId: String
}
