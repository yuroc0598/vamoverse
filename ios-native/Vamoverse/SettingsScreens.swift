import SwiftUI
import VamoKit

/// /settings/account: name and reminders, your player profile, and deleting the account.
struct AccountScreen: View {
    let account: Account
    @Environment(SessionStore.self) private var session

    struct Data: Sendable {
        let details: AccountDetails
        let me: Player?
    }

    var body: some View {
        Loaded(load: { () async throws(APIError) in
            Data(details: try await session.api.run(.accountGet), me: try await session.api.run(.familyList).first { $0.id == account.playerId })
        }) { data, reload in
            Form {
                AccountSection(account: account, details: data.details, reload: reload)
                if let me = data.me {
                    Section {
                        PlayerProfileForm(player: me, saved: reload)
                    } header: {
                        Text("Your player profile")
                    } footer: {
                        Text("Helps coaches place you in the right group. Everything here is optional.")
                    }
                }
                DeleteAccountSection()
            }
            .refreshable { await reload() }
        }
        .navigationTitle("Profile")
    }
}

private struct AccountSection: View {
    let account: Account
    let details: AccountDetails
    let reload: @MainActor () async -> Void
    @Environment(SessionStore.self) private var session
    @Environment(Toasts.self) private var toasts
    @State private var name = ""
    @State private var email = true
    @State private var sms = false
    @State private var push = true
    @State private var filled = false
    @Environment(PushCenter.self) private var pushCenter
    @State private var saving = false

    var body: some View {
        Section {
            FormField("Name", text: $name).textContentType(.name)
            Toggle("Email", isOn: $email)
            Toggle(isOn: $sms) {
                VStack(alignment: .leading) {
                    Text("Text message")
                    if details.phone == nil { Text("Sign in with your phone number to get texts.").font(.caption).foregroundStyle(.secondary) }
                }
            }
            .disabled(details.phone == nil)
            Toggle(isOn: $push) {
                VStack(alignment: .leading) {
                    Text("Push notifications")
                    if push && pushCenter.status == .denied {
                        Text("Notifications are off for Vamoverse in iOS Settings.").font(.caption).foregroundStyle(.secondary)
                        Button("Open iOS Settings") {
                            if let url = URL(string: UIApplication.openNotificationSettingsURLString) { UIApplication.shared.open(url) }
                        }
                        .font(.caption)
                    }
                }
            }
            .onChange(of: push) { _, on in
                // Turning push on asks iOS for permission if the app hasn't asked yet.
                if on && pushCenter.status == .notDetermined { Task { await pushCenter.requestPermission() } }
            }
            .accessibilityIdentifier("account.notifyPush")
            Button(saving ? "Saving…" : "Save", action: save).disabled(saving)
        } header: {
            Text("Account")
        } footer: {
            Text((details.email ?? details.phone ?? "") + " · Reminders and updates: choose how you want to hear from Vamoverse.")
        }
        .onAppear {
            guard !filled else { return }
            filled = true
            name = details.displayName; email = details.notifyEmail; sms = details.notifySms; push = details.notifyPush
        }
    }

    private func save() {
        saving = true
        Task {
            defer { saving = false }
            if await perform(session, toasts, { () async throws(APIError) in try await session.api.run(.accountUpdate, AccountUpdateInput(displayName: name, notifyEmail: email, notifySms: sms, notifyPush: push)) }) != nil {
                toasts.success("Saved")
                await session.reload()
                await reload()
            }
        }
    }
}

/// Deleting needs "DELETE" typed, as on the web. The server refuses while sessions or bookings are open.
private struct DeleteAccountSection: View {
    @Environment(SessionStore.self) private var session
    @Environment(Toasts.self) private var toasts
    @State private var asking = false
    @State private var typed = ""

    var body: some View {
        Section {
            Button("Delete my account", role: .destructive) { typed = ""; asking = true }
                .accessibilityIdentifier("account.delete")
        } header: {
            Text("Delete account")
        } footer: {
            Text("Cancel upcoming bookings first. Payment records are kept for accounting, without your details.")
        }
        .alert("This permanently deletes your account and your juniors’ data. Type DELETE to confirm.", isPresented: $asking) {
            TextField("DELETE", text: $typed).textInputAutocapitalization(.characters).accessibilityIdentifier("account.delete.confirm")
            Button("Cancel", role: .cancel) {}
            Button("Delete", role: .destructive) { Task { await delete() } }
        }
    }

