import Foundation
import Testing
@testable import VamoKit

/// Real responses recorded from a seeded dev server (`npm run ios:fixtures`). Every fixture must be a
/// well-formed envelope, and every command with a model must decode its fixtures. Set
/// VAMO_FIXTURES_DIR to check a fresh recording instead (test:ios-native does), so output drift
/// on the server fails here.
struct FixtureTests {
    struct Fixture: CustomTestStringConvertible, Sendable {
        let file: String
        let data: Data
        var command: String { file.split(separator: ".").prefix(2).joined(separator: ".") }
        var isError: Bool { file.contains(".error-") }
        var testDescription: String { file }
    }

    static let fixtures: [Fixture] = {
        let dir: URL
        if let override = ProcessInfo.processInfo.environment["VAMO_FIXTURES_DIR"] {
            dir = URL(fileURLWithPath: override)
        } else {
            dir = Bundle.module.url(forResource: "Fixtures", withExtension: nil)!
        }
        let files = (try? FileManager.default.contentsOfDirectory(atPath: dir.path)) ?? []
        return files.filter { $0.hasSuffix(".json") }.sorted().map { Fixture(file: $0, data: try! Data(contentsOf: dir.appending(path: $0))) }
    }()

    /// Commands with a model: decode with the same code path the app uses.
    static let decoders: [String: @Sendable (Data) throws -> Void] = [
        "account.me": { _ = try decode($0, as: Account?.self) },
        "notifications.list": { _ = try decode($0, as: NotificationsPage.self) },
        "sessions.view": { _ = try decode($0, as: SessionPage.self) },
        "bookings.mine": { _ = try decode($0, as: [MyBooking].self) },
        "bookings.get": { _ = try decode($0, as: BookingDetail.self) },
        "find.providers": { _ = try decode($0, as: [ProviderCard].self) },
        "find.sessions": { _ = try decode($0, as: [SessionView].self) },
        "schedule.public": { _ = try decode($0, as: PublicSchedule.self) },
        "packages.public": { _ = try decode($0, as: [CreditPackage].self) },
        "credits.mine": { _ = try decode($0, as: [PackagePurchase].self) },
        "coaches.mine": { _ = try decode($0, as: [MyCoach].self) },
        "messages.threads": { _ = try decode($0, as: [MessageThread].self) },
        "messages.read": { _ = try decode($0, as: Conversation.self) },
        "family.list": { _ = try decode($0, as: [Player].self) },
        "provider.settings": { _ = try decode($0, as: ProviderSettings.self) },
        "sessions.list": { _ = try decode($0, as: [SessionView].self) },
        "sessions.get": { _ = try decode($0, as: SessionView.self) },
        "sessions.roster": { _ = try decode($0, as: [RosterEntry].self) },
        "offerings.list": { _ = try decode($0, as: [Offering].self) },
        "offerings.get": { _ = try decode($0, as: Offering.self) },
        "clients.list": { _ = try decode($0, as: [Client].self) },
        "clients.invites": { _ = try decode($0, as: [Invite].self) },
        "courts.list": { _ = try decode($0, as: [Court].self) },
        "money.summary": { _ = try decode($0, as: MoneySummary.self) },
        "plan.get": { _ = try decode($0, as: PlanInfo.self) },
        "credits.sold": { _ = try decode($0, as: [SoldPackage].self) },
        "packages.list": { _ = try decode($0, as: [OwnPackage].self) },
        "payments.mine": { _ = try decode($0, as: MyPayments.self) },
        "account.get": { _ = try decode($0, as: AccountDetails.self) },
        "assistant.history": { _ = try decode($0, as: AssistantHistory.self) },
    ]

    static func decode<T: Decodable>(_ data: Data, as type: T.Type) throws -> T {
        try APIClient.decode(data, status: 200, label: "fixture")
    }

    @Test func thereAreFixturesForEveryModelledCommand() {
        #expect(Self.fixtures.count > 50)
        for command in Self.decoders.keys { #expect(Self.fixtures.contains { $0.command == command && !$0.isError }, "no fixture for \(command)") }
    }

    @Test(arguments: fixtures) func isAWellFormedEnvelope(_ fixture: Fixture) throws {
        let envelope = try JSONDecoder().decode([String: JSONValue].self, from: fixture.data)
        #expect(Array(envelope.keys) == [fixture.isError ? "error" : "data"])
        // Every timestamp and date in the response parses with the app's date strategy.
        func walk(_ value: JSONValue, _ path: String) {
            switch value {
            case .string(let text) where text.range(of: #"^\d{4}-\d{2}-\d{2}(T|$)"#, options: .regularExpression) != nil:
                #expect(VamoJSON.parseDate(text) != nil, "\(fixture.file) \(path): \(text)")
            case .array(let items): for (i, item) in items.enumerated() { walk(item, "\(path)[\(i)]") }
            case .object(let object): for (key, item) in object { walk(item, "\(path).\(key)") }
            default: break
            }
        }
        walk(.object(envelope), "")
    }

    @Test(arguments: fixtures.filter { decoders[$0.command] != nil && !$0.isError })
    func decodesIntoTheModel(_ fixture: Fixture) throws {
        try Self.decoders[fixture.command]!(fixture.data)
    }

    @Test(arguments: fixtures.filter(\.isError))
    func errorFixturesBecomeAPIErrors(_ fixture: Fixture) {
        do {
            let _: JSONValue = try APIClient.decode(fixture.data, status: 400, label: fixture.command)
            Issue.record("expected an error")
        } catch {
            #expect(!error.code.isEmpty && !error.message.isEmpty && error.code != "internal")
        }
    }

    @Test func signedOutAccountIsNil() throws {
        let guest = try #require(Self.fixtures.first { $0.file == "account.me.guest.json" })
        #expect(try Self.decode(guest.data, as: Account?.self) == nil)
        let player = try #require(Self.fixtures.first { $0.file == "account.me.player.json" })
        let account = try #require(try Self.decode(player.data, as: Account?.self))
        #expect(account.firstName == "Maya" && !account.isProvider && account.onboarded)
        let coach = try #require(Self.fixtures.first { $0.file == "account.me.coach.json" })
        #expect(try Self.decode(coach.data, as: Account?.self)?.isProvider == true)
    }
}
