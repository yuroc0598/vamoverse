import EventKit
import EventKitUI
import SafariServices
import SwiftUI
import VamoKit

// Building blocks shared by the screens: loading, badges, session rows and details, and the
// sheets for hosted pages (Stripe Checkout, Connect) and Add to Calendar.

/// Loads `T`, shows it, and reloads on pull-to-refresh, `reload()`, and return to the app.
/// Errors show the server's message with "Try again"; a 401 signs out.
struct Loaded<T: Sendable, Content: View>: View {
    let load: @MainActor () async throws(APIError) -> T
    @ViewBuilder let content: (T, _ reload: @escaping @MainActor () async -> Void) -> Content
    @State private var value: T?
    @State private var error: APIError?
    @Environment(SessionStore.self) private var session
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        Group {
            if let value {
                content(value, reload)
            } else if let error {
                ContentUnavailableView {
                    Label(error.code == "network" ? "Can’t reach Vamoverse" : "Something went wrong", systemImage: "exclamationmark.triangle")
                } description: {
                    Text(error.message)
                } actions: {
                    Button("Try again") { Task { await reload() } }.buttonStyle(.borderedProminent)
                }
            } else {
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .task { await reload() }
        .onChange(of: scenePhase) { _, phase in if phase == .active, value != nil { Task { await reload() } } }
    }

    @MainActor
    private func reload() async {
        do {
            value = try await load()
            error = nil
        } catch {
            session.handle(error)
            if value == nil { self.error = error }
        }
    }
}

extension View {
    /// Runs a server action: shows its error as a toast (verbatim) and signs out on 401.
    @MainActor
    func perform<T>(_ session: SessionStore, _ toasts: Toasts, _ action: @MainActor () async throws(APIError) -> T) async -> T? {
        do { return try await action() } catch {
            session.handle(error)
            toasts.error(error)
            return nil
        }
    }
}

/// The web's Badge (success / warning / muted / error).
struct StatusBadge: View {
    let text: String
    var variant: String = "muted"

    var body: some View {
        Text(text)
            .font(.caption.weight(.medium))
            .fixedSize(horizontal: false, vertical: true)
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .foregroundStyle(foreground)
            .background(background, in: Capsule())
    }

    private var foreground: Color {
        switch variant {
        case "success": .green
        case "warning": .orange
        case "error": .red
        default: .secondary
        }
    }

    private var background: Color { foreground.opacity(0.14) }
}

/// One session in a list (components/session-row.tsx).
struct SessionRow<Aside: View>: View {
    let session: SessionView
    var showPrice = true
    @ViewBuilder var aside: () -> Aside

