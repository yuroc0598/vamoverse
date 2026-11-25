import SwiftUI
import VamoKit

/// The player's /today: bookings (theirs and their juniors'), package credits, and coaches.
struct HomeScreen: View {
    let account: Account
    @Environment(SessionStore.self) private var session
    @Environment(Navigator.self) private var navigator

    struct Data: Sendable {
        let bookings: [MyBooking]
        let credits: [PackagePurchase]
        let coaches: [MyCoach]
    }

    var body: some View {
        Loaded(load: load) { data, reload in
            List {
                Section("Your bookings") {
                    if data.bookings.isEmpty {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Nothing booked yet").font(.headline)
                            Text("Find a coach, clinic, or hitting partner.").foregroundStyle(.secondary)
                            Button("Find sessions") { navigator.open(.find, isProvider: account.isProvider) }.buttonStyle(.borderedProminent)
                        }
                        .padding(.vertical, 6)
                    }
                    ForEach(data.bookings) { item in
                        NavigationLink(value: AppLink.booking(id: item.booking.id, token: nil)) {
                            SessionRow(session: item.session) {
                                StatusBadge(text: badge(item.booking), variant: item.booking.status == "confirmed" ? "success" : "warning")
                            }
                        }
                        .accessibilityIdentifier("home.booking")
                    }
                }
                let usable = data.credits.filter(\.isUsable)
                if !usable.isEmpty {
                    Section("Package credits") {
                        ForEach(usable) { credit in
                            Text("\(credit.creditsLeft) left · \(credit.name) with \(credit.providerName)"
                                 + (credit.expiresAt.map { " · until \(VamoFormat.date($0, timeZone: defaultTimeZone))" } ?? ""))
                                .font(.subheadline)
                        }
                    }
                }
                if !data.coaches.isEmpty {
                    Section("Your coaches") {
                        ForEach(data.coaches) { coach in
                            NavigationLink(value: AppLink.provider(slug: coach.slug)) {
                                Text(coach.name).fontWeight(.medium) + Text(coach.headline.map { " · \($0)" } ?? "").foregroundStyle(.secondary)
                            }
                        }
                    }
                }
            }
            .refreshable { await reload() }
        }
        .navigationTitle("Hi, \(account.firstName)")
    }

    /// "Leo Kim · Booked" for juniors, "Booked" for yourself (as on the web).
    private func badge(_ booking: Booking) -> String {
        (booking.playerName == account.displayName ? "" : "\(booking.playerName) · ") + Labels.shared.bookingStatus(booking.status)
    }

    private func load() async throws(APIError) -> Data {
        async let bookings = session.api.run(.bookingsMine, BookingsMineInput())
        async let credits = session.api.run(.creditsMine)
        async let coaches = session.api.run(.coachesMine)
        do { return try await Data(bookings: bookings, credits: credits, coaches: coaches) } catch let error as APIError { throw error } catch { throw APIError(code: "internal", message: "Something went wrong.", status: 0) }
    }
}

/// The web shows player-wide times (credits, notifications, messages) in this zone.
let defaultTimeZone = "America/Los_Angeles"
