import Foundation
import Testing
@testable import VamoKit

/// Encodes a sample of every input the app sends, exactly as `APIClient` would. With
/// VAMO_INPUT_SAMPLES set, writes them as <command>.<n>.json for scripts/check-native-inputs.ts,
/// which validates each one with the command's real zod schema (the server's contract).
struct InputSamplesTests {
    struct Sample: Sendable {
        let command: String
        let encode: @Sendable () throws -> Data
        init<I: Encodable & Sendable, O>(_ command: Command<I, O>, _ input: I) {
            self.command = command.name
            self.encode = { try VamoJSON.encoder().encode(input) }
        }
    }

    static let samples: [Sample] = [
        // Player and parent
        Sample(.bookingsCreate, CreateBookingInput(sessionId: "ses_1", playerId: "ply_1", useCredit: true)),
        Sample(.bookingsCreate, CreateBookingInput(sessionId: "ses_1", playerId: nil, useCredit: false)),
        Sample(.bookingsCancel, BookingInput(bookingId: "bkg_1", token: "abc")),
        Sample(.bookingsCheckout, BookingInput(bookingId: "bkg_1")),
        Sample(.bookingsAcceptInvite, AcceptInviteInput(bookingId: "bkg_1", token: nil, allInSeries: true)),
        Sample(.bookingsDeclineInvite, BookingInput(bookingId: "bkg_1")),
        Sample(.findProviders, FindInput(type: "hitting", area: "Fremont", query: nil)),
        Sample(.clientsJoin, SlugInput(slug: "alex-rivera")),
        Sample(.clientsLeave, ProviderIdInput(providerId: "pro_1")),
        Sample(.packagesBuy, PackageIdInput(packageId: "pkg_1")),
        Sample(.messagesSend, SendMessageInput(threadId: "cnv_1", body: "Hi")),
        Sample(.messagesStart, StartThreadInput(providerId: "pro_1")),
        Sample(.messagesStart, StartThreadInput(offeringId: "off_1")),
        Sample(.notificationsMarkRead, NoInput()),
        Sample(.familyAddJunior, AddJuniorInput(displayName: "Leo Kim", birthDate: "2014-04-02", gender: nil, signatureName: "Dave Kim", consent: true)),
        Sample(.familyRemoveJunior, PlayerIdInput(playerId: "ply_1")),
        Sample(.playersUpdate, UpdatePlayerInput(playerId: "ply_1", displayName: "Leo", birthDate: "2014-04-02", gender: "male", ntrp: "3.5", utrSingles: "", utrDoubles: "6", utrProfileId: nil)),
        Sample(.onboardingComplete, OnboardingInput(displayName: "Maya", adult: true, offersCoaching: false, offersHitting: true)),
        // Provider
        Sample(.sessionsList, SessionsListInput(days: 14, offsetDays: 28)),
        Sample(.sessionsUpdate, UpdateSessionInput(sessionId: "ses_1", date: "2026-12-01", startTime: "16:30", durationMinutes: 60, capacity: 1, note: nil, courtStatus: "booked", courtConfirmation: "A12")),
        Sample(.sessionsCancel, CancelSessionInput(sessionId: "ses_1", reason: "Rain")),
        Sample(.sessionsCancelDay, CancelDayInput(date: "2026-12-01", reason: nil)),
        Sample(.bookingsAddPlayer, AddPlayerInput(sessionId: "ses_1", playerId: "ply_1", allFuture: false)),
        Sample(.bookingsAttendance, AttendanceInput(bookingId: "bkg_1", outcome: "no_show")),
        Sample(.bookingsApprove, BookingInput(bookingId: "bkg_1")),
        Sample(.bookingsMarkPaid, BookingInput(bookingId: "bkg_1")),
        Sample(.offeringsCreate, OfferingInput(kind: "group", title: "Clinic", description: nil, discipline: "doubles", audience: "adults", capacity: 8, priceCents: 4000,
                                               paymentRule: "pay_now", acceptsCredits: true, levelSystem: "ntrp", levelMin: 3, levelMax: 4, visibility: "public", courtId: nil,
                                               locationName: "Central Park", locationNote: nil, startDate: "2026-12-01", startTime: "18:30", durationMinutes: 90,
                                               slotsPerDay: 1, repeatWeekdays: [2], repeatEveryWeeks: 1, endDate: nil)),
        Sample(.offeringsUpdate, OfferingInput(offeringId: "off_1", title: "Privates", description: "Bring water", discipline: nil, audience: "all", capacity: 1, priceCents: 9000,
                                               paymentRule: "pay_after", acceptsCredits: false, levelSystem: nil, levelMin: nil, levelMax: nil, visibility: "clients", courtId: "crt_1",
                                               locationName: nil, locationNote: nil, startDate: "2026-12-01", startTime: "16:00", durationMinutes: 60,
                                               slotsPerDay: 3, repeatWeekdays: nil, repeatEveryWeeks: 2, endDate: "2027-03-01")),
        Sample(.offeringsArchive, OfferingIdInput(offeringId: "off_1")),
        Sample(.clientsImport, .text("Maya Chen, maya@example.com")),
        Sample(.clientsImport, .contacts([.init(name: "Sam Lee", email: nil, phone: "+14155550100")])),
        Sample(.clientsRemoveInvite, InviteIdInput(inviteId: "inv_1")),
        Sample(.clientsPreview, PreviewImportInput(text: "Maya Chen, maya@example.com")),
        Sample(.clientsUpdate, ClientNotesInput(playerId: "ply_1", notes: nil)),
        Sample(.moneySummary, MoneyInput()),
        Sample(.accountUpdate, AccountUpdateInput(displayName: "Alex", notifyEmail: true, notifySms: false, notifyPush: true)),
        Sample(.accountDelete, DeleteAccountInput(confirm: "DELETE")),
        Sample(.providerSetup, ProviderSetupInput(offersCoaching: true, offersHitting: false)),
        Sample(.courtsSave, CourtInput(name: "Central Park", address: "", notes: "", bookingUrl: "", bookingNote: "")),
        Sample(.courtsDelete, CourtIdInput(courtId: "crt_1")),
        Sample(.safetySubmit, SafetyInput(method: "usta_safe_play", reference: "123456")),
        Sample(.packagesSave, PackageInput(name: "10 privates", credits: 10, priceCents: 80000, validDays: nil, kinds: ["private"])),
        Sample(.packagesSave, PackageInput(id: "pkg_1", name: "10 privates", credits: 10, priceCents: 80000, validDays: 180, kinds: ["private"], active: false)),
        Sample(.payoutsConnect, NoInput()),
        Sample(.payoutsRefresh, NoInput()),
        // Phase 5
        Sample(.devicesRegister, RegisterDeviceInput(token: deviceTokenHex(Data(repeating: 0xAB, count: 32)), environment: "sandbox")),
        Sample(.devicesUnregister, DeviceTokenInput(token: String(repeating: "0f", count: 32))),
        Sample(.assistantSend, AssistantSendInput(text: "What do I have today?")),
        Sample(.assistantResolve, AssistantResolveInput(actionId: "act_1", decision: "confirm")),
        Sample(.assistantReset, NoInput()),
        Sample(.assistantHistory, NoInput()),
    ]