    var body: some View {
        AdaptiveStack {
            VStack(alignment: .leading, spacing: 3) {
                Text(VamoFormat.sessionRange(start: session.startsAt, end: session.endsAt, timeZone: session.timezone))
                    .font(.subheadline).foregroundStyle(.secondary)
                Text(session.title).font(.headline).strikethrough(session.isCancelled)
                Text(details).font(.caption).foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            if session.isCancelled { StatusBadge(text: "Cancelled", variant: "error") } else { aside() }
        }
        .padding(.vertical, 4)
        .accessibilityElement(children: .combine)
    }

    private var details: String {
        [Labels.shared.offeringKind(session.kind),
         VamoFormat.levelLabel(system: session.levelSystem, min: session.levelMin, max: session.levelMax),
         session.locationName,
         showPrice ? VamoFormat.priceLabel(cents: session.priceCents, rule: session.paymentRule) : nil]
            .compactMap { $0 }.joined(separator: " · ")
    }
}

extension SessionRow where Aside == StatusBadge {
    /// The default aside: seats left.
    init(session: SessionView, showPrice: Bool = true) {
        self.init(session: session, showPrice: showPrice) {
            StatusBadge(text: VamoFormat.seatsLabel(taken: session.seatsTaken, capacity: session.capacity, waitlist: session.waitlistCount),
                        variant: session.isFull ? "muted" : "success")
        }
    }
}

/// Everything a player needs to know about a session (components/session-details.tsx).
struct SessionDetails: View {
    let session: SessionView
    var showSeats = true

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            row("calendar") { Text(VamoFormat.sessionRange(start: session.startsAt, end: session.endsAt, timeZone: session.timezone)) }
            if let place = session.locationName {
                row("mappin.and.ellipse") {
                    VStack(alignment: .leading, spacing: 2) {
                        Link(place, destination: mapsURL(place)).underline()
                        if let address = session.locationAddress, !address.isEmpty { Text(address).foregroundStyle(.secondary) }
                        if let note = session.locationNote, !note.isEmpty { Text(note).foregroundStyle(.secondary) }
                        if session.courtStatus == "booked" {
                            Text("Court booked" + (session.courtConfirmation.map { " · #\($0)" } ?? "")).foregroundStyle(.green)
                        }
                        if session.courtStatus == "walk_up" { Text("First-come courts: arrive a few minutes early.").foregroundStyle(.secondary) }
                    }
                }
            }
            row("dollarsign.circle") {
                VStack(alignment: .leading, spacing: 2) {
                    Text(VamoFormat.priceLabel(cents: session.priceCents, rule: session.paymentRule))
                    if session.paymentRule != "free" {
                        Text(Labels.shared.paymentRule(session.paymentRule) + (session.acceptsCredits ? " · package credits accepted" : ""))
                            .foregroundStyle(.secondary)
                    }
                }
            }
            row("person.2") {
                VStack(alignment: .leading, spacing: 2) {
                    Text(kindLine)
                    if showSeats {
                        Text(VamoFormat.seatsLabel(taken: session.seatsTaken, capacity: session.capacity, waitlist: session.waitlistCount)).foregroundStyle(.secondary)
                    }
                }
            }
            if let note = session.note, !note.isEmpty {
                Text(note).padding(10).frame(maxWidth: .infinity, alignment: .leading).background(Color.yellow.opacity(0.15), in: RoundedRectangle(cornerRadius: 8))
            }
            if let description = session.description, !description.isEmpty { Text(description).foregroundStyle(.secondary) }
            if session.paymentRule != "free" {
                Text(VamoFormat.policyLabel(windowHours: session.cancelWindowHours, lateFeePct: session.lateCancelFeePct, noShowPct: session.noShowFeePct))
                    .font(.caption).foregroundStyle(.secondary)
            }
        }
        .font(.subheadline)
    }

    private var kindLine: String {
        var line = Labels.shared.offeringKind(session.kind)
        if let level = VamoFormat.levelLabel(system: session.levelSystem, min: session.levelMin, max: session.levelMax) { line += " · \(level)" }
        if session.audience != "adults" { line += session.audience == "juniors" ? " · Juniors" : " · Adults and juniors" }
        return line
    }

    private func mapsURL(_ place: String) -> URL {
        let query = [place, session.locationAddress].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: ", ")
        var components = URLComponents(string: "https://maps.apple.com/")!
        components.queryItems = [URLQueryItem(name: "q", value: query)]
        return components.url!
    }

    private func row(_ icon: String, @ViewBuilder content: () -> some View) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            Image(systemName: icon).frame(width: 18).foregroundStyle(.secondary).accessibilityHidden(true)
            content()
        }
    }
}

// MARK: Hosted pages

/// A page on the server the app opens in Safari (Stripe Checkout, the dev payment simulator,
/// Connect onboarding). The app never assumes the outcome: it refetches when the sheet closes.
struct HostedPage: Identifiable, Equatable {
    let id = UUID()
    let url: URL
}

struct SafariSheet: UIViewControllerRepresentable {
    let url: URL
    let onFinish: () -> Void

    func makeUIViewController(context: Context) -> SFSafariViewController {
        let controller = SFSafariViewController(url: url)
        controller.preferredControlTintColor = UIColor(named: "AccentColor")
        controller.dismissButtonStyle = .done
        controller.delegate = context.coordinator
        return controller
    }

