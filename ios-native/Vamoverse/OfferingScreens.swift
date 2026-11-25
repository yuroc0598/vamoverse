import SwiftUI
import VamoKit

/// /offerings/new
struct NewOfferingScreen: View {
    @Environment(SessionStore.self) private var session

    var body: some View {
        Loaded(load: { () async throws(APIError) in (try await session.api.run(.providerSettings), try await session.api.run(.courtsList)) }) { data, _ in
            OfferingForm(settings: data.0, courts: data.1, offering: nil, saved: { _ in }) {
                Section { } footer: { Text("Weekly clinics, open slots for privates, or a one-off.") }
            }
        }
        .navigationTitle("New session")
    }
}

/// /offerings/[id]: upcoming sessions, edit the series, stop it.
struct OfferingScreen: View {
    let offeringId: String
    @Environment(SessionStore.self) private var session
    @Environment(Toasts.self) private var toasts
    @Environment(Navigator.self) private var navigator
    @State private var confirmStop = false
    @State private var notice: String?

    struct Data: Sendable {
        let offering: Offering
        let settings: ProviderSettings
        let courts: [Court]
        let upcoming: [SessionView]
    }

    var body: some View {
        Loaded(load: load) { data, reload in
            OfferingForm(settings: data.settings, courts: data.courts, offering: data.offering, saved: { kept in
                if let kept, kept > 0 { notice = "\(kept) booked session(s) kept their original time. Move them individually if needed." }
                Task { await reload() }
            }) {
                Section {
                    if data.upcoming.isEmpty { Text("No upcoming sessions.").font(.subheadline).foregroundStyle(.secondary) }
                    ForEach(data.upcoming) { s in NavigationLink(value: AppLink.manageSession(id: s.id)) { SessionRow(session: s, showPrice: false) } }
                } header: {
                    Text("Upcoming")
                } footer: {
                    Text(data.offering.status == "archived" ? "This series is stopped." : "Changes apply to future sessions.")
                }
            }
            .navigationTitle(data.offering.title)
            .toolbar {
                if data.offering.status == "active" {
                    ToolbarItem(placement: .topBarLeading) { Button("Stop series") { confirmStop = true } }
                }
            }
            .confirmationDialog("Stop this series? Future sessions without bookings are removed. Booked sessions stay until you cancel them.",
                                isPresented: $confirmStop, titleVisibility: .visible) {
                Button("Stop series", role: .destructive) { Task { await stop() } }
            }
        }
        .alert(notice ?? "", isPresented: Binding { notice != nil } set: { if !$0 { notice = nil } }) { Button("OK") {} }
        .navigationBarTitleDisplayMode(.inline)
    }

    private func load() async throws(APIError) -> Data {
        let offering = try await session.api.run(.offeringsGet, OfferingIdInput(offeringId: offeringId))
        let sessions = try await session.api.run(.sessionsList, SessionsListInput(days: 60))
        return Data(offering: offering, settings: try await session.api.run(.providerSettings), courts: try await session.api.run(.courtsList),
                    upcoming: Array(sessions.filter { $0.offeringId == offering.id }.prefix(8)))
    }

    private func stop() async {
        guard let result = await perform(session, toasts, { () async throws(APIError) in try await session.api.run(.offeringsArchive, OfferingIdInput(offeringId: offeringId)) }) else { return }
        if result.keptWithBookings > 0 {
            toasts.success("\(result.keptWithBookings) booked session(s) remain on your schedule. Cancel them individually to notify players.")
        }
        navigator.open(.schedule, isProvider: true)
    }
}

/// Create or edit a series (components/offering-form.tsx). Defaults come from the rate card.
struct OfferingForm<Header: View>: View {
    let settings: ProviderSettings
    let courts: [Court]
    let offering: Offering?
    let saved: (_ keptWithBookings: Int?) -> Void
    @ViewBuilder var header: () -> Header
    @Environment(SessionStore.self) private var session
    @Environment(Toasts.self) private var toasts
    @Environment(Navigator.self) private var navigator
    @State private var form = Draft()
    @State private var filled = false
    @State private var saving = false

