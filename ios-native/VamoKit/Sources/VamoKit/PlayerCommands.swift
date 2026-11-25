import Foundation

// Inputs and typed constants for the player and parent commands (docs/api/commands.json).
// Optional fields are omitted when nil, so server defaults apply.

public struct SessionIdInput: Encodable, Sendable {
    public let sessionId: String
    public init(sessionId: String) { self.sessionId = sessionId }
}

public struct BookingInput: Encodable, Sendable {
    public let bookingId: String
    public let token: String?
    public init(bookingId: String, token: String? = nil) { self.bookingId = bookingId; self.token = token }
}

public struct CreateBookingInput: Encodable, Sendable {
    public let sessionId: String
    public let playerId: String?
    public let useCredit: Bool
    public init(sessionId: String, playerId: String?, useCredit: Bool) { self.sessionId = sessionId; self.playerId = playerId; self.useCredit = useCredit }
}

public struct AcceptInviteInput: Encodable, Sendable {
    public let bookingId: String
    public let token: String?
    public let allInSeries: Bool
    public init(bookingId: String, token: String?, allInSeries: Bool) { self.bookingId = bookingId; self.token = token; self.allInSeries = allInSeries }
}

public struct BookingsMineInput: Encodable, Sendable {
    /// upcoming (default) or past
    public let scope: String?
    public init(scope: String? = nil) { self.scope = scope }
}

public struct FindInput: Encodable, Sendable {
    /// any, hitting, coaching
    public let type: String
    public let area: String?
    public let query: String?
    public init(type: String, area: String?, query: String?) { self.type = type; self.area = area; self.query = query }
}

public struct SlugInput: Encodable, Sendable {
    public let slug: String
    public init(slug: String) { self.slug = slug }
}

public struct ProviderIdInput: Encodable, Sendable {
    public let providerId: String
    public init(providerId: String) { self.providerId = providerId }
}

public struct PackageIdInput: Encodable, Sendable {
    public let packageId: String
    public init(packageId: String) { self.packageId = packageId }
}

public struct ThreadIdInput: Encodable, Sendable {
    public let threadId: String
    public init(threadId: String) { self.threadId = threadId }
}

public struct SendMessageInput: Encodable, Sendable {
    public let threadId: String
    public let body: String
    public init(threadId: String, body: String) { self.threadId = threadId; self.body = body }
}

/// Exactly one of the three (the server checks).
public struct StartThreadInput: Encodable, Sendable {
    public let providerId: String?
    public let playerId: String?
    public let offeringId: String?
    public init(providerId: String? = nil, playerId: String? = nil, offeringId: String? = nil) {
        self.providerId = providerId; self.playerId = playerId; self.offeringId = offeringId
    }
}

public struct PlayerIdInput: Encodable, Sendable {
    public let playerId: String
    public init(playerId: String) { self.playerId = playerId }
}

public struct AddJuniorInput: Encodable, Sendable {
    public let displayName: String
    /// YYYY-MM-DD
    public let birthDate: String
    public let gender: String?
    public let signatureName: String
    public let consent: Bool
    public init(displayName: String, birthDate: String, gender: String?, signatureName: String, consent: Bool) {
        self.displayName = displayName; self.birthDate = birthDate; self.gender = gender; self.signatureName = signatureName; self.consent = consent
    }
}

/// `players.update`. Ratings are sent as typed ("3.5"; empty clears); the server parses them and
/// explains anything that isn't a number, with the same message as on the web.
public struct UpdatePlayerInput: Encodable, Sendable {
    public let playerId: String
    public let displayName: String?
    public let birthDate: String?
    public let gender: String?
    public let ntrp: String
    public let utrSingles: String
    public let utrDoubles: String
    public let utrProfileId: String?

    public init(playerId: String, displayName: String?, birthDate: String?, gender: String?, ntrp: String, utrSingles: String, utrDoubles: String, utrProfileId: String?) {
        self.playerId = playerId; self.displayName = displayName; self.birthDate = birthDate; self.gender = gender
        self.ntrp = ntrp; self.utrSingles = utrSingles; self.utrDoubles = utrDoubles; self.utrProfileId = utrProfileId
    }