    private func delete() async {
        guard typed == "DELETE" else { return }
        if await perform(session, toasts, { () async throws(APIError) in try await session.api.run(.accountDelete, DeleteAccountInput(confirm: typed)) }) != nil {
            session.signOut()
        }
    }
}

/// /settings/business: become a provider, or edit the business, courts, and safety check.
struct BusinessScreen: View {
    let account: Account
    let welcome: Bool
    @Environment(SessionStore.self) private var session

    var body: some View {
        Group {
            if account.isProvider {
                Loaded(load: { () async throws(APIError) in (try await session.api.run(.providerSettings), try await session.api.run(.courtsList)) }) { data, reload in
                    Form {
                        if welcome {
                            Text("Welcome! Set your rates and cancellation policy once, then connect payouts to take payments.").foregroundStyle(.green)
                        }
                        Section {
                            let url = session.api.baseURL.appending(path: "p/\(data.0.slug)")
                            Link(url.absoluteString, destination: url).font(.subheadline)
                            ShareLink(item: url) { Label("Share", systemImage: "square.and.arrow.up") }
                        } header: {
                            Text("Your public page")
                        } footer: {
                            Text("Share this link anywhere: players can book and pay without downloading anything.")
                        }
                        BusinessForm(settings: data.0, reload: reload)
                        CourtsSection(courts: data.1, reload: reload)
                        SafetySection(status: data.0.safetyStatus, reload: reload)
                    }
                    .refreshable { await reload() }
                }
            } else {
                ProviderSetupForm()
            }
        }
        .navigationTitle("Coaching & hitting")
    }
}

private struct ProviderSetupForm: View {
    @Environment(SessionStore.self) private var session
    @Environment(Toasts.self) private var toasts
    @State private var coaching = true
    @State private var hitting = false
    @State private var saving = false

    var body: some View {
        Form {
            Section {
                Toggle("I coach tennis", isOn: $coaching)
                Toggle("I’m a paid hitting partner", isOn: $hitting)
                Button("Get started") {
                    saving = true
                    Task {
                        defer { saving = false }
                        if await perform(session, toasts, { () async throws(APIError) in try await session.api.run(.providerSetup, ProviderSetupInput(offersCoaching: coaching, offersHitting: hitting)) }) != nil {
                            toasts.success("You’re set up")
                            await session.reload()
                        }
                    }
                }
                .disabled(saving || (!coaching && !hitting))
            } header: {
                Text("Coach or hit with Vamoverse")
            } footer: {
                Text("Run lessons, clinics, and hitting sessions; get paid automatically.")
            }
        }
    }
}

private struct BusinessForm: View {
    let settings: ProviderSettings
    let reload: @MainActor () async -> Void
    @Environment(SessionStore.self) private var session
    @Environment(Toasts.self) private var toasts
    @State private var form: ProviderUpdateInput?
    @State private var saving = false
    @State private var rates: [String: String] = [:]

    private static let windows = [0, 12, 24, 48, 72]
    private static let percents = [0, 25, 50, 75, 100]

    var body: some View {
        if let binding = Binding($form) {
            Section {
                Toggle("I coach", isOn: binding.offersCoaching)
                Toggle("I offer paid hitting", isOn: binding.offersHitting)
                FormField("Headline", text: binding.headline, prompt: "USPTA pro · adult & junior development")
                FormField("Area", text: binding.homeArea, prompt: "Fremont & San Jose")
                FormField("Profile link", text: binding.slug, hint: "vamoverse.app/p/your-link").textInputAutocapitalization(.never).autocorrectionDisabled()
                Picker("Time zone", selection: binding.timezone) {
                    ForEach(Labels.shared.timeZones, id: \.value) { Text($0.label).tag($0.value) }
                }
                FormField("About you", text: binding.bio, multiline: true)
            } header: {
                Text("Business settings")
            } footer: {
                Text("Rates fill in automatically when you create sessions. Policies are shown to players before they book.")
            }
            Section("Rates (per player, per session)") {
                if binding.wrappedValue.offersCoaching {
                    rate("Private lesson", "private")
                    rate("Semi-private", "semi_private")
                    rate("Group clinic", "group")
                }
                if binding.wrappedValue.offersHitting { rate("Hitting session", "hitting") }
            }
            Section {
                Picker("Free cancellation until", selection: binding.cancelWindowHours) {
                    ForEach(Self.windows, id: \.self) { Text($0 == 0 ? "Any time before start" : "\($0) hours before").tag($0) }
                }
                Picker("Late cancellation", selection: binding.lateCancelFeePct) {
                    ForEach(Self.percents, id: \.self) { Text($0 == 0 ? "No fee" : "\($0)% of the price").tag($0) }
                }
                Picker("No-show", selection: binding.noShowFeePct) {
                    ForEach(Self.percents, id: \.self) { Text($0 == 0 ? "No fee" : "\($0)% of the price").tag($0) }
                }
                Toggle("Show me in Find (players searching for coaches and hitters)", isOn: binding.listed)
                Button(saving ? "Saving…" : "Save settings", action: save).disabled(saving)
            } header: {
                Text("Cancellation policy")
            } footer: {
                Text("Late cancels use a package credit, or charge the card on file. You can waive any fee with one tap.")
            }
        } else {
            Section { ProgressView() }.onAppear(perform: fill)
        }
    }

