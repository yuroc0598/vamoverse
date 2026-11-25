import SwiftUI
import VamoKit

/// /b/[id]: one booking: the server's headline, the session, payment and refund lines, and the
/// actions for its status (b/[id]/page.tsx, booking-actions.tsx).
struct BookingScreen: View {
    let bookingId: String
    let token: String?
    @Environment(SessionStore.self) private var session

    var body: some View {
        Loaded(load: { () async throws(APIError) in try await session.api.run(.bookingsGet, BookingInput(bookingId: bookingId, token: token)) }) { detail, reload in
            BookingContent(detail: detail, token: token, reload: reload)
        }
        .navigationBarTitleDisplayMode(.inline)
    }
}

private struct BookingContent: View {
    let detail: BookingDetail
    let token: String?
    let reload: @MainActor () async -> Void
    @Environment(SessionStore.self) private var session
    @Environment(PushCenter.self) private var push
    @Environment(Toasts.self) private var toasts
    @State private var busy = false
    @State private var checkout: HostedPage?
    @State private var checkingPayment = false
    @State private var confirmCancel = false
    @State private var addingToCalendar = false

    private var booking: Booking { detail.booking }
    private var status: String { booking.status }
    private var needsPayment: Bool { ["held", "offered", "invited"].contains(status) }
    private var canCancel: Bool { detail.cancelTerms != nil && detail.access != "provider" }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                if checkingPayment {
                    // The app can't tell a completed checkout from a closed one (the web knows from ?paid=1),
                    // so it checks with the server instead of claiming the payment went through.
                    Text("Checking your payment…")
                        .font(.subheadline).padding(12).frame(maxWidth: .infinity, alignment: .leading)
                        .background(Color.blue.opacity(0.1), in: RoundedRectangle(cornerRadius: 12))
                }
                headline
                if detail.headline.tone == "good" && session.account != nil && push.status == .notDetermined {
                    Card { PushPrompt(message: "Get a reminder before the session and a heads-up if anything changes.") }
                }
                Card {
                    NavigationLink(value: AppLink.provider(slug: detail.session.providerSlug)) { Text(detail.session.providerName).font(.subheadline) }
                    Text(detail.session.title).font(.title3.bold())
                    SessionDetails(session: detail.session, showSeats: false)
                    if booking.paymentStatus == "paid" {
                        Text("Paid \(VamoFormat.money(booking.priceCents))" + (detail.refundedCents > 0 ? "; \(VamoFormat.money(detail.refundedCents)) refunded" : "") + ".")
                            .font(.subheadline).foregroundStyle(.secondary)
                            .accessibilityIdentifier("booking.payment")
                    }
                    if booking.paymentStatus == "credit" {
                        Text("Paid with a package credit.").font(.subheadline).foregroundStyle(.secondary)
                    }
                }
                actions
            }
            .padding()
        }
        .background(Color(.systemGroupedBackground))
        .refreshable { await reload() }
        .hostedPage($checkout) {
            Task { await refetchAfterCheckout() }
        }
        .alert("Cancel this booking?", isPresented: $confirmCancel) {
            Button("Keep booking", role: .cancel) {}
            Button(cancelLabel, role: .destructive) { Task { await cancel() } }
        } message: {
            Text(detail.cancelTerms?.summary ?? "")
        }
        .sheet(isPresented: $addingToCalendar) {
            CalendarSheet(title: "\(detail.session.title) · \(detail.session.providerName)", start: detail.session.startsAt, end: detail.session.endsAt,
                          location: [detail.session.locationName, detail.session.locationAddress].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: ", "),
                          url: session.api.baseURL.appending(path: "b/\(booking.id)")) { addingToCalendar = false }
                .ignoresSafeArea()
        }
    }

    private var headline: some View {
        let (icon, color): (String, Color) = switch detail.headline.tone {
        case "good": ("checkmark.circle.fill", .green)
        case "wait": ("clock.fill", .orange)
        default: ("xmark.circle.fill", .gray)
        }
        return HStack(alignment: .top, spacing: 12) {
            Image(systemName: icon).font(.title2).foregroundStyle(color).accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 4) {
                Text(detail.headline.title).font(.title3.bold())
                Text("\(detail.playerName) · \(detail.session.title)" + (detail.headline.body.map { " · \($0)" } ?? "")).font(.subheadline)
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(color.opacity(0.12), in: RoundedRectangle(cornerRadius: 16))
        .accessibilityElement(children: .combine)
        // On the combined element (VoiceOver reads title and details together), so tests see one
        // element whose label starts with the title.
        .accessibilityIdentifier("booking.headline")
    }

    @ViewBuilder
    private var actions: some View {
        VStack(spacing: 10) {
            if status == "invited" {
                Button { Task { await accept(allInSeries: false) } } label: { Text("Confirm").frame(maxWidth: .infinity) }
                    .buttonStyle(.borderedProminent)
                Button { Task { await accept(allInSeries: true) } } label: { Text("Confirm every week").frame(maxWidth: .infinity) }
                    .buttonStyle(.bordered)
            }
            if needsPayment && status != "invited" {
                Button { Task { await pay() } } label: { Text(booking.paymentRule == "pay_now" ? "Pay to confirm" : "Save a card to confirm").frame(maxWidth: .infinity) }
                    .buttonStyle(.borderedProminent)
                    .accessibilityIdentifier("booking.pay")
            }
            if status == "invited" {
                Button { Task { await decline() } } label: { Text("Can’t make it").frame(maxWidth: .infinity) }.buttonStyle(.bordered)
            }
            if status == "confirmed" || needsPayment {
                Button { addingToCalendar = true } label: { Label("Add to calendar", systemImage: "calendar.badge.plus").frame(maxWidth: .infinity) }
                    .buttonStyle(.bordered)
            }
            if canCancel && status != "invited" {
                Card {
                    Text(status == "waitlisted" || status == "requested" ? "Leave anytime, free." : "Cancel: \(detail.cancelTerms?.summary ?? "")")
                        .font(.subheadline).foregroundStyle(.secondary)
                    Button(role: .destructive) { confirmCancel = true } label: { Text(cancelLabel).frame(maxWidth: .infinity) }
                        .buttonStyle(.bordered)
                        .accessibilityIdentifier("booking.cancel")
                }
            }
        }
        .controlSize(.large)
        .disabled(busy)
    }

    private var cancelLabel: String {
        status == "waitlisted" ? "Leave the waitlist" : status == "requested" ? "Withdraw request" : "Cancel booking"
    }

    private func run<T>(_ action: @MainActor () async throws(APIError) -> T) async -> T? {
        busy = true
        defer { busy = false }
        return await perform(session, toasts, action)
    }

    private func pay() async {
        if let link = await run({ () async throws(APIError) in try await session.api.run(.bookingsCheckout, BookingInput(bookingId: booking.id, token: token)) }) {
            checkout = HostedPage(url: link.checkoutUrl)
        }
    }

    private func accept(allInSeries: Bool) async {
        guard let result = await run({ () async throws(APIError) in
            try await session.api.run(.bookingsAcceptInvite, AcceptInviteInput(bookingId: booking.id, token: token, allInSeries: allInSeries))
        }) else { return }
        if let url = result.checkoutUrl { checkout = HostedPage(url: url) } else { await reload() }
    }

    private func decline() async {
        if await run({ () async throws(APIError) in try await session.api.run(.bookingsDeclineInvite, BookingInput(bookingId: booking.id, token: token)) }) != nil {
            toasts.success("Declined")
            await reload()
        }
    }

    private func cancel() async {
        if await run({ () async throws(APIError) in try await session.api.run(.bookingsCancel, BookingInput(bookingId: booking.id, token: token)) }) != nil {
            toasts.success("Cancelled")
            await reload()
        }
    }

    /// Payment is confirmed by the processor's webhook, which can land a moment after the page closes.
    private func refetchAfterCheckout() async {
        checkingPayment = true
        defer { checkingPayment = false }
        await reload()
        for _ in 0..<3 {
            let fresh = try? await session.api.run(.bookingsGet, BookingInput(bookingId: booking.id, token: token))
            if let fresh, fresh.headline.tone != "wait" { break }
            try? await Task.sleep(for: .seconds(2))
        }
        await reload()
    }
}
