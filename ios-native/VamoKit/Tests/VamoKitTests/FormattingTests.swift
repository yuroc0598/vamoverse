import Foundation
import Testing
@testable import VamoKit

/// strings.json vectors are outputs of the web's real TS formatters; Swift must match every one.
struct FormattingTests {
    struct Vector: Decodable {
        let args: [JSONValue]
        let out: JSONValue
    }

    struct Vectors: Decodable {
        struct Cases: Decodable { let cases: [Vector] }
        let formatMoney: [Vector]
        let priceLabel: [Vector]
        let levelLabel: [Vector]
        let seatsLabel: [Vector]
        let policyLabel: [Vector]
        let formatDateTime: [Vector]
        let formatDate: Cases
        let formatTime: [Vector]
        let formatDayHeading: [Vector]
        let formatSessionRange: [Vector]
    }

    static let vectors: Vectors = {
        struct File: Decodable { let vectors: Vectors }
        let data = try! Data(contentsOf: Labels.resourceURL!)
        return try! JSONDecoder().decode(File.self, from: data).vectors
    }()

    func int(_ value: JSONValue) -> Int {
        guard case .number(let n) = value else { Issue.record("not a number: \(value)"); return 0 }
        return Int(n)
    }

    func double(_ value: JSONValue) -> Double? {
        if case .number(let n) = value { return n }
        return nil
    }

    func string(_ value: JSONValue) -> String? {
        if case .string(let s) = value { return s }
        return nil
    }

    func date(_ value: JSONValue) -> Date {
        VamoJSON.parseDate(string(value)!)!
    }

    @Test func money() {
        for v in Self.vectors.formatMoney { #expect(VamoFormat.money(int(v.args[0])) == string(v.out), "\(v.args)") }
    }

    @Test func priceLabels() {
        for v in Self.vectors.priceLabel {
            #expect(VamoFormat.priceLabel(cents: int(v.args[0]), rule: string(v.args[1])!) == string(v.out), "\(v.args)")
        }
    }

    @Test func levelLabels() {
        for v in Self.vectors.levelLabel {
            let label = VamoFormat.levelLabel(system: string(v.args[0]), min: double(v.args[1]), max: double(v.args[2]))
            #expect(label == string(v.out), "\(v.args)")
        }
    }

    @Test func seatsLabels() {
        for v in Self.vectors.seatsLabel {
            #expect(VamoFormat.seatsLabel(taken: int(v.args[0]), capacity: int(v.args[1]), waitlist: int(v.args[2])) == string(v.out), "\(v.args)")
        }
    }

    @Test func policyLabels() {
        for v in Self.vectors.policyLabel {
            #expect(VamoFormat.policyLabel(windowHours: int(v.args[0]), lateFeePct: int(v.args[1]), noShowPct: int(v.args[2])) == string(v.out), "\(v.args)")
        }
    }

    @Test func datesAndTimesInTheSessionTimeZone() {
        let v = Self.vectors
        #expect(v.formatSessionRange.count >= 40)
        for c in v.formatDateTime { #expect(VamoFormat.dateTime(date(c.args[0]), timeZone: string(c.args[1])!) == string(c.out), "\(c.args)") }
        for c in v.formatDate.cases { #expect(VamoFormat.date(date(c.args[0]), timeZone: string(c.args[1])!) == string(c.out), "\(c.args)") }
        for c in v.formatTime { #expect(VamoFormat.time(date(c.args[0]), timeZone: string(c.args[1])!) == string(c.out), "\(c.args)") }
        for c in v.formatDayHeading { #expect(VamoFormat.dayHeading(date(c.args[0]), timeZone: string(c.args[1])!) == string(c.out), "\(c.args)") }
        for c in v.formatSessionRange {
            let range = VamoFormat.sessionRange(start: date(c.args[0]), end: date(c.args[1]), timeZone: string(c.args[2])!)
            #expect(range == string(c.out), "\(c.args)")
        }
    }

    @Test func labelMapsFallBackToTheRawKeyLikeTheWeb() {
        let labels = Labels.shared
        #expect(labels.offeringKind("group") == "Group clinic")
        #expect(labels.bookingStatus("held") == "Finish payment")
        #expect(labels.rosterStatus("requested") == .init(label: "Asking to join", variant: "warning"))
        #expect(labels.rosterPayment("none") == "")
        #expect(labels.bookingStatus("brand_new") == "brand_new")
        #expect(labels.weekdays.count == 7)
    }
}
