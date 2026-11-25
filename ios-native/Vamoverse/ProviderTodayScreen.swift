import SwiftUI
import VamoKit

/// The provider's /today: what needs them, then the next two days (today/page.tsx ProviderToday),
/// plus their own bookings as a player when they have any.
struct ProviderTodayScreen: View {
    let account: Account
    @Environment(SessionStore.self) private var session

    struct Data: Sendable {
        let week: [SessionView]
        let money: MoneySummary
        let settings: ProviderSettings
        let ownBookings: [MyBooking]
        let ownCredits: [PackagePurchase]
    }

    struct Todo: Identifiable {
        let text: String
        let link: AppLink
        var id: String { text }
    }

    var body: some View {
        Loaded(load: load) { data, reload in
            let soon = data.week.filter { $0.status == "scheduled" }.prefix(30)
            let first = soon.first?.startsAt ?? .distantPast
            let nextTwoDays = soon.filter { $0.startsAt < first.addingTimeInterval(2 * 86_400) }
            List {
                let todos = todos(Array(soon), data)
                if !todos.isEmpty {
                    Section("Needs you") {
                        ForEach(todos) { todo in
                            NavigationLink(value: todo.link) { Text("\(todo.text) →").font(.subheadline) }
                                .listRowBackground(Color.yellow.opacity(0.12))
                        }
                    }
                }
                Section {
                    if nextTwoDays.isEmpty {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Nothing scheduled this week").font(.headline)
                            Text("Set up a weekly clinic or open slots and share your page.").foregroundStyle(.secondary)
                            NavigationLink(value: AppLink.newOffering) { Text("Create a session") }.buttonStyle(.borderedProminent)
                        }
                        .padding(.vertical, 6)
                    }
                } header: {
                    HStack {
                        Text("Coming up")
                        Spacer()
                        NavigationLink(value: AppLink.newOffering) { Text("+ New session") }.textCase(nil).font(.subheadline)
                    }
                }
                ForEach(VamoFormat.groupByDay(Array(nextTwoDays)), id: \.day) { group in
                    Section(group.day) {
                        ForEach(group.sessions) { s in NavigationLink(value: AppLink.manageSession(id: s.id)) { SessionRow(session: s, showPrice: false) } }
                    }
                }
                if !data.ownBookings.isEmpty {
                    Section("Your own bookings") {
                        ForEach(data.ownBookings) { item in
                            NavigationLink(value: AppLink.booking(id: item.booking.id, token: nil)) {
                                SessionRow(session: item.session) {
                                    StatusBadge(text: Labels.shared.bookingStatus(item.booking.status), variant: item.booking.status == "confirmed" ? "success" : "warning")
                                }
                            }
                        }
                    }
                }
                if !data.ownCredits.isEmpty {
                    Section("Package credits") {
                        ForEach(data.ownCredits) { credit in
                            Text("\(credit.creditsLeft) left · \(credit.name) with \(credit.providerName)"
                                 + (credit.expiresAt.map { " · until \(VamoFormat.date($0, timeZone: defaultTimeZone))" } ?? ""))
                                .font(.subheadline)
                        }
                    }
                }
            }
            .refreshable { await reload() }
        }
        .navigationTitle("Hi, \(account.firstName)")
    }

    private func todos(_ soon: [SessionView], _ data: Data) -> [Todo] {
        var list: [Todo] = []
        if !data.settings.chargesEnabled { list.append(Todo(text: "Connect payouts to take card payments and packages", link: .payouts(returned: false))) }
        for s in soon where (s.requestedCount ?? 0) > 0 {
            list.append(Todo(text: "\(s.requestedCount ?? 0) asking to join \(s.title) (\(VamoFormat.dateTime(s.startsAt, timeZone: s.timezone)))", link: .manageSession(id: s.id)))
        }
        for s in soon where s.courtStatus == "needs_booking" {
            list.append(Todo(text: "Book a court for \(s.title) (\(VamoFormat.dateTime(s.startsAt, timeZone: s.timezone)))", link: .manageSession(id: s.id)))
        }
        if data.money.owedCents > 0 { list.append(Todo(text: "\(VamoFormat.money(data.money.owedCents)) owed to you", link: .money)) }
        return list
    }

    private func load() async throws(APIError) -> Data {
        Data(week: try await session.api.run(.sessionsList, SessionsListInput(days: 7)),
             money: try await session.api.run(.moneySummary, MoneyInput()),
             settings: try await session.api.run(.providerSettings),
             ownBookings: try await session.api.run(.bookingsMine, BookingsMineInput()),
             ownCredits: try await session.api.run(.creditsMine).filter(\.isUsable))
    }
}

/// /schedule: two weeks at a time, plus the provider's series.
struct ScheduleScreen: View {
    @Environment(SessionStore.self) private var session
    @State private var week = 0

    struct Data: Sendable {
        let sessions: [SessionView]
        let offerings: [Offering]
    }

    var body: some View {
        Loaded(load: { () async throws(APIError) in
            Data(sessions: try await session.api.run(.sessionsList, SessionsListInput(days: 14, offsetDays: week * 14)),
                 offerings: try await session.api.run(.offeringsList))
        }) { data, reload in
            List {
                Section { } footer: { Text("Your next two weeks of lessons, clinics, and hitting sessions.") }
                if data.sessions.isEmpty {
                    Section {
                        VStack(alignment: .leading, spacing: 8) {
                            Text(week > 0 ? "Nothing scheduled these two weeks" : "No sessions yet").font(.headline)
                            Text("Create a weekly clinic, open slots for privates, or a one-off session.").foregroundStyle(.secondary)
                            NavigationLink(value: AppLink.newOffering) { Text("Create your first session") }.buttonStyle(.borderedProminent)
                        }
                        .padding(.vertical, 6)
                    }
                }
                ForEach(VamoFormat.groupByDay(data.sessions), id: \.day) { group in
                    Section(group.day) {
                        ForEach(group.sessions) { s in NavigationLink(value: AppLink.manageSession(id: s.id)) { SessionRow(session: s, showPrice: false) } }
                    }
                }
                Section {
                    HStack {
                        if week > 0 { Button("← Earlier") { week -= 1 } }
                        Spacer()
                        if week < 8 { Button("Later →") { week += 1 } }
                    }
                    .buttonStyle(.borderless)
                }
                if !data.offerings.isEmpty {
                    Section("Your series") {
                        ForEach(data.offerings) { o in NavigationLink(value: AppLink.offering(id: o.id)) { Text(o.title) } }
                    }
                }
            }
            .refreshable { await reload() }
        }
        .id(week) // a new window reloads
        .navigationTitle("Schedule")
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                NavigationLink(value: AppLink.newOffering) { Label("New", systemImage: "plus") }
            }
        }
    }
}