    private func rate(_ label: String, _ kind: String) -> some View {
        LabeledContent(label) {
            TextField("$", text: Binding { rates[kind] ?? "" } set: { rates[kind] = $0 }).keyboardType(.decimalPad).multilineTextAlignment(.trailing)
        }
    }

    private func fill() {
        form = ProviderUpdateInput(settings)
        for kind in ["private", "semi_private", "group", "hitting"] {
            rates[kind] = settings.rate(for: kind).map { $0 % 100 == 0 ? String($0 / 100) : String(format: "%.2f", Double($0) / 100) } ?? ""
        }
    }

    private func cents(_ kind: String) -> Int? {
        let text = (rates[kind] ?? "").replacingOccurrences(of: "$", with: "").trimmingCharacters(in: .whitespaces)
        return Double(text).map { Int(($0 * 100).rounded()) }
    }

    private func save() {
        guard var input = form else { return }
        input.ratePrivateCents = cents("private"); input.rateSemiPrivateCents = cents("semi_private")
        input.rateGroupCents = cents("group"); input.rateHittingCents = cents("hitting")
        saving = true
        Task {
            defer { saving = false }
            if await perform(session, toasts, { () async throws(APIError) in try await session.api.run(.providerUpdate, input) }) != nil {
                toasts.success("Saved")
                await reload()
            }
        }
    }
}

private struct CourtsSection: View {
    let courts: [Court]
    let reload: @MainActor () async -> Void
    @Environment(SessionStore.self) private var session
    @Environment(Toasts.self) private var toasts
    @State private var name = ""
    @State private var address = ""
    @State private var notes = ""
    @State private var bookingUrl = ""
    @State private var bookingNote = ""
    @State private var saving = false

    var body: some View {
        Section {
            ForEach(courts) { court in
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(court.name).fontWeight(.medium)
                        if let address = court.address { Text(address).font(.subheadline).foregroundStyle(.secondary) }
                        if let note = court.bookingNote { Text("Booking: \(note)").font(.caption).foregroundStyle(.secondary) }
                    }
                    Spacer()
                    Button("Remove") { Task { await remove(court) } }.buttonStyle(.borderless).font(.subheadline)
                }
            }
            FormField("Court name", text: $name, prompt: "Mitchell Park, courts 1–4")
            FormField("Address", text: $address)
            FormField("Notes for players", text: $notes, prompt: "Park in the back lot")
            FormField("Court booking link (optional)", text: $bookingUrl, prompt: "https://", keyboard: .URL).textInputAutocapitalization(.never)
            FormField("When booking opens (optional)", text: $bookingNote, prompt: "7 days ahead at 8am")
            Button("Add court", action: add).disabled(saving || name.trimmingCharacters(in: .whitespaces).isEmpty)
        } header: {
            Text("Your courts")
        } footer: {
            Text("Save the courts you use so sessions, reminders, and directions are one tap.")
        }
    }

    private func add() {
        saving = true
        Task {
            defer { saving = false }
            let input = CourtInput(name: name, address: address, notes: notes, bookingUrl: bookingUrl, bookingNote: bookingNote)
            if await perform(session, toasts, { () async throws(APIError) in try await session.api.run(.courtsSave, input) }) != nil {
                toasts.success("Court saved")
                name = ""; address = ""; notes = ""; bookingUrl = ""; bookingNote = ""
                await reload()
            }
        }
    }

    private func remove(_ court: Court) async {
        if await perform(session, toasts, { () async throws(APIError) in try await session.api.run(.courtsDelete, CourtIdInput(courtId: court.id)) }) != nil {
            await reload()
        }
    }
}

