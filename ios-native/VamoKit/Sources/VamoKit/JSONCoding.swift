import Foundation

// The server's JSON dates: timestamps are ISO-8601 with milliseconds ("2026-11-24T10:00:00.000Z",
// which JSONDecoder's built-in `.iso8601` rejects); Postgres `date` columns are plain "YYYY-MM-DD"
// (decoded as midnight UTC, so format them in UTC).

public enum VamoJSON {
    public static func decoder() -> JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let text = try container.decode(String.self)
            guard let date = parseDate(text) else {
                throw DecodingError.dataCorruptedError(in: container, debugDescription: "Unrecognized date: \(text)")
            }
            return date
        }
        return decoder
    }

    public static func encoder() -> JSONEncoder {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .custom { date, encoder in
            var container = encoder.singleValueContainer()
            try container.encode(date.formatted(timestamp))
        }
        return encoder
    }

    private static let timestamp = Date.ISO8601FormatStyle(includingFractionalSeconds: true)
    private static let timestampWithoutFraction = Date.ISO8601FormatStyle()
    private static let calendarDate = Date.ISO8601FormatStyle().year().month().day().dateSeparator(.dash)

    /// Parses a server date in any of its three shapes; nil if it's none of them.
    public static func parseDate(_ text: String) -> Date? {
        if let date = try? timestamp.parse(text) { return date }
        if let date = try? timestampWithoutFraction.parse(text) { return date }
        if text.count == 10, let date = try? calendarDate.parse(text) { return date }
        return nil
    }
}
