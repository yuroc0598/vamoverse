import Foundation

// Inputs and typed constants for the provider and settings commands (docs/api/commands.json).
// Where the web form sends `null` to clear a field, these encode an explicit null too.

public struct SessionsListInput: Encodable, Sendable {
    public let days: Int?
    public let offsetDays: Int?
    public init(days: Int? = nil, offsetDays: Int? = nil) { self.days = days; self.offsetDays = offsetDays }
}

public struct OfferingIdInput: Encodable, Sendable {
    public let offeringId: String
    public init(offeringId: String) { self.offeringId = offeringId }
}

public struct AddPlayerInput: Encodable, Sendable {
    public let sessionId: String
    public let playerId: String
    public let allFuture: Bool
    public init(sessionId: String, playerId: String, allFuture: Bool) { self.sessionId = sessionId; self.playerId = playerId; self.allFuture = allFuture }
}

public struct AttendanceInput: Encodable, Sendable {
    public let bookingId: String
    /// attended, no_show
    public let outcome: String
    public init(bookingId: String, outcome: String) { self.bookingId = bookingId; self.outcome = outcome }
}

/// `sessions.update`: move or edit one session.
public struct UpdateSessionInput: Encodable, Sendable {
    public let sessionId: String
    public let date: String
    public let startTime: String
    public let durationMinutes: Int
    public let capacity: Int
    public let note: String?
    public let courtStatus: String
    public let courtConfirmation: String?

    public init(sessionId: String, date: String, startTime: String, durationMinutes: Int, capacity: Int, note: String?, courtStatus: String, courtConfirmation: String?) {
        self.sessionId = sessionId; self.date = date; self.startTime = startTime; self.durationMinutes = durationMinutes
        self.capacity = capacity; self.note = note; self.courtStatus = courtStatus; self.courtConfirmation = courtConfirmation
    }

    private enum Keys: String, CodingKey { case sessionId, date, startTime, durationMinutes, capacity, note, courtStatus, courtConfirmation }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: Keys.self)
        try c.encode(sessionId, forKey: .sessionId)
        try c.encode(date, forKey: .date)
        try c.encode(startTime, forKey: .startTime)
        try c.encode(durationMinutes, forKey: .durationMinutes)
        try c.encode(capacity, forKey: .capacity)
        try c.encode(note, forKey: .note)
        try c.encode(courtStatus, forKey: .courtStatus)
        try c.encode(courtConfirmation, forKey: .courtConfirmation)
    }
}

public struct CancelSessionInput: Encodable, Sendable {
    public let sessionId: String
    public let reason: String?
    public init(sessionId: String, reason: String?) { self.sessionId = sessionId; self.reason = reason }
}

public struct CancelDayInput: Encodable, Sendable {
    /// YYYY-MM-DD in the provider's time zone
    public let date: String
    public let reason: String?
    public init(date: String, reason: String?) { self.date = date; self.reason = reason }
}

/// `offerings.create` (with `kind`) and `offerings.update` (with `offeringId`): every field, as the web form sends it.
public struct OfferingInput: Encodable, Sendable {
    public var offeringId: String?
    public var kind: String?
    public var title: String
    public var description: String?
    public var discipline: String?
    public var audience: String
    public var capacity: Int
    public var priceCents: Int
    public var paymentRule: String
    public var acceptsCredits: Bool
    public var levelSystem: String?
    public var levelMin: Double?
    public var levelMax: Double?
    public var visibility: String
    public var courtId: String?
    public var locationName: String?
    public var locationNote: String?
    public var startDate: String
    public var startTime: String
    public var durationMinutes: Int
    public var slotsPerDay: Int
    public var repeatWeekdays: [Int]?
    public var repeatEveryWeeks: Int
    public var endDate: String?

    public init(offeringId: String? = nil, kind: String? = nil, title: String, description: String?, discipline: String?, audience: String,
                capacity: Int, priceCents: Int, paymentRule: String, acceptsCredits: Bool, levelSystem: String?, levelMin: Double?, levelMax: Double?,
                visibility: String, courtId: String?, locationName: String?, locationNote: String?, startDate: String, startTime: String,
                durationMinutes: Int, slotsPerDay: Int, repeatWeekdays: [Int]?, repeatEveryWeeks: Int, endDate: String?) {
        self.offeringId = offeringId; self.kind = kind; self.title = title; self.description = description; self.discipline = discipline
        self.audience = audience; self.capacity = capacity; self.priceCents = priceCents; self.paymentRule = paymentRule
        self.acceptsCredits = acceptsCredits; self.levelSystem = levelSystem; self.levelMin = levelMin; self.levelMax = levelMax
        self.visibility = visibility; self.courtId = courtId; self.locationName = locationName; self.locationNote = locationNote
        self.startDate = startDate; self.startTime = startTime; self.durationMinutes = durationMinutes; self.slotsPerDay = slotsPerDay
        self.repeatWeekdays = repeatWeekdays; self.repeatEveryWeeks = repeatEveryWeeks; self.endDate = endDate
    }

