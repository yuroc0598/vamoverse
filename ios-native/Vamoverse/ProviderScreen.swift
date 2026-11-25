import SwiftUI
import VamoKit

/// /p/[slug]: a coach's or hitter's page with packages and open sessions.
struct ProviderScreen: View {
    let slug: String
    let account: Account
    @Environment(SessionStore.self) private var session
    @Environment(Toasts.self) private var toasts
    @Environment(Navigator.self) private var navigator
    @State private var checkout: HostedPage?
    @State private var confirmLeave = false
    @State private var busy = false

    struct Data: Sendable {
        let schedule: PublicSchedule
        let packages: [CreditPackage]
        let joined: Bool
    }

    var body: some View {
        Loaded(load: load) { data, reload in
            let provider = data.schedule.provider
            let isSelf = account.providerId == provider.id
            List {
                Section { header(provider, joined: data.joined || isSelf, isSelf: isSelf, reload: reload) }
                if !data.packages.isEmpty && provider.acceptsPayments {
                    Section("Packages") { ForEach(data.packages) { packageRow($0) } }
                }
                Section("Book a session") {
                    if data.schedule.sessions.isEmpty {
                        ContentUnavailableView("No open sessions right now", systemImage: "calendar", description: Text("Check back soon, or message the coach after signing in."))
                    }
                }
                ForEach(VamoFormat.groupByDay(data.schedule.sessions), id: \.day) { group in
                    Section(group.day) {
                        ForEach(group.sessions) { s in NavigationLink(value: AppLink.session(id: s.id)) { SessionRow(session: s) } }
                    }
                }
            }
            .refreshable { await reload() }
            .confirmationDialog("Leave this crew? You won’t get their messages or invites.", isPresented: $confirmLeave, titleVisibility: .visible) {
                Button("Leave crew", role: .destructive) { Task { await leave(provider.id, reload: reload) } }
            }
            .hostedPage($checkout) { Task { await reload() } }
            .navigationTitle(provider.displayName)
        }
        .navigationBarTitleDisplayMode(.inline)
    }

    @ViewBuilder
    private func header(_ provider: PublicSchedule.Provider, joined: Bool, isSelf: Bool, reload: @escaping @MainActor () async -> Void) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(provider.displayName).font(.title2.bold())
            Text(([provider.offersCoaching ? "Tennis coach" : nil, provider.offersHitting ? "Hitting partner" : nil].compactMap { $0 }.joined(separator: " · "))
                 + (provider.homeArea.map { " · \($0)" } ?? ""))
                .font(.subheadline).foregroundStyle(.secondary)
            if let headline = provider.headline { Text(headline) }
            if provider.safetyVerified {
                Label("Safety check completed", systemImage: "checkmark.shield").font(.subheadline).foregroundStyle(.green)
            }
            if let bio = provider.bio { Text(bio).font(.subheadline) }
            HStack {
                if let rate = provider.ratePrivateCents { chip("Private \(VamoFormat.money(rate))") }
                if let rate = provider.rateHittingCents { chip("Hitting \(VamoFormat.money(rate))") }
            }
            Text(VamoFormat.policyLabel(windowHours: provider.cancelWindowHours, lateFeePct: provider.lateCancelFeePct, noShowPct: provider.noShowFeePct))
                .font(.caption).foregroundStyle(.secondary)
            HStack(spacing: 10) {
                ShareLink(item: session.api.baseURL.appending(path: "p/\(provider.slug)")) { Image(systemName: "square.and.arrow.up") }
                    .accessibilityLabel("Share")
                if !isSelf {
                    if joined {
                        Button("Leave crew") { confirmLeave = true }.disabled(busy)
                        Button { Task { await message(provider.id) } } label: { Label("Message", systemImage: "message") }.disabled(busy)
                    } else {
                        Button("Join crew") { Task { await join(reload: reload) } }.buttonStyle(.borderedProminent).disabled(busy)
                    }
                }
            }
            .buttonStyle(.bordered)
            .controlSize(.small)
        }
        .padding(.vertical, 4)
    }

    private func chip(_ text: String) -> some View {
        Text(text).font(.subheadline).padding(.horizontal, 10).padding(.vertical, 4).background(Color(.tertiarySystemFill), in: RoundedRectangle(cornerRadius: 8))
    }

    private func packageRow(_ package: CreditPackage) -> some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(package.name).fontWeight(.medium)
                Text("\(package.credits) credits · \(VamoFormat.money(Int((Double(package.priceCents) / Double(package.credits)).rounded()))) each"
                     + (package.validDays.map { " · use within \($0) days" } ?? ""))
                    .font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
            Button("Buy \(VamoFormat.money(package.priceCents))") {
                Task {
                    busy = true
                    defer { busy = false }
                    if let link = await perform(session, toasts, { () async throws(APIError) in try await session.api.run(.packagesBuy, PackageIdInput(packageId: package.id)) }) {
                        checkout = HostedPage(url: link.checkoutUrl)
                    }
                }
            }
            .buttonStyle(.borderedProminent).controlSize(.small).disabled(busy)
        }
    }

    private func join(reload: @escaping @MainActor () async -> Void) async {
        busy = true
        defer { busy = false }
        if await perform(session, toasts, { () async throws(APIError) in try await session.api.run(.clientsJoin, SlugInput(slug: slug)) }) != nil {
            toasts.success("You’re in the crew")
            await reload()
        }
    }

    private func leave(_ providerId: String, reload: @escaping @MainActor () async -> Void) async {
        busy = true
        defer { busy = false }
        if await perform(session, toasts, { () async throws(APIError) in try await session.api.run(.clientsLeave, ProviderIdInput(providerId: providerId)) }) != nil {
            toasts.success("You left the crew")
            await reload()
        }
    }

    private func message(_ providerId: String) async {
        busy = true
        defer { busy = false }
        if let started = await perform(session, toasts, { () async throws(APIError) in try await session.api.run(.messagesStart, StartThreadInput(providerId: providerId)) }) {
            navigator.open(.conversation(id: started.threadId), isProvider: account.isProvider)
        }
    }

    private func load() async throws(APIError) -> Data {
        let schedule = try await session.api.run(.schedulePublic, SlugInput(slug: slug))
        let packages = try await session.api.run(.packagesPublic, SlugInput(slug: slug))
        let coaches = try await session.api.run(.coachesMine)
        return Data(schedule: schedule, packages: packages, joined: coaches.contains { $0.providerId == schedule.provider.id })
    }
}