    struct Draft {
        var kind = "group"
        var title = ""
        var description = ""
        var repeatMode = "weekly" // once, weekly, slots
        var startDate = Date()
        var startTime = Date()
        var durationMinutes = 60
        var slotsPerDay = 4
        var repeatWeekdays: Set<Int> = []
        var repeatEveryWeeks = 1
        var hasEnd = false
        var endDate = Date()
        var capacity = 8
        var paymentRule = "pay_now"
        var price = ""
        var acceptsCredits = false
        var levelSystem = ""
        var levelMin = ""
        var levelMax = ""
        var discipline = ""
        var audience = "adults"
        var visibility = "public"
        var courtId = ""
        var locationName = ""
        var locationNote = ""
    }


    private var kinds: [String] {
        ["private", "semi_private", "group", "hitting"].filter { $0 == "hitting" ? settings.offersHitting : settings.offersCoaching }
    }
    private var oneOnOne: Bool { form.kind == "private" || form.kind == "hitting" }

    var body: some View {
        Form {
            header()
            if offering == nil && kinds.count > 1 {
                Picker("What are you offering?", selection: Binding { form.kind } set: { choose($0) }) {
                    ForEach(kinds, id: \.self) { Text(Labels.shared.offeringKind($0)).tag($0) }
                }
            }
            Section { FormField("Title", text: $form.title) } header: { Text(offering == nil ? "" : "Edit series") }
            whenSection
            priceSection
            whoSection
            whereSection
            Section("Description (optional)") { TextField("", text: $form.description, axis: .vertical).lineLimit(3...8) }
            Section {
                Button(offering == nil ? (saving ? "Publishing…" : "Publish") : (saving ? "Saving…" : "Save changes"), action: submit)
                    .frame(maxWidth: .infinity).disabled(saving)
            }
        }
        .environment(\.timeZone, TimeZone(identifier: settings.timezone) ?? .current)
        .onAppear(perform: fill)
    }

    private var whenSection: some View {
        Section("When") {
            Picker("How often", selection: $form.repeatMode) {
                Text("One time").tag("once")
                Text("Every week").tag("weekly")
                if oneOnOne { Text("Open slots").tag("slots") }
            }
            if form.repeatMode == "slots" { Text("Players pick a time inside your window").font(.caption).foregroundStyle(.secondary) }
            DatePicker(form.repeatMode == "once" ? "Date" : "Starting", selection: $form.startDate, displayedComponents: .date)
            DatePicker(form.repeatMode == "slots" ? "First slot starts" : "Start time", selection: $form.startTime, displayedComponents: .hourAndMinute)
            Picker(form.repeatMode == "slots" ? "Each slot" : "Length", selection: $form.durationMinutes) {
                ForEach([30, 45, 60, 75, 90, 120, 180], id: \.self) { Text("\($0) minutes").tag($0) }
            }
            if form.repeatMode == "slots" {
                Picker("Slots per day", selection: $form.slotsPerDay) { ForEach(1...12, id: \.self) { Text("\($0)").tag($0) } }
            }
            if form.repeatMode != "once" {
                HStack(spacing: 6) {
                    ForEach(0..<7, id: \.self) { day in
                        let on = form.repeatWeekdays.contains(day)
                        Button(Labels.shared.weekdays[day]) {
                            if on { form.repeatWeekdays.remove(day) } else { form.repeatWeekdays.insert(day) }
                        }
                        .font(.caption.weight(.medium))
                        .frame(maxWidth: .infinity, minHeight: 34)
                        .foregroundStyle(on ? Color.white : Color.primary)
                        .background(on ? Color.accentColor : Color(.tertiarySystemFill), in: RoundedRectangle(cornerRadius: 8))
                        .buttonStyle(.plain)
                        .accessibilityAddTraits(on ? .isSelected : [])
                    }
                }
                Picker("Repeats", selection: $form.repeatEveryWeeks) {
                    ForEach(1...4, id: \.self) { Text($0 == 1 ? "Every week" : "Every \($0) weeks").tag($0) }
                }
                Toggle("Ends (optional)", isOn: $form.hasEnd)
                if form.hasEnd { DatePicker("Ends on", selection: $form.endDate, displayedComponents: .date) }
            }
        }
    }