    private enum Keys: String, CodingKey {
        case offeringId, kind, title, description, discipline, audience, capacity, priceCents, paymentRule, acceptsCredits, levelSystem,
             levelMin, levelMax, visibility, courtId, locationName, locationNote, startDate, startTime, durationMinutes, slotsPerDay,
             repeatWeekdays, repeatEveryWeeks, endDate
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: Keys.self)
        try c.encodeIfPresent(offeringId, forKey: .offeringId)
        try c.encodeIfPresent(kind, forKey: .kind)
        try c.encode(title, forKey: .title)
        try c.encode(description, forKey: .description)
        try c.encode(discipline, forKey: .discipline)
        try c.encode(audience, forKey: .audience)
        try c.encode(capacity, forKey: .capacity)
        try c.encode(priceCents, forKey: .priceCents)
        try c.encode(paymentRule, forKey: .paymentRule)
        try c.encode(acceptsCredits, forKey: .acceptsCredits)
        try c.encode(levelSystem, forKey: .levelSystem)
        try c.encode(levelMin, forKey: .levelMin)
        try c.encode(levelMax, forKey: .levelMax)
        try c.encode(visibility, forKey: .visibility)
        try c.encode(courtId, forKey: .courtId)
        try c.encode(locationName, forKey: .locationName)
        try c.encode(locationNote, forKey: .locationNote)
        try c.encode(startDate, forKey: .startDate)
        try c.encode(startTime, forKey: .startTime)
        try c.encode(durationMinutes, forKey: .durationMinutes)
        try c.encode(slotsPerDay, forKey: .slotsPerDay)
        try c.encode(repeatWeekdays, forKey: .repeatWeekdays)
        try c.encode(repeatEveryWeeks, forKey: .repeatEveryWeeks)
        try c.encode(endDate, forKey: .endDate)
    }
}

public struct ClientsListInput: Encodable, Sendable {
    public let search: String?
    public init(search: String? = nil) { self.search = search }
}

/// `clients.import`: pasted text (parsed on the server) or rows (e.g. from Contacts).
public struct ImportInvitesInput: Encodable, Sendable {
    public struct Contact: Encodable, Sendable {
        public let name: String
        public let email: String?
        public let phone: String?
        public init(name: String, email: String?, phone: String?) { self.name = name; self.email = email; self.phone = phone }
    }

    public let text: String?
    public let contacts: [Contact]?
    public static func text(_ text: String) -> Self { .init(text: text, contacts: nil) }
    public static func contacts(_ contacts: [Contact]) -> Self { .init(text: nil, contacts: contacts) }
}

public struct PreviewImportInput: Encodable, Sendable {
    public let text: String
    public init(text: String) { self.text = text }
}

/// `clients.preview`: what saving pasted text would add (the server's parse, nothing saved).
public struct ImportPreview: Decodable, Sendable, Equatable {
    public struct Row: Decodable, Sendable, Equatable {
        public let name: String
        public let email: String?
        public let phone: String?
    }

    public let rows: [Row]
    public let skipped: [String]
}

public struct InviteIdInput: Encodable, Sendable {
    public let inviteId: String
    public init(inviteId: String) { self.inviteId = inviteId }
}

/// `clients.update`: private notes (null clears).
public struct ClientNotesInput: Encodable, Sendable {
    public let playerId: String
    public let notes: String?
    public init(playerId: String, notes: String?) { self.playerId = playerId; self.notes = notes }

    private enum Keys: String, CodingKey { case playerId, notes }
    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: Keys.self)
        try c.encode(playerId, forKey: .playerId)
        try c.encode(notes, forKey: .notes)
    }
}

public struct MoneyInput: Encodable, Sendable {
    public let days: Int?
    public init(days: Int? = nil) { self.days = days }
}

public struct AccountUpdateInput: Encodable, Sendable {
    public let displayName: String
    public let notifyEmail: Bool
    public let notifySms: Bool
    public let notifyPush: Bool
    public init(displayName: String, notifyEmail: Bool, notifySms: Bool, notifyPush: Bool) {
        self.displayName = displayName; self.notifyEmail = notifyEmail; self.notifySms = notifySms; self.notifyPush = notifyPush
    }
}

public struct DeleteAccountInput: Encodable, Sendable {
    /// Must be "DELETE".
    public let confirm: String
    public init(confirm: String) { self.confirm = confirm }
}

public struct ProviderSetupInput: Encodable, Sendable {
    public let offersCoaching: Bool
    public let offersHitting: Bool
    public init(offersCoaching: Bool, offersHitting: Bool) { self.offersCoaching = offersCoaching; self.offersHitting = offersHitting }
}