    private enum Keys: String, CodingKey { case playerId, displayName, birthDate, gender, ntrp, utrSingles, utrDoubles, utrProfileId }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: Keys.self)
        try c.encode(playerId, forKey: .playerId)
        try c.encodeIfPresent(displayName, forKey: .displayName)
        try c.encodeIfPresent(birthDate, forKey: .birthDate)
        // Gender and the UTR id clear when nil (explicit null), as the web form does.
        try c.encode(gender, forKey: .gender)
        try c.encode(ntrp, forKey: .ntrp)
        try c.encode(utrSingles, forKey: .utrSingles)
        try c.encode(utrDoubles, forKey: .utrDoubles)
        try c.encode(utrProfileId, forKey: .utrProfileId)
    }
}

public struct OnboardingInput: Encodable, Sendable {
    public let displayName: String
    public let adult: Bool
    public let offersCoaching: Bool
    public let offersHitting: Bool
    public init(displayName: String, adult: Bool, offersCoaching: Bool, offersHitting: Bool) {
        self.displayName = displayName; self.adult = adult; self.offersCoaching = offersCoaching; self.offersHitting = offersHitting
    }
}

// MARK: Typed constants

extension Command where Input == SessionIdInput, Output == SessionPage { public static var sessionsView: Self { .init("sessions.view") } }
extension Command where Input == CreateBookingInput, Output == BookingCreated { public static var bookingsCreate: Self { .init("bookings.create") } }
extension Command where Input == BookingsMineInput, Output == [MyBooking] { public static var bookingsMine: Self { .init("bookings.mine") } }
extension Command where Input == BookingInput, Output == BookingDetail { public static var bookingsGet: Self { .init("bookings.get") } }
extension Command where Input == BookingInput, Output == CheckoutLink { public static var bookingsCheckout: Self { .init("bookings.checkout") } }
extension Command where Input == BookingInput, Output == BookingCancelled { public static var bookingsCancel: Self { .init("bookings.cancel") } }
extension Command where Input == BookingInput, Output == Ignored { public static var bookingsDeclineInvite: Self { .init("bookings.declineInvite") } }
extension Command where Input == AcceptInviteInput, Output == InviteAccepted { public static var bookingsAcceptInvite: Self { .init("bookings.acceptInvite") } }
extension Command where Input == FindInput, Output == [ProviderCard] { public static var findProviders: Self { .init("find.providers") } }
extension Command where Input == FindInput, Output == [SessionView] { public static var findSessions: Self { .init("find.sessions") } }
extension Command where Input == SlugInput, Output == PublicSchedule { public static var schedulePublic: Self { .init("schedule.public") } }
extension Command where Input == SlugInput, Output == [CreditPackage] { public static var packagesPublic: Self { .init("packages.public") } }
extension Command where Input == SlugInput, Output == Ignored { public static var clientsJoin: Self { .init("clients.join") } }
extension Command where Input == ProviderIdInput, Output == Ignored { public static var clientsLeave: Self { .init("clients.leave") } }
extension Command where Input == PackageIdInput, Output == CheckoutLink { public static var packagesBuy: Self { .init("packages.buy") } }
extension Command where Input == NoInput, Output == [PackagePurchase] { public static var creditsMine: Self { .init("credits.mine") } }
extension Command where Input == NoInput, Output == [MyCoach] { public static var coachesMine: Self { .init("coaches.mine") } }
extension Command where Input == NoInput, Output == [MessageThread] { public static var messagesThreads: Self { .init("messages.threads") } }
extension Command where Input == ThreadIdInput, Output == Conversation { public static var messagesRead: Self { .init("messages.read") } }
extension Command where Input == SendMessageInput, Output == ChatMessage { public static var messagesSend: Self { .init("messages.send") } }
extension Command where Input == StartThreadInput, Output == ThreadStarted { public static var messagesStart: Self { .init("messages.start") } }
extension Command where Input == NoInput, Output == Ignored { public static var notificationsMarkRead: Self { .init("notifications.markRead") } }
extension Command where Input == NoInput, Output == [Player] { public static var familyList: Self { .init("family.list") } }
extension Command where Input == AddJuniorInput, Output == Player { public static var familyAddJunior: Self { .init("family.addJunior") } }
extension Command where Input == PlayerIdInput, Output == Ignored { public static var familyRemoveJunior: Self { .init("family.removeJunior") } }
extension Command where Input == UpdatePlayerInput, Output == Player { public static var playersUpdate: Self { .init("players.update") } }
extension Command where Input == OnboardingInput, Output == Account { public static var onboardingComplete: Self { .init("onboarding.complete") } }
