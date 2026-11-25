import Foundation
import Testing
@testable import VamoKit

struct JSONCodingTests {
    @Test func parsesTheServersThreeDateShapes() throws {
        let withMillis = try #require(VamoJSON.parseDate("2026-11-24T10:00:00.000Z"))
        let without = try #require(VamoJSON.parseDate("2026-11-24T10:00:00Z"))
        #expect(withMillis == without)
        #expect(withMillis.timeIntervalSince1970 == 1_795_514_400)
        let day = try #require(VamoJSON.parseDate("2014-04-02"))
        #expect(day.formatted(Date.ISO8601FormatStyle()) == "2014-04-02T00:00:00Z")
        #expect(VamoJSON.parseDate("yesterday") == nil)
        #expect(VamoJSON.parseDate("2026-13-40") == nil)
    }

    @Test func decodingFailsOnAnUnknownDate() {
        struct Row: Decodable { let at: Date }
        #expect(throws: DecodingError.self) { try VamoJSON.decoder().decode(Row.self, from: Data(#"{"at":"soon"}"#.utf8)) }
    }

    @Test func encodesDatesWithMillisecondsAndOmitsNilFields() throws {
        struct Input: Encodable { let at: Date; let note: String? }
        let json = String(decoding: try VamoJSON.encoder().encode(Input(at: Date(timeIntervalSince1970: 0), note: nil)), as: UTF8.self)
        #expect(json == #"{"at":"1970-01-01T00:00:00.000Z"}"#)
        #expect(String(decoding: try VamoJSON.encoder().encode(NoInput()), as: UTF8.self) == "{}")
    }
}