/// `provider.update`: the whole business form (rates send null when empty).
public struct ProviderUpdateInput: Encodable, Sendable {
    public var slug: String
    public var headline: String
    public var bio: String
    public var homeArea: String
    public var timezone: String
    public var offersCoaching: Bool
    public var offersHitting: Bool
    public var ratePrivateCents: Int?
    public var rateSemiPrivateCents: Int?
    public var rateGroupCents: Int?
    public var rateHittingCents: Int?
    public var cancelWindowHours: Int
    public var lateCancelFeePct: Int
    public var noShowFeePct: Int
    public var listed: Bool

    public init(_ s: ProviderSettings) {
        slug = s.slug; headline = s.headline ?? ""; bio = s.bio ?? ""; homeArea = s.homeArea ?? ""; timezone = s.timezone
        offersCoaching = s.offersCoaching; offersHitting = s.offersHitting
        ratePrivateCents = s.ratePrivateCents; rateSemiPrivateCents = s.rateSemiPrivateCents; rateGroupCents = s.rateGroupCents; rateHittingCents = s.rateHittingCents
        cancelWindowHours = s.cancelWindowHours; lateCancelFeePct = s.lateCancelFeePct; noShowFeePct = s.noShowFeePct; listed = s.listed
    }

    private enum Keys: String, CodingKey {
        case slug, headline, bio, homeArea, timezone, offersCoaching, offersHitting, ratePrivateCents, rateSemiPrivateCents, rateGroupCents,
             rateHittingCents, cancelWindowHours, lateCancelFeePct, noShowFeePct, listed
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: Keys.self)
        try c.encode(slug, forKey: .slug)
        try c.encode(headline, forKey: .headline)
        try c.encode(bio, forKey: .bio)
        try c.encode(homeArea, forKey: .homeArea)
        try c.encode(timezone, forKey: .timezone)
        try c.encode(offersCoaching, forKey: .offersCoaching)
        try c.encode(offersHitting, forKey: .offersHitting)
        try c.encode(ratePrivateCents, forKey: .ratePrivateCents)
        try c.encode(rateSemiPrivateCents, forKey: .rateSemiPrivateCents)
        try c.encode(rateGroupCents, forKey: .rateGroupCents)
        try c.encode(rateHittingCents, forKey: .rateHittingCents)
        try c.encode(cancelWindowHours, forKey: .cancelWindowHours)
        try c.encode(lateCancelFeePct, forKey: .lateCancelFeePct)
        try c.encode(noShowFeePct, forKey: .noShowFeePct)
        try c.encode(listed, forKey: .listed)
    }
}

public struct CourtInput: Encodable, Sendable {
    public let name: String
    public let address: String?
    public let notes: String?
    public let bookingUrl: String?
    public let bookingNote: String?
    public init(name: String, address: String?, notes: String?, bookingUrl: String?, bookingNote: String?) {
        self.name = name; self.address = address; self.notes = notes; self.bookingUrl = bookingUrl; self.bookingNote = bookingNote
    }
}

public struct CourtIdInput: Encodable, Sendable {
    public let courtId: String
    public init(courtId: String) { self.courtId = courtId }
}

public struct SafetyInput: Encodable, Sendable {
    /// usta_safe_play, background_check
    public let method: String
    public let reference: String
    public init(method: String, reference: String) { self.method = method; self.reference = reference }
}

/// `packages.save`: new (no id) or an existing one (e.g. to stop or resume selling).
public struct PackageInput: Encodable, Sendable {
    public let id: String?
    public let name: String
    public let credits: Int
    public let priceCents: Int
    public let validDays: Int?
    public let kinds: [String]
    public let active: Bool?

    public init(id: String? = nil, name: String, credits: Int, priceCents: Int, validDays: Int?, kinds: [String], active: Bool? = nil) {
        self.id = id; self.name = name; self.credits = credits; self.priceCents = priceCents; self.validDays = validDays; self.kinds = kinds; self.active = active
    }

    private enum Keys: String, CodingKey { case id, name, credits, priceCents, validDays, kinds, active }
    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: Keys.self)
        try c.encodeIfPresent(id, forKey: .id)
        try c.encode(name, forKey: .name)
        try c.encode(credits, forKey: .credits)
        try c.encode(priceCents, forKey: .priceCents)
        try c.encode(validDays, forKey: .validDays)
        try c.encode(kinds, forKey: .kinds)
        try c.encodeIfPresent(active, forKey: .active)
    }
}

// MARK: Typed constants