    private var priceSection: some View {
        Section {
            Picker("How players pay", selection: $form.paymentRule) {
                Text("Pay when booking").tag("pay_now")
                Text("Card saved, charged after the session").tag("pay_after")
                Text("Pay me directly (cash, Venmo, Zelle)").tag("external")
                Text("Free").tag("free")
            }
            if form.paymentRule != "free" {
                LabeledContent("Price per player") {
                    TextField("$0", text: $form.price).keyboardType(.decimalPad).multilineTextAlignment(.trailing)
                }
                Toggle("Package credits can be used", isOn: $form.acceptsCredits)
            }
        } header: {
            Text("Price")
        } footer: {
            if !settings.chargesEnabled && (form.paymentRule == "pay_now" || form.paymentRule == "pay_after") {
                Text("Connect payouts in Settings to take card payments.")
            }
        }
    }

    private var whoSection: some View {
        Section {
            if !oneOnOne && form.repeatMode != "slots" {
                Stepper("Players per session: \(form.capacity)", value: $form.capacity, in: (form.kind == "semi_private" ? 2 : 1)...(form.kind == "semi_private" ? 4 : 40))
            }
            if !oneOnOne {
                Picker("Format", selection: $form.discipline) {
                    Text("Any").tag("")
                    Text("Singles").tag("singles")
                    Text("Doubles").tag("doubles")
                    Text("Women’s doubles").tag("womens_doubles")
                    Text("Men’s doubles").tag("mens_doubles")
                    Text("Mixed doubles").tag("mixed_doubles")
                }
            }
            Picker("Level guide", selection: $form.levelSystem) {
                Text("All levels").tag("")
                Text("NTRP").tag("ntrp")
                Text("UTR").tag("utr")
                Text("WTN").tag("wtn")
            }
            if !form.levelSystem.isEmpty {
                HStack(spacing: 16) {
                    FormField("From", text: $form.levelMin, keyboard: .decimalPad)
                    FormField("To", text: $form.levelMax, keyboard: .decimalPad)
                }
            }
            Picker("For", selection: $form.audience) {
                Text("Adults").tag("adults")
                Text("Juniors").tag("juniors")
                Text("Adults and juniors").tag("all")
            }
            Picker("Who can see it", selection: $form.visibility) {
                Text("Anyone with my page link").tag("public")
                Text("Only my students").tag("clients")
                Text("Only players I add").tag("invite")
            }
        } header: {
            Text("Who")
        } footer: {
            Text("Players outside the range can request to join; you approve."
                 + (settings.safetyStatus != "verified" ? " Junior sessions unlock after your safety check." : ""))
        }
    }

    private var whereSection: some View {
        Section("Where") {
            Picker("Court", selection: $form.courtId) {
                ForEach(courts) { Text($0.name).tag($0.id) }
                Text("Somewhere else").tag("")
            }
            if form.courtId.isEmpty { FormField("Location", text: $form.locationName, prompt: "Central Park courts") }
            FormField("Note for players (optional)", text: $form.locationNote, prompt: "Bring water; balls provided")
        }
    }

    private func choose(_ kind: String) {
        let defaultTitles = Set(["private", "semi_private", "group", "hitting"].map { Labels.shared.offeringKind($0) })
        form.kind = kind
        form.capacity = offeringDefaultCapacity[kind] ?? 1
        form.price = settings.rate(for: kind).map(dollars) ?? ""
        if form.title.isEmpty || defaultTitles.contains(form.title) { form.title = Labels.shared.offeringKind(kind) }
        if form.repeatMode == "slots" && !(kind == "private" || kind == "hitting") { form.repeatMode = "weekly" }
    }

    private func fill() {
        guard !filled else { return }
        filled = true
        let tz = settings.timezone
        if let o = offering {
            form.kind = o.kind; form.title = o.title; form.description = o.description ?? ""
            form.repeatMode = o.slotsPerDay > 1 ? "slots" : (o.repeatWeekdays != nil ? "weekly" : "once")
            if let start = Zoned.date(o.startDate, o.startTime, timeZone: tz) { form.startDate = start; form.startTime = start }
            form.durationMinutes = o.durationMinutes; form.slotsPerDay = o.slotsPerDay
            form.repeatWeekdays = Set(o.repeatWeekdays ?? []); form.repeatEveryWeeks = o.repeatEveryWeeks
            if let end = o.endDate.flatMap({ Zoned.date($0, "12:00", timeZone: tz) }) { form.hasEnd = true; form.endDate = end }
            form.capacity = o.capacity; form.paymentRule = o.paymentRule; form.price = dollars(o.priceCents); form.acceptsCredits = o.acceptsCredits
            form.levelSystem = o.levelSystem ?? ""; form.levelMin = o.levelMin.map(number) ?? ""; form.levelMax = o.levelMax.map(number) ?? ""
            form.discipline = o.discipline ?? ""; form.audience = o.audience; form.visibility = o.visibility
            form.courtId = o.courtId ?? ""; form.locationName = o.locationName ?? ""; form.locationNote = o.locationNote ?? ""
        } else {
            let kind = kinds.first ?? "group"
            form.kind = kind
            form.title = Labels.shared.offeringKind(kind)
            form.capacity = offeringDefaultCapacity[kind] ?? 1
            form.price = settings.rate(for: kind).map(dollars) ?? ""
            form.paymentRule = settings.chargesEnabled ? "pay_now" : "external"
            let today = Zoned.today(tz)
            if let six = Zoned.date(today, "18:00", timeZone: tz) { form.startDate = six; form.startTime = six }
            var calendar = Calendar(identifier: .gregorian)
            calendar.timeZone = TimeZone(identifier: tz) ?? .current
            form.repeatWeekdays = [calendar.component(.weekday, from: form.startDate) - 1]
            form.courtId = courts.first?.id ?? ""
        }
    }

