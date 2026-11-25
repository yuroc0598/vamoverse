import SwiftUI
import VamoKit

/// /sessions/[id]: a provider's session: details, roster actions, add a student, move or edit,
/// cancel, and rain out the day (sessions/[id]/page.tsx, session-manage.tsx).
struct ManageSessionScreen: View {
    let sessionId: String
    @Environment(SessionStore.self) private var session

    struct Data: Sendable {
        let session: SessionView
        let roster: [RosterEntry]
        let clients: [Client]
    }

    var body: some View {
        Loaded(load: { () async throws(APIError) in
            Data(session: try await session.api.run(.sessionsGet, SessionIdInput(sessionId: sessionId)),
                 roster: try await session.api.run(.sessionsRoster, SessionIdInput(sessionId: sessionId)),
                 clients: try await session.api.run(.clientsList, ClientsListInput()))
        }) { data, reload in
            ManageSessionContent(data: data, reload: reload)
        }
        .navigationBarTitleDisplayMode(.inline)
    }
}

private struct ManageSessionContent: View {
    let data: ManageSessionScreen.Data
    let reload: @MainActor () async -> Void
    @Environment(SessionStore.self) private var store
    @Environment(Toasts.self) private var toasts
    @Environment(Navigator.self) private var navigator
    @State private var alert: String?

    private var s: SessionView { data.session }
    private var scheduled: Bool { s.status == "scheduled" }

    var body: some View {
        Form {
            Section {
                VStack(alignment: .leading, spacing: 6) {
                    Text(s.title).font(.title2.bold())
                    NavigationLink(value: AppLink.offering(id: s.offeringId)) { Text("Edit the whole series").font(.subheadline) }
                }
                HStack {
                    Button { Task { await messagePlayers() } } label: { Label("Message players", systemImage: "message") }
                    Spacer()
                    ShareLink(item: store.api.baseURL.appending(path: "s/\(s.id)")) { Image(systemName: "square.and.arrow.up") }.accessibilityLabel("Share")
                }
                .buttonStyle(.borderless)
            }
            Section("Details") { SessionDetails(session: s) }
            Section {
                RosterList(entries: data.roster, started: s.started ?? false, reload: reload)
                if scheduled {
                    let booked = Set(data.roster.filter { !["cancelled", "late_cancelled", "declined"].contains($0.status) }.compactMap(\.playerId))
                    AddStudent(sessionId: s.id, clients: data.clients.filter { !booked.contains($0.playerId) }, reload: reload) { alert = $0 }
                }
            } header: {
                Text("Players (\(s.seatsTaken)/\(s.capacity))")
            } footer: {
                if s.waitlistCount > 0 || (s.requestedCount ?? 0) > 0 { Text("\(s.waitlistCount) waiting · \(s.requestedCount ?? 0) asking to join") }
            }
            if scheduled {
                EditSessionSection(session: s, reload: reload) { alert = $0 }
                CancelSessionSection(session: s, reload: reload) { alert = $0 }
            }
        }
        .alert(alert ?? "", isPresented: Binding { alert != nil } set: { if !$0 { alert = nil } }) { Button("OK") {} }
    }

    private func messagePlayers() async {
        if let started = await perform(store, toasts, { () async throws(APIError) in try await store.api.run(.messagesStart, StartThreadInput(offeringId: s.offeringId)) }) {
            navigator.open(.conversation(id: started.threadId), isProvider: true)
        }
    }
}

/// Each booking with the actions its status allows (session-manage.tsx Roster).
private struct RosterList: View {
    let entries: [RosterEntry]
    let started: Bool
    let reload: @MainActor () async -> Void
    @Environment(SessionStore.self) private var store
    @Environment(Toasts.self) private var toasts
    @Environment(Navigator.self) private var navigator
    @Environment(\.openURL) private var openURL
    @State private var removing: RosterEntry?