private struct SafetySection: View {
    let status: String
    let reload: @MainActor () async -> Void
    @Environment(SessionStore.self) private var session
    @Environment(Toasts.self) private var toasts
    @State private var method = "usta_safe_play"
    @State private var reference = ""
    @State private var saving = false

    var body: some View {
        Section {
            switch status {
            case "verified": Text("Approved. You can offer sessions for juniors.").foregroundStyle(.green)
            case "pending": Text("Submitted. We’ll notify you once it’s reviewed, usually within a business day.")
            default:
                if status == "rejected" { Text("We couldn’t verify the last submission. Check the details and try again.").foregroundStyle(.red) }
                Picker("Proof", selection: $method) {
                    Text("USTA Safe Play (current)").tag("usta_safe_play")
                    Text("Background check + SafeSport training").tag("background_check")
                }
                FormField(method == "usta_safe_play" ? "USTA member number" : "Screening provider and reference", text: $reference)
                Button("Submit for review", action: submit).disabled(saving || reference.isEmpty)
            }
        } header: {
            Text("Safety check for junior sessions")
        } footer: {
            Text("Required before you can offer sessions for players under 18. Parents see a verified badge on your page.")
        }
    }

    private func submit() {
        saving = true
        Task {
            defer { saving = false }
            if await perform(session, toasts, { () async throws(APIError) in try await session.api.run(.safetySubmit, SafetyInput(method: method, reference: reference)) }) != nil {
                toasts.success("Submitted for review")
                await reload()
            }
        }
    }
}

/// /settings/payments: card on file (read-only) and receipts.
struct PaymentsScreen: View {
    @Environment(SessionStore.self) private var session

    var body: some View {
        Loaded(load: { () async throws(APIError) in try await session.api.run(.paymentsMine) }) { data, reload in
            List {
                Section {
                    Text(data.card.map { "\($0.brand ?? "Card") •••• \($0.last4)" } ?? "No card saved yet. You’ll add one the first time you book a pay-after session.")
                        .font(.subheadline)
                } header: {
                    Text("Card on file")
                } footer: {
                    Text("Used for sessions charged after they happen and for any fees, per each coach’s policy.")
                }
                Section("Receipts") { PaymentRows(payments: data.payments, timeZone: defaultTimeZone) { $0.providerName ?? "" } }
            }
            .refreshable { await reload() }
        }
        .navigationTitle("Payments")
    }
}

/// /settings/payouts: Stripe Connect (hosted), the plan (read-only in the app), and packages.
struct PayoutsScreen: View {
    let returned: Bool
    @Environment(SessionStore.self) private var session
    @Environment(Toasts.self) private var toasts
    @State private var onboarding: HostedPage?
    @State private var connecting = false

    struct Data: Sendable {
        let settings: ProviderSettings
        let plan: PlanInfo
        let packages: [OwnPackage]
    }

    var body: some View {
        Loaded(load: load) { data, reload in
            Form {
                Section {
                    let s = data.settings
                    StatusBadge(text: s.chargesEnabled ? (s.payoutsEnabled ? "Taking payments · payouts on" : "Taking payments · finish bank details")
                                : s.stripeAccountId != nil ? "Setup not finished" : "Not connected",
                                variant: s.chargesEnabled ? "success" : "warning")
                    Button(s.chargesEnabled && s.payoutsEnabled ? "Update bank details" : "Connect payouts") { Task { await connect() } }
                        .disabled(connecting)
                } header: {
                    Text("Payouts")
                } footer: {
                    Text("Card payments go straight to your bank through Stripe. Processing fees are deducted by Stripe.")
                }
                Section {
                    ForEach([("free", data.plan.plans.free), ("pro", data.plan.plans.pro)], id: \.0) { id, plan in
                        VStack(alignment: .leading, spacing: 4) {
                            HStack {
                                Text(plan.label).fontWeight(.semibold)
                                if data.plan.current == id { StatusBadge(text: "Current", variant: "success") }
                            }
                            Text(plan.summary).font(.subheadline).foregroundStyle(.secondary)
                        }
                    }
                } header: {
                    // Read-only: no purchase or link-out in the app until the [USER] decision (Apple may require In-App Purchase).
                    Text("Plan")
                }
                PackagesSection(packages: data.packages, canSell: data.settings.chargesEnabled, reload: reload)
            }
            .refreshable { await reload() }
            .hostedPage($onboarding) { Task { _ = try? await session.api.run(.payoutsRefresh); await reload() } }
        }
        .navigationTitle("Payouts & plan")
    }