    @Test func everySampleEncodes() throws {
        let dir = ProcessInfo.processInfo.environment["VAMO_INPUT_SAMPLES"].map { URL(fileURLWithPath: $0) }
        if let dir { try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true) }
        for (index, sample) in Self.samples.enumerated() {
            let data = try sample.encode()
            #expect(try JSONSerialization.jsonObject(with: data) is [String: Any], "\(sample.command)")
            if let dir { try data.write(to: dir.appending(path: "\(sample.command).\(index).json")) }
        }
    }

    @Test func providerUpdateEncodesTheWholeForm() throws {
        // Built from real settings so every field round-trips (rates as explicit nulls when empty).
        let fixture = Bundle.module.url(forResource: "Fixtures", withExtension: nil)!.appending(path: "provider.settings.coach.json")
        let settings: ProviderSettings = try APIClient.decode(try Data(contentsOf: fixture), status: 200, label: "fixture")
        let json = try JSONSerialization.jsonObject(with: try VamoJSON.encoder().encode(ProviderUpdateInput(settings))) as! [String: Any]
        #expect(json.keys.count == 15)
        #expect(json["rateHittingCents"] is NSNull)
        if let dir = ProcessInfo.processInfo.environment["VAMO_INPUT_SAMPLES"] {
            try VamoJSON.encoder().encode(ProviderUpdateInput(settings)).write(to: URL(fileURLWithPath: dir).appending(path: "provider.update.0.json"))
        }
    }
}