    var body: some View {
        if entries.isEmpty {
            Text("No one yet. Share the session link or add a student below.").font(.subheadline).foregroundStyle(.secondary)
        }
        ForEach(entries) { e in
            VStack(alignment: .leading, spacing: 8) {
                Text(e.playerName).fontWeight(.medium) + Text(e.junior ? " · junior (parent: \(e.contactName ?? ""))" : "").foregroundStyle(.secondary)
                HStack(spacing: 8) {
                    let status = Labels.shared.rosterStatus(e.status)
                    StatusBadge(text: status.label, variant: status.variant)
                    let payment = Labels.shared.rosterPayment(e.paymentStatus)
                    if !payment.isEmpty { Text(payment + (e.owes ? " \(VamoFormat.money(e.priceCents))" : "")).font(.caption).foregroundStyle(.secondary) }
                }
                HStack(spacing: 14) {
                    if let phone = e.contactPhone { Button("Text") { open("sms:\(phone)") } }
                    if let email = e.contactEmail { Button("Email") { open("mailto:\(email)") } }
                    if let playerId = e.playerId { Button("Message") { Task { await message(playerId) } } }
                }
                .font(.caption).buttonStyle(.borderless)
                actions(e)
            }
            .padding(.vertical, 4)
            .accessibilityIdentifier("roster.\(e.playerName)")
        }
        .confirmationDialog(removing.map { "Remove \($0.playerName)? They’ll be notified and refunded in full." } ?? "",
                            isPresented: Binding { removing != nil } set: { if !$0 { removing = nil } }, titleVisibility: .visible) {
            Button("Remove", role: .destructive) {
                if let e = removing {
                    Task { await act(.bookingsCancelByCoach(e.bookingId), success: "Removed and refunded") }
                }
            }
        }
    }

    @ViewBuilder
    private func actions(_ e: RosterEntry) -> some View {
        HStack(spacing: 8) {
            if e.status == "requested" {
                Button("Approve") { Task { await act(.approve(e.bookingId)) } }.buttonStyle(.borderedProminent)
                Button("Decline") { Task { await act(.decline(e.bookingId)) } }
            }
            if started && ["confirmed", "no_show", "attended"].contains(e.status) {
                if e.status != "attended" { Button("Attended") { Task { await act(.attendance(e.bookingId, "attended")) } } }
                if e.status != "no_show" { Button("No-show") { Task { await act(.attendance(e.bookingId, "no_show")) } } }
            }
            if e.owes && e.paymentRule == "external" { Button("Mark paid") { Task { await act(.markPaid(e.bookingId), success: "Marked paid") } } }
            if e.owes && e.status != "confirmed" { Button("Waive") { Task { await act(.waive(e.bookingId), success: "Fee waived") } } }
            if !started && ["confirmed", "held", "invited", "offered", "waitlisted"].contains(e.status) {
                Button("Remove", role: .destructive) { removing = e }
            }
        }
        .buttonStyle(.bordered)
        .controlSize(.small)
    }

    private enum Action {
        case approve(String), decline(String), attendance(String, String), markPaid(String), waive(String), bookingsCancelByCoach(String)
    }

    private func act(_ action: Action, success: String? = nil) async {
        let api = store.api
        let done = await perform(store, toasts) { () async throws(APIError) -> Bool in
            switch action {
            case .approve(let id): _ = try await api.run(.bookingsApprove, BookingInput(bookingId: id))
            case .decline(let id): _ = try await api.run(.bookingsDecline, BookingInput(bookingId: id))
            case .attendance(let id, let outcome): _ = try await api.run(.bookingsAttendance, AttendanceInput(bookingId: id, outcome: outcome))
            case .markPaid(let id): _ = try await api.run(.bookingsMarkPaid, BookingInput(bookingId: id))
            case .waive(let id): _ = try await api.run(.bookingsWaiveFee, BookingInput(bookingId: id))
            case .bookingsCancelByCoach(let id): _ = try await api.run(.bookingsCancel, BookingInput(bookingId: id))
            }
            return true
        }
        if done != nil {
            if let success { toasts.success(success) }
            await reload()
        }
    }

    private func message(_ playerId: String) async {
        if let started = await perform(store, toasts, { () async throws(APIError) in try await store.api.run(.messagesStart, StartThreadInput(playerId: playerId)) }) {
            navigator.open(.conversation(id: started.threadId), isProvider: true)
        }
    }