    private func load() async throws(APIError) -> Data {
        // Returning from Stripe (or a payouts link): ask Stripe for the latest status first.
        if returned { _ = try? await session.api.run(.payoutsRefresh) }
        return Data(settings: try await session.api.run(.providerSettings), plan: try await session.api.run(.planGet), packages: try await session.api.run(.packagesList))
    }

    private func connect() async {
        connecting = true
        defer { connecting = false }
        if let link = await perform(session, toasts, { () async throws(APIError) in try await session.api.run(.payoutsConnect) }) {
            onboarding = HostedPage(url: link.url)
        }
    }
}

private struct PackagesSection: View {
    let packages: [OwnPackage]
    let canSell: Bool
    let reload: @MainActor () async -> Void
    @Environment(SessionStore.self) private var session
    @Environment(Toasts.self) private var toasts
    @State private var name = ""
    @State private var credits = 10
    @State private var price = ""
    @State private var validDays: Int? = 180
    @State private var kinds: Set<String> = ["private"]
    @State private var saving = false

    var body: some View {
        Section {
            ForEach(packages) { p in
                HStack {
                    Text("\(p.name) · \(p.credits) credits · \(VamoFormat.money(p.priceCents))\(p.validDays.map { " · \($0) days" } ?? "") · \(p.kinds.map { Labels.shared.offeringKind($0) }.joined(separator: ", "))")
                        .font(.subheadline).strikethrough(!p.active).foregroundStyle(p.active ? .primary : .secondary)
                    Spacer()
                    Button(p.active ? "Stop selling" : "Sell again") { Task { await toggle(p) } }.buttonStyle(.borderless).font(.subheadline)
                }
            }
            if !canSell { Text("Connect payouts to sell packages.").font(.subheadline).foregroundStyle(.secondary) }
            FormField("Name", text: $name, prompt: "10 private lessons")
            Stepper("Credits: \(credits)", value: $credits, in: 1...100)
            LabeledContent("Price") { TextField("$", text: $price).keyboardType(.decimalPad).multilineTextAlignment(.trailing) }
            Picker("Expires", selection: $validDays) {
                Text("After 3 months").tag(Optional(90))
                Text("After 6 months").tag(Optional(180))
                Text("After 1 year").tag(Optional(365))
                Text("Never").tag(Int?.none)
            }
            ForEach(["private", "semi_private", "group", "hitting"], id: \.self) { kind in
                Toggle(Labels.shared.offeringKind(kind), isOn: Binding { kinds.contains(kind) } set: { if $0 { kinds.insert(kind) } else { kinds.remove(kind) } })
            }
            Button("Add package", action: add).disabled(!canSell || saving || kinds.isEmpty || name.isEmpty)
        } header: {
            Text("Packages")
        } footer: {
            Text("Sell prepaid credits (e.g. 10 privates). Credits apply automatically when students book, and late cancels use up the credit.")
        }
    }

    private func toggle(_ p: OwnPackage) async {
        let input = PackageInput(id: p.id, name: p.name, credits: p.credits, priceCents: p.priceCents, validDays: p.validDays, kinds: p.kinds, active: !p.active)
        if await perform(session, toasts, { () async throws(APIError) in try await session.api.run(.packagesSave, input) }) != nil {
            toasts.success("Package saved")
            await reload()
        }
    }

    private func add() {
        let cents = Double(price.replacingOccurrences(of: "$", with: "").trimmingCharacters(in: .whitespaces)).map { Int(($0 * 100).rounded()) } ?? 0
        let input = PackageInput(name: name, credits: credits, priceCents: cents, validDays: validDays, kinds: ["private", "semi_private", "group", "hitting"].filter(kinds.contains))
        saving = true
        Task {
            defer { saving = false }
            if await perform(session, toasts, { () async throws(APIError) in try await session.api.run(.packagesSave, input) }) != nil {
                toasts.success("Package saved")
                name = ""; credits = 10; price = ""; validDays = 180; kinds = ["private"]
                await reload()
            }
        }
    }
}
