import SwiftUI
import VamoKit

/// /s/[id]: a session's details and the book panel (s/[id]/page.tsx, book-panel.tsx).
struct SessionScreen: View {
    let sessionId: String
    @Environment(SessionStore.self) private var session

    var body: some View {
        Loaded(load: { () async throws(APIError) in try await session.api.run(.sessionsView, SessionIdInput(sessionId: sessionId)) }) { page, reload in
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    Card {
                        HStack(alignment: .top) {
                            VStack(alignment: .leading, spacing: 4) {
                                NavigationLink(value: AppLink.provider(slug: page.session.providerSlug)) { Text(page.session.providerName).font(.subheadline) }
                                Text(page.session.title).font(.title2.bold())
                            }
                            Spacer()
                            ShareLink(item: session.api.baseURL.appending(path: "s/\(page.session.id)")) { Image(systemName: "square.and.arrow.up") }
                                .accessibilityLabel("Share")
                        }
                        if page.session.isCancelled {
                            StatusBadge(text: "Cancelled" + (page.session.cancelReason.map { ": \($0)" } ?? ""), variant: "error")
                        }
                        SessionDetails(session: page.session)
                    }
                    if page.isOwner {
                        NavigationLink(value: AppLink.manageSession(id: page.session.id)) { linkCard("Manage this session") }
                    } else if let active = page.activeBooking {
                        NavigationLink(value: AppLink.booking(id: active.id, token: nil)) {
                            linkCard("You have a booking here (\(active.status)). View or change it →")
                        }
                        .accessibilityIdentifier("session.existingBooking")
                    } else if page.bookable {
                        BookPanel(page: page, reload: reload)
                    } else {
                        Text("This session is no longer open for booking.").font(.subheadline).foregroundStyle(.secondary).frame(maxWidth: .infinity)
                    }
                }
                .padding()
            }
            .background(Color(.systemGroupedBackground))
            .refreshable { await reload() }
        }
        .navigationBarTitleDisplayMode(.inline)
    }

    private func linkCard(_ text: String) -> some View {
        Card { Text(text).fontWeight(.medium).frame(maxWidth: .infinity) }
    }
}

/// Book for yourself or a junior; pays through Stripe Checkout when needed, then opens the booking.
private struct BookPanel: View {
    let page: SessionPage
    let reload: @MainActor () async -> Void
    @Environment(SessionStore.self) private var session
    @Environment(Toasts.self) private var toasts
    @Environment(Navigator.self) private var navigator
    @State private var playerId: String = ""
    @State private var useCredit = true
    @State private var pending = false
    @State private var checkout: HostedPage?
    @State private var afterCheckout: AppLink?

    private var full: Bool { page.session.isFull }

    /// The web's button label (book-panel.tsx).
    private var label: String {
        if full { return "Join the waitlist" }
        if page.session.paymentRule == "pay_now" && !(page.credits > 0 && useCredit) { return "Book and pay" }
        if page.session.paymentRule == "pay_after" { return "Book (pay after)" }
        return "Book"
    }

    var body: some View {
        Card {
            Text(full ? "This session is full" : "Book your spot").font(.headline)
            if full {
                Text("Join the waitlist. If a spot opens we’ll text and email you right away; nothing is charged until then.")
                    .font(.subheadline).foregroundStyle(.secondary)
            }
            if page.family.count > 1 {
                Picker("Who’s playing?", selection: $playerId) {
                    ForEach(page.family) { player in Text(player.isJunior ? "\(player.displayName) (junior)" : "\(player.displayName) (me)").tag(player.id) }
                }
                .accessibilityIdentifier("book.player")
            }
            if page.credits > 0 {
                Toggle("Use a package credit (\(page.credits) left)", isOn: $useCredit)
            }
            Button(action: book) {
                Text(pending ? "Booking…" : label).frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .disabled(pending)
            .accessibilityIdentifier("book.submit")
        }
        .onAppear { if playerId.isEmpty { playerId = page.family.first?.id ?? "" } }
        .hostedPage($checkout) {
            // Whatever happened in checkout, show the booking as the server has it now.
            if let link = afterCheckout { navigator.open(link, isProvider: session.account?.isProvider ?? false) }
            afterCheckout = nil
            Task { await reload() }
        }
    }

    private func book() {
        pending = true
        Task {
            defer { pending = false }
            let input = CreateBookingInput(sessionId: page.session.id, playerId: playerId.isEmpty ? nil : playerId, useCredit: useCredit)
            guard let result = await perform(session, toasts, { () async throws(APIError) in try await session.api.run(.bookingsCreate, input) }) else { return }
            let link = AppLink.parse(result.manageUrl)
            if let url = result.checkoutUrl {
                afterCheckout = link
                checkout = HostedPage(url: url)
            } else {
                navigator.open(link, isProvider: session.account?.isProvider ?? false)
                await reload()
            }
        }
    }
}