    private func dollars(_ cents: Int) -> String { cents % 100 == 0 ? String(cents / 100) : String(format: "%.2f", Double(cents) / 100) }
    private func number(_ value: Double) -> String { value == value.rounded() ? String(Int(value)) : String(value) }
    private func cents(_ text: String) -> Int? {
        let cleaned = text.replacingOccurrences(of: "$", with: "").replacingOccurrences(of: ",", with: "").trimmingCharacters(in: .whitespaces)
        return Double(cleaned).map { Int(($0 * 100).rounded()) }
    }

    private func submit() {
        let tz = settings.timezone
        let day = Zoned.strings(form.startDate, timeZone: tz).date
        let time = Zoned.strings(form.startTime, timeZone: tz).time
        let input = OfferingInput(
            offeringId: offering?.id, kind: offering == nil ? form.kind : nil, title: form.title,
            description: form.description.isEmpty ? nil : form.description,
            discipline: form.discipline.isEmpty ? nil : form.discipline, audience: form.audience,
            capacity: form.repeatMode == "slots" ? 1 : form.capacity,
            priceCents: form.paymentRule == "free" ? 0 : (cents(form.price) ?? 0), paymentRule: form.paymentRule,
            acceptsCredits: form.paymentRule != "free" && form.acceptsCredits,
            levelSystem: form.levelSystem.isEmpty ? nil : form.levelSystem,
            levelMin: form.levelSystem.isEmpty ? nil : Double(form.levelMin), levelMax: form.levelSystem.isEmpty ? nil : Double(form.levelMax),
            visibility: form.visibility, courtId: form.courtId.isEmpty ? nil : form.courtId,
            locationName: form.courtId.isEmpty && !form.locationName.isEmpty ? form.locationName : nil,
            locationNote: form.locationNote.isEmpty ? nil : form.locationNote,
            startDate: day, startTime: time, durationMinutes: form.durationMinutes,
            slotsPerDay: form.repeatMode == "slots" ? form.slotsPerDay : 1,
            repeatWeekdays: form.repeatMode == "once" ? nil : form.repeatWeekdays.sorted(),
            repeatEveryWeeks: form.repeatEveryWeeks,
            endDate: form.repeatMode != "once" && form.hasEnd ? Zoned.strings(form.endDate, timeZone: tz).date : nil)
        saving = true
        Task {
            defer { saving = false }
            let api = session.api
            let isNew = offering == nil
            guard let result = await perform(session, toasts, { () async throws(APIError) in
                try await (isNew ? api.run(.offeringsCreate, input) : api.run(.offeringsUpdate, input))
            }) else { return }
            toasts.success(isNew ? "Published" : "Saved")
            if isNew { navigator.open(.offering(id: result.offering.id), isProvider: true) } else { saved(result.keptWithBookings) }
        }
    }
}

/// Players per session by kind (offering-form.tsx DEFAULT_CAPACITY).
private let offeringDefaultCapacity = ["private": 1, "semi_private": 2, "group": 8, "hitting": 1]

extension OfferingForm where Header == EmptyView {
    init(settings: ProviderSettings, courts: [Court], offering: Offering?, saved: @escaping (Int?) -> Void) {
        self.init(settings: settings, courts: courts, offering: offering, saved: saved) { EmptyView() }
    }
}