    private func open(_ link: String) {
        if let url = URL(string: link) { openURL(url) }
    }
}

private struct AddStudent: View {
    let sessionId: String
    let clients: [Client]
    let reload: @MainActor () async -> Void
    let alert: (String) -> Void
    @Environment(SessionStore.self) private var store
    @Environment(Toasts.self) private var toasts
    @State private var playerId = ""
    @State private var allFuture = false
    @State private var adding = false

    var body: some View {
        if clients.isEmpty {
            Text("Add students in Crew to book them here.").font(.subheadline).foregroundStyle(.secondary)
        } else {
            Picker("Add a student", selection: $playerId) {
                ForEach(clients) { Text($0.playerName).tag($0.playerId) }
            }
            .accessibilityIdentifier("manage.addPlayer.picker")
            .onAppear { if playerId.isEmpty || !clients.contains(where: { $0.playerId == playerId }) { playerId = clients[0].playerId } }
            Toggle("Every week", isOn: $allFuture).accessibilityIdentifier("manage.addPlayer.weekly")
            Button("Add", action: add).disabled(adding || playerId.isEmpty).accessibilityIdentifier("manage.addPlayer.add")
        }
    }

    private func add() {
        adding = true
        Task {
            defer { adding = false }
            let input = AddPlayerInput(sessionId: sessionId, playerId: playerId, allFuture: allFuture)
            guard let result = await perform(store, toasts, { () async throws(APIError) in try await store.api.run(.bookingsAddPlayer, input) }) else { return }
            let skipped = result.results.filter { $0.status == "skipped" }.count
            alert("Added to \(result.added) session\(result.added == 1 ? "" : "s").\(skipped > 0 ? " \(skipped) skipped (full or not eligible)." : "")")
            await reload()
        }
    }
}

/// Move or edit this one session; the server refuses overlaps and notifies booked players.
private struct EditSessionSection: View {
    let session: SessionView
    let reload: @MainActor () async -> Void
    let alert: (String) -> Void
    @Environment(SessionStore.self) private var store
    @Environment(Toasts.self) private var toasts
    @State private var start = Date()
    @State private var duration = 60
    @State private var capacity = 1
    @State private var note = ""
    @State private var courtStatus = "unknown"
    @State private var confirmation = ""
    @State private var saving = false
    @State private var filled = false

    var body: some View {
        Section {
            DatePicker("Date", selection: $start, displayedComponents: .date)
            DatePicker("Time", selection: $start, displayedComponents: .hourAndMinute).accessibilityIdentifier("manage.time")
            Stepper("Minutes: \(duration)", value: $duration, in: 15...480, step: 15)
            Stepper("Spots: \(capacity)", value: $capacity, in: 1...40)
            Picker("Court", selection: $courtStatus) {
                Text("Not set").tag("unknown")
                Text("Needs booking").tag("needs_booking")
                Text("Booked").tag("booked")
                Text("First-come courts").tag("walk_up")
            }
            if courtStatus == "booked" { FormField("Confirmation #", text: $confirmation) }
            if let url = session.courtBookingUrl.flatMap(URL.init(string:)), courtStatus != "booked" {
                Link(destination: url) { Label("Book the court", systemImage: "arrow.up.right.square") }
            }
            FormField("Note for players", text: $note, prompt: "Bring water; we’re on court 4 today")
            Button(saving ? "Saving…" : "Save", action: save).disabled(saving).accessibilityIdentifier("manage.save")
        } header: {
            Text("Change this session")
        } footer: {
            Text("Booked players are notified automatically if the time changes." + (session.courtBookingNote.map { " Court booking opens: \($0)" } ?? ""))
        }
        .environment(\.timeZone, TimeZone(identifier: session.timezone) ?? .current)
        .onAppear(perform: fill)
    }

    private func fill() {
        guard !filled else { return }
        filled = true
        start = session.startsAt
        duration = Int(session.endsAt.timeIntervalSince(session.startsAt) / 60)
        capacity = session.capacity
        note = session.note ?? ""
        courtStatus = session.courtStatus ?? "unknown"
        confirmation = session.courtConfirmation ?? ""
    }

