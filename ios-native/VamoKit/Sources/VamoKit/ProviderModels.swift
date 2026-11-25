import Foundation

// Models for the provider screens and settings (phase 4). Field names follow the server's JSON;
// see the matching fixtures. Money is integer cents.

/// `provider.settings`
public struct ProviderSettings: Decodable, Sendable, Equatable {
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
    public let rateSemiPrivateCents: Int?
    public let rateGroupCents: Int?
    public let rateHittingCents: Int?
    public let cancelWindowHours: Int
    public let lateCancelFeePct: Int
    public let noShowFeePct: Int
    public let listed: Bool
    public let chargesEnabled: Bool
    public let payoutsEnabled: Bool
    public let stripeAccountId: String?
    /// none, pending, verified, rejected
    public let safetyStatus: String

    /// The default price for a kind of session (offering-form.tsx defaultPrice).
    public func rate(for kind: String) -> Int? {
        switch kind {
        case "private": ratePrivateCents
        case "semi_private": rateSemiPrivateCents
        case "group": rateGroupCents
        case "hitting": rateHittingCents
        default: nil
        }
    }
}

/// `sessions.roster`
public struct RosterEntry: Decodable, Sendable, Equatable, Identifiable {
    public let bookingId: String
    public let playerId: String?
    public let playerName: String
    public let junior: Bool
    public let contactName: String?
    public let contactEmail: String?
    public let contactPhone: String?
    public let status: String
    public let paymentRule: String
    public let paymentStatus: String
    public let priceCents: Int
    public var id: String { bookingId }

    public var owes: Bool { paymentStatus == "due" || paymentStatus == "failed" }
}

/// `offerings.list` / `offerings.get`
public struct Offering: Decodable, Sendable, Equatable, Identifiable, Hashable {
    public let id: String
    public let kind: String
    public let title: String
    public let description: String?
    public let discipline: String?
    public let audience: String
    public let capacity: Int
    public let priceCents: Int
    public let paymentRule: String
    public let acceptsCredits: Bool
    public let levelSystem: String?
    public let levelMin: Double?
    public let levelMax: Double?
    public let visibility: String
    public let courtId: String?
    public let locationName: String?
    public let locationNote: String?
    public let timezone: String
    /// YYYY-MM-DD
    public let startDate: String
    /// HH:MM
    public let startTime: String
    public let durationMinutes: Int
    public let slotsPerDay: Int
    public let repeatWeekdays: [Int]?
    public let repeatEveryWeeks: Int
    public let endDate: String?
    /// active, archived
    public let status: String
}

/// `clients.list`
public struct Client: Decodable, Sendable, Equatable, Identifiable {
    public let playerId: String
    public let playerName: String
    public let junior: Bool
    public let contactName: String
    public let contactEmail: String?
    public let contactPhone: String?
    public let status: String
    public let notes: String?
    public let upcoming: Int
    public let lastSessionAt: Date?
    public let owedCents: Int
    public var id: String { playerId }
}

/// `clients.invites`
public struct Invite: Decodable, Sendable, Equatable, Identifiable {
    public let id: String
    public let name: String
    public let email: String?
    public let phone: String?
    /// The server's invite text (the coach sends it from their own phone or email).
    public let subject: String
    public let message: String
}

/// `clients.import`
public struct ImportResult: Decodable, Sendable, Equatable {
    public struct Failure: Decodable, Sendable, Equatable {
        public let name: String
        public let reason: String
    }

    public let added: Int
    public let duplicates: Int
    public let failed: [Failure]
    public let skipped: [String]
}

/// `courts.list`
public struct Court: Decodable, Sendable, Equatable, Identifiable {
    public let id: String
    public let name: String
    public let address: String?
    public let notes: String?
    public let bookingUrl: String?
    public let bookingNote: String?
}

/// `money.summary`
public struct MoneySummary: Decodable, Sendable, Equatable {
    public struct Owed: Decodable, Sendable, Equatable, Identifiable {
        public let bookingId: String
        public let playerName: String
        public let sessionTitle: String
        public let startsAt: Date
        public let amountCents: Int
        public let paymentRule: String
        public let paymentStatus: String
        public var id: String { bookingId }
    }

    public let collectedCents: Int
    public let refundedCents: Int
    public let feesCents: Int
    public let owedCents: Int
    public let owed: [Owed]
    public let recent: [PaymentRecord]
}

/// A payment in Money (`payerName`) or a player's receipts (`providerName`).
public struct PaymentRecord: Decodable, Sendable, Equatable, Identifiable {
    public let id: String
    public let purpose: String
    public let status: String
    public let amountCents: Int
    public let refundedCents: Int
    public let createdAt: Date
    public let payerName: String?
    public let providerName: String?
}

/// `payments.mine`
public struct MyPayments: Decodable, Sendable, Equatable {
    public struct Card: Decodable, Sendable, Equatable {
        public let brand: String?
        public let last4: String
    }

    public let payments: [PaymentRecord]
    public let card: Card?
}

/// `plan.get`
public struct PlanInfo: Decodable, Sendable, Equatable {
    public struct Plan: Decodable, Sendable, Equatable {
        public let label: String
        public let monthlyCents: Int
        public let feeBps: Int
        public let summary: String
    }

    public struct Plans: Decodable, Sendable, Equatable {
        public let free: Plan
        public let pro: Plan
    }

    /// free, pro
    public let current: String
    public let plans: Plans
}

/// `packages.list` (a provider's own, including stopped ones)
public struct OwnPackage: Decodable, Sendable, Equatable, Identifiable {
    public let id: String
    public let name: String
    public let credits: Int
    public let priceCents: Int
    public let validDays: Int?
    public let kinds: [String]
    public let active: Bool
}

/// `credits.sold`
public struct SoldPackage: Decodable, Sendable, Equatable, Identifiable {
    public let id: String
    public let name: String
    public let creditsTotal: Int
    public let creditsUsed: Int
}

/// `account.get`
public struct AccountDetails: Decodable, Sendable, Equatable {
    public let displayName: String
    public let email: String?
    public let phone: String?
    public let notifyEmail: Bool
    public let notifySms: Bool
    /// Push to the iPhone app (the server skips push when off).
    public let notifyPush: Bool
}

// MARK: Results

public struct HostedLink: Decodable, Sendable, Equatable {
    public let url: URL
}

public struct Notified: Decodable, Sendable, Equatable {
    public let notified: Int?
}

public struct DayCancelled: Decodable, Sendable, Equatable {
    public let cancelled: Int
    public let notified: Int
}

public struct PlayersAdded: Decodable, Sendable, Equatable {
    public struct Result: Decodable, Sendable, Equatable {
        public let sessionId: String
        public let status: String
    }

    public let added: Int
    public let results: [Result]
}

public struct OfferingSaved: Decodable, Sendable, Equatable {
    public let offering: Offering
    public let keptWithBookings: Int?
}

public struct SeriesStopped: Decodable, Sendable, Equatable {
    public let keptWithBookings: Int
}
