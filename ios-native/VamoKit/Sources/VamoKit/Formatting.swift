import Foundation

// Ports of the web's display formatters (src/lib/format.ts, src/lib/time.ts). They are checked
// against every vector in strings.json, which is generated from the real TS functions, so the
// app's wording matches the web character for character. Times use the session's or offering's
// time zone, never the device's. Calendar math is done by hand (not DateFormatter) so the
// output doesn't depend on the device's locale or ICU version.

public enum VamoFormat {
    // MARK: Money (formatMoney)

    /// "$60", "$60.50", "$1,234.56", "-$25": cents shown only when there are any.
    public static func money(_ cents: Int) -> String {
        let sign = cents < 0 ? "-" : ""
        let magnitude = cents.magnitude
        let dollars = grouped(magnitude / 100)
        let remainder = magnitude % 100
        return remainder == 0 ? "\(sign)$\(dollars)" : "\(sign)$\(dollars).\(remainder < 10 ? "0" : "")\(remainder)"
    }

    private static func grouped(_ value: UInt) -> String {
        let digits = Array(String(value))
        var out = ""
        for (index, digit) in digits.enumerated() {
            if index > 0, (digits.count - index) % 3 == 0 { out.append(",") }
            out.append(digit)
        }
        return out
    }

    // MARK: Labels (priceLabel, levelLabel, seatsLabel, policyLabel)

    /// Payment rules: `free`, `pay_now`, `pay_after`, `external`.
    public static func priceLabel(cents: Int, rule: String) -> String {
        if rule == "free" { return "Free" }
        let price = money(cents)
        switch rule {
        case "pay_after": return "\(price) · charged after"
        case "external": return "\(price) · pay coach directly"
        default: return price
        }
    }

    /// Level systems: `utr`, `ntrp`, `wtn`. "NTRP 3–4", "UTR 3.5+", "WTN up to 9.5".
    public static func levelLabel(system: String?, min: Double?, max: Double?) -> String? {
        guard let system, min != nil || max != nil else { return nil }
        let name = system.uppercased()
        if let min, let max { return "\(name) \(number(min))–\(number(max))" }
        if let min { return "\(name) \(number(min))+" }
        return "\(name) up to \(number(max!))"
    }

    /// JavaScript's number-to-string for ratings: 4 → "4", 3.5 → "3.5".
    private static func number(_ value: Double) -> String {
        value == value.rounded() && abs(value) < 1e15 ? String(Int(value)) : String(value)
    }

    public static func seatsLabel(taken: Int, capacity: Int, waitlist: Int = 0) -> String {
        if capacity == 1 { return taken > 0 ? "Booked" : "Open" }
        let left = Swift.max(0, capacity - taken)
        if left == 0 { return waitlist > 0 ? "Full · \(waitlist) waiting" : "Full · join the waitlist" }
        return "\(left) of \(capacity) spots left"
    }

    public static func policyLabel(windowHours: Int, lateFeePct: Int, noShowPct: Int) -> String {
        let free = windowHours == 0 ? "Free cancellation any time before start" : "Free cancellation up to \(windowHours) hours before"
        let late = lateFeePct != 0 ? "\(lateFeePct)% fee for later cancellations" : "no late-cancel fee"
        let noShow = noShowPct != 0 ? "\(noShowPct)% for no-shows" : "no no-show fee"
        return "\(free); \(late); \(noShow)."
    }

    // MARK: Dates and times (formatDateTime, formatTime, formatSessionRange)

    private static let weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
    private static let months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

    private struct Parts {
        let weekday: Int, month: Int, day: Int, hour: Int, minute: Int
    }

    private static func parts(_ date: Date, _ timeZone: String) -> Parts {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: timeZone) ?? TimeZone(identifier: "America/Los_Angeles")!
        let c = calendar.dateComponents([.weekday, .month, .day, .hour, .minute], from: date)
        return Parts(weekday: c.weekday! - 1, month: c.month! - 1, day: c.day!, hour: c.hour!, minute: c.minute!)
    }

    /// "Tue, Dec 1"
    public static func date(_ date: Date, timeZone: String) -> String {
        let p = parts(date, timeZone)
        return "\(weekdays[p.weekday]), \(months[p.month]) \(p.day)"
    }

    /// "9:00 PM"
    public static func time(_ date: Date, timeZone: String) -> String {
        let p = parts(date, timeZone)
        let hour12 = p.hour % 12 == 0 ? 12 : p.hour % 12
        return "\(hour12):\(p.minute < 10 ? "0" : "")\(p.minute) \(p.hour < 12 ? "AM" : "PM")"
    }

    private static let longWeekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
    private static let longMonths = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]

    /// "Wednesday, November 25": day headings above grouped sessions.
    public static func dayHeading(_ date: Date, timeZone: String) -> String {
        let p = parts(date, timeZone)
        return "\(longWeekdays[p.weekday]), \(longMonths[p.month]) \(p.day)"
    }

    /// Sessions grouped under day headings in each session's own time zone, in order.
    public static func groupByDay(_ sessions: [SessionView]) -> [(day: String, sessions: [SessionView])] {
        var groups: [(day: String, sessions: [SessionView])] = []
        for session in sessions {
            let day = dayHeading(session.startsAt, timeZone: session.timezone)
            if let index = groups.firstIndex(where: { $0.day == day }) { groups[index].sessions.append(session) }
            else { groups.append((day, [session])) }
        }
        return groups
    }

    /// "Tue, Dec 1, 9:00 PM"
    public static func dateTime(_ date: Date, timeZone: String) -> String {
        "\(Self.date(date, timeZone: timeZone)), \(time(date, timeZone: timeZone))"
    }

    /// "Tue, Dec 1 · 9:00 PM – 10:30 PM"
    public static func sessionRange(start: Date, end: Date, timeZone: String) -> String {
        "\(date(start, timeZone: timeZone)) · \(time(start, timeZone: timeZone)) – \(time(end, timeZone: timeZone))"
    }
}