extension Command where Input == NoInput, Output == ProviderSettings { public static var providerSettings: Self { .init("provider.settings") } }
extension Command where Input == SessionsListInput, Output == [SessionView] { public static var sessionsList: Self { .init("sessions.list") } }
extension Command where Input == SessionIdInput, Output == SessionView { public static var sessionsGet: Self { .init("sessions.get") } }
extension Command where Input == SessionIdInput, Output == [RosterEntry] { public static var sessionsRoster: Self { .init("sessions.roster") } }
extension Command where Input == UpdateSessionInput, Output == Notified { public static var sessionsUpdate: Self { .init("sessions.update") } }
extension Command where Input == CancelSessionInput, Output == DayCancelled { public static var sessionsCancel: Self { .init("sessions.cancel") } }
extension Command where Input == CancelDayInput, Output == DayCancelled { public static var sessionsCancelDay: Self { .init("sessions.cancelDay") } }
extension Command where Input == AddPlayerInput, Output == PlayersAdded { public static var bookingsAddPlayer: Self { .init("bookings.addPlayer") } }
extension Command where Input == BookingInput, Output == Ignored {
    public static var bookingsApprove: Self { .init("bookings.approve") }
    public static var bookingsDecline: Self { .init("bookings.decline") }
    public static var bookingsMarkPaid: Self { .init("bookings.markPaid") }
    public static var bookingsWaiveFee: Self { .init("bookings.waiveFee") }
}
extension Command where Input == AttendanceInput, Output == Ignored { public static var bookingsAttendance: Self { .init("bookings.attendance") } }
extension Command where Input == NoInput, Output == [Offering] { public static var offeringsList: Self { .init("offerings.list") } }
extension Command where Input == OfferingIdInput, Output == Offering { public static var offeringsGet: Self { .init("offerings.get") } }
extension Command where Input == OfferingInput, Output == OfferingSaved {
    public static var offeringsCreate: Self { .init("offerings.create") }
    public static var offeringsUpdate: Self { .init("offerings.update") }
}
extension Command where Input == OfferingIdInput, Output == SeriesStopped { public static var offeringsArchive: Self { .init("offerings.archive") } }
extension Command where Input == ClientsListInput, Output == [Client] { public static var clientsList: Self { .init("clients.list") } }
extension Command where Input == NoInput, Output == [Invite] { public static var clientsInvites: Self { .init("clients.invites") } }
extension Command where Input == ImportInvitesInput, Output == ImportResult { public static var clientsImport: Self { .init("clients.import") } }
extension Command where Input == InviteIdInput, Output == Ignored { public static var clientsRemoveInvite: Self { .init("clients.removeInvite") } }
extension Command where Input == PreviewImportInput, Output == ImportPreview { public static var clientsPreview: Self { .init("clients.preview") } }
extension Command where Input == ClientNotesInput, Output == Ignored { public static var clientsUpdate: Self { .init("clients.update") } }
extension Command where Input == MoneyInput, Output == MoneySummary { public static var moneySummary: Self { .init("money.summary") } }
extension Command where Input == NoInput, Output == PlanInfo { public static var planGet: Self { .init("plan.get") } }
extension Command where Input == NoInput, Output == [SoldPackage] { public static var creditsSold: Self { .init("credits.sold") } }
extension Command where Input == NoInput, Output == [OwnPackage] { public static var packagesList: Self { .init("packages.list") } }
extension Command where Input == PackageInput, Output == Ignored { public static var packagesSave: Self { .init("packages.save") } }
extension Command where Input == NoInput, Output == MyPayments { public static var paymentsMine: Self { .init("payments.mine") } }
extension Command where Input == NoInput, Output == AccountDetails { public static var accountGet: Self { .init("account.get") } }
extension Command where Input == AccountUpdateInput, Output == Ignored { public static var accountUpdate: Self { .init("account.update") } }
extension Command where Input == DeleteAccountInput, Output == Ignored { public static var accountDelete: Self { .init("account.delete") } }
extension Command where Input == ProviderSetupInput, Output == Ignored { public static var providerSetup: Self { .init("provider.setup") } }
extension Command where Input == ProviderUpdateInput, Output == Ignored { public static var providerUpdate: Self { .init("provider.update") } }
extension Command where Input == NoInput, Output == [Court] { public static var courtsList: Self { .init("courts.list") } }
extension Command where Input == CourtInput, Output == Ignored { public static var courtsSave: Self { .init("courts.save") } }
extension Command where Input == CourtIdInput, Output == Ignored { public static var courtsDelete: Self { .init("courts.delete") } }
extension Command where Input == SafetyInput, Output == Ignored { public static var safetySubmit: Self { .init("safety.submit") } }
extension Command where Input == NoInput, Output == HostedLink { public static var payoutsConnect: Self { .init("payouts.connect") } }
extension Command where Input == NoInput, Output == Ignored { public static var payoutsRefresh: Self { .init("payouts.refresh") } }