    func updateUIViewController(_ controller: SFSafariViewController, context: Context) {}
    func makeCoordinator() -> Coordinator { Coordinator(onFinish: onFinish) }

    final class Coordinator: NSObject, SFSafariViewControllerDelegate {
        let onFinish: () -> Void
        init(onFinish: @escaping () -> Void) { self.onFinish = onFinish }
        func safariViewControllerDidFinish(_ controller: SFSafariViewController) { onFinish() }
    }
}

extension View {
    /// Presents `page` in Safari full screen; `onClose` runs after it's dismissed (refetch there).
    func hostedPage(_ page: Binding<HostedPage?>, onClose: @escaping () -> Void) -> some View {
        fullScreenCover(item: page, onDismiss: onClose) { hosted in
            SafariSheet(url: hosted.url) { page.wrappedValue = nil }.ignoresSafeArea()
        }
    }
}

// MARK: Add to calendar

/// Apple's event editor, prefilled. Adding through it needs no calendar permission (iOS 17+).
struct CalendarSheet: UIViewControllerRepresentable {
    let title: String
    let start: Date
    let end: Date
    let location: String?
    let url: URL
    let onFinish: () -> Void

    func makeUIViewController(context: Context) -> EKEventEditViewController {
        let store = EKEventStore()
        let event = EKEvent(eventStore: store)
        event.title = title
        event.startDate = start
        event.endDate = end
        event.location = location
        event.url = url
        let controller = EKEventEditViewController()
        controller.eventStore = store
        controller.event = event
        controller.editViewDelegate = context.coordinator
        return controller
    }

    func updateUIViewController(_ controller: EKEventEditViewController, context: Context) {}
    func makeCoordinator() -> Coordinator { Coordinator(onFinish: onFinish) }

    final class Coordinator: NSObject, EKEventEditViewDelegate {
        let onFinish: () -> Void
        init(onFinish: @escaping () -> Void) { self.onFinish = onFinish }
        func eventEditViewController(_ controller: EKEventEditViewController, didCompleteWith action: EKEventEditViewAction) { onFinish() }
    }
}

/// A rounded card section like the web's bordered panels.
struct Card<Content: View>: View {
    @ViewBuilder let content: () -> Content

    var body: some View {
        VStack(alignment: .leading, spacing: 12, content: content)
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 16))
    }
}

/// A form text field with its label above, like the web's TextField (iOS forms otherwise show only
/// the placeholder, which hides what a filled-in field is).
struct FormField: View {
    let label: String
    @Binding var text: String
    var prompt: String = ""
    var multiline = false
    var keyboard: UIKeyboardType = .default
    var hint: String?

    init(_ label: String, text: Binding<String>, prompt: String = "", multiline: Bool = false, keyboard: UIKeyboardType = .default, hint: String? = nil) {
        self.label = label
        self._text = text
        self.prompt = prompt
        self.multiline = multiline
        self.keyboard = keyboard
        self.hint = hint
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label).font(.subheadline).foregroundStyle(.secondary)
            Group {
                if multiline { TextField(prompt, text: $text, axis: .vertical).lineLimit(3...8) } else { TextField(prompt, text: $text) }
            }
            .keyboardType(keyboard)
            .accessibilityLabel(label)
            if let hint { Text(hint).font(.caption).foregroundStyle(.secondary) }
        }
    }
}

/// Side by side normally; stacked at accessibility text sizes, so text and badges never squeeze
/// into one-word columns.
struct AdaptiveStack<Content: View>: View {
    var spacing: CGFloat = 12
    @ViewBuilder let content: () -> Content
    @Environment(\.dynamicTypeSize) private var typeSize

    var body: some View {
        let layout = typeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: spacing / 2))
            : AnyLayout(HStackLayout(alignment: .top, spacing: spacing))
        layout(content)
    }
}