    private func save() {
        saving = true
        Task {
            defer { saving = false }
            let local = Zoned.strings(start, timeZone: session.timezone)
            let input = UpdateSessionInput(sessionId: session.id, date: local.date, startTime: local.time, durationMinutes: duration, capacity: capacity,
                                           note: note.isEmpty ? nil : note, courtStatus: courtStatus, courtConfirmation: confirmation.isEmpty ? nil : confirmation)
            guard let result = await perform(store, toasts, { () async throws(APIError) in try await store.api.run(.sessionsUpdate, input) }) else { return }
            if let notified = result.notified, notified > 0 { alert("\(notified) player\(notified == 1 ? "" : "s") notified of the new time.") }
            await reload()
        }
    }
}

private struct CancelSessionSection: View {
    let session: SessionView
    let reload: @MainActor () async -> Void
    let alert: (String) -> Void
    @Environment(SessionStore.self) private var store
    @Environment(Toasts.self) private var toasts
    @Environment(Navigator.self) private var navigator
    @State private var reason = "Rain"
    @State private var confirm: Confirm?
    @State private var busy = false

    enum Confirm { case one, day }

    private var day: String { Zoned.strings(session.startsAt, timeZone: session.timezone).date }

    var body: some View {
        Section {
            FormField("Reason (shared with players)", text: $reason)
            Button("Cancel this session", role: .destructive) { confirm = .one }.disabled(busy)
            Button("Rain out the whole day") { confirm = .day }.disabled(busy)
        } header: {
            Text("Cancel")
        } footer: {
            Text("Everyone booked is told right away and refunded in full or gets their credit back.")
        }
        .confirmationDialog(confirm == .day ? "Cancel ALL your sessions on \(day)?" : "Cancel this session and notify everyone?",
                            isPresented: Binding { confirm != nil } set: { if !$0 { confirm = nil } }, titleVisibility: .visible) {
            Button(confirm == .day ? "Rain out the whole day" : "Cancel this session", role: .destructive) {
                let which = confirm
                Task { await cancel(which) }
            }
        }
    }

    private func cancel(_ which: Confirm?) async {
        busy = true
        defer { busy = false }
        let reasonText = reason.isEmpty ? nil : reason
        if which == .day {
            guard let result = await perform(store, toasts, { () async throws(APIError) in try await store.api.run(.sessionsCancelDay, CancelDayInput(date: day, reason: reasonText)) }) else { return }
            alert("Cancelled \(result.cancelled) sessions. \(result.notified) players notified.")
            navigator.open(.schedule, isProvider: true)
        } else {
            guard let result = await perform(store, toasts, { () async throws(APIError) in try await store.api.run(.sessionsCancel, CancelSessionInput(sessionId: session.id, reason: reasonText)) }) else { return }
            alert("Cancelled. \(result.notified) notified.")
            await reload()
        }
    }
}

/// Wall-clock date and time in a session's time zone (what the server's inputs expect).
enum Zoned {
    static func strings(_ date: Date, timeZone: String) -> (date: String, time: String) {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: timeZone) ?? .current
        let c = calendar.dateComponents([.year, .month, .day, .hour, .minute], from: date)
        return (String(format: "%04d-%02d-%02d", c.year!, c.month!, c.day!), String(format: "%02d:%02d", c.hour!, c.minute!))
    }

    static func date(_ day: String, _ time: String, timeZone: String) -> Date? {
        let d = day.split(separator: "-").compactMap { Int($0) }
        let t = time.split(separator: ":").compactMap { Int($0) }
        guard d.count == 3, t.count == 2 else { return nil }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: timeZone) ?? .current
        return calendar.date(from: DateComponents(year: d[0], month: d[1], day: d[2], hour: t[0], minute: t[1]))
    }

    /// Today's date in a time zone ("YYYY-MM-DD").
    static func today(_ timeZone: String) -> String { strings(.now, timeZone: timeZone).date }
}
