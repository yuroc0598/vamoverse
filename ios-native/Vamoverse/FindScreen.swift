import SwiftUI
import VamoKit

/// /find: coaches and hitting partners, plus open clinics.
struct FindScreen: View {
    @Environment(SessionStore.self) private var session
    @Environment(Toasts.self) private var toasts
    @State private var type = "any"
    @State private var area = ""
    @State private var query = ""
    @State private var providers: [ProviderCard]?
    @State private var sessions: [SessionView] = []

    private static let types = [("any", "All"), ("hitting", "Hitting partners"), ("coaching", "Coaches")]

    var body: some View {
        List {
            Section {
                TextField("City or courts (e.g. Fremont)", text: $area).textContentType(.addressCity).submitLabel(.search).onSubmit(search)
                TextField("Name or keyword", text: $query).submitLabel(.search).onSubmit(search)
                Button("Search", action: search)
                Picker("Type", selection: $type) { ForEach(Self.types, id: \.0) { Text($0.1).tag($0.0) } }
                    .pickerStyle(.segmented)
                    .listRowBackground(Color.clear)
                    .listRowInsets(EdgeInsets())
            }
            if let providers {
                Section {
                    if providers.isEmpty {
                        ContentUnavailableView("No one matches yet", systemImage: "magnifyingglass", description: Text("Try a nearby city or clear the filters."))
                    }
                    ForEach(providers) { provider in
                        NavigationLink(value: AppLink.provider(slug: provider.slug)) { ProviderCardRow(provider: provider, type: type) }
                    }
                }
                if !sessions.isEmpty {
                    Section("Open clinics this week and next") {
                        ForEach(sessions) { s in NavigationLink(value: AppLink.session(id: s.id)) { SessionRow(session: s) } }
                    }
                }
            } else {
                ProgressView().frame(maxWidth: .infinity)
            }
        }
        .navigationTitle("Find someone to play with")
        .navigationBarTitleDisplayMode(.inline)
        .task(id: type) { await load() }
        .refreshable { await load() }
    }

    private func search() { Task { await load() } }

    private func load() async {
        let input = FindInput(type: type, area: area.isEmpty ? nil : area, query: query.isEmpty ? nil : query)
        let found = await perform(session, toasts) { () async throws(APIError) -> ([ProviderCard], [SessionView]) in
            let providers = try await session.api.run(.findProviders, input)
            let sessions = type == "hitting" ? [] : try await session.api.run(.findSessions, input)
            return (providers, sessions)
        }
        if let found { (providers, sessions) = found }
    }
}

private struct ProviderCardRow: View {
    let provider: ProviderCard
    let type: String

    var body: some View {
        AdaptiveStack {
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 4) {
                    Text(provider.name).font(.headline)
                    if provider.safetyVerified {
                        Image(systemName: "checkmark.shield.fill").foregroundStyle(.green).accessibilityLabel("Safety check completed")
                    }
                }
                Text(roles).font(.subheadline).foregroundStyle(.secondary)
                if let headline = provider.headline { Text(headline).font(.subheadline) }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            VStack(alignment: .trailing, spacing: 3) {
                if let rate { Text("\(VamoFormat.money(rate))/hr").font(.subheadline.weight(.medium)) }
                Text(provider.nextOpening.map { "Next opening \(VamoFormat.dateTime($0, timeZone: defaultTimeZone))" } ?? "No openings soon")
                    .font(.caption).foregroundStyle(.secondary).multilineTextAlignment(.trailing)
            }
        }
        .padding(.vertical, 4)
    }

    private var rate: Int? { type == "hitting" ? provider.rateHittingCents : provider.ratePrivateCents ?? provider.rateHittingCents }

    private var roles: String {
        var line = [provider.offersCoaching ? "Coach" : nil, provider.offersHitting ? "Hitting partner" : nil].compactMap { $0 }.joined(separator: " · ")
        if let area = provider.homeArea { line += " · \(area)" }
        if provider.offersHitting, let level = provider.ownUtr.map({ "UTR \(rating($0))" }) ?? provider.ownNtrp.map({ "NTRP \(rating($0))" }) {
            line += " · plays \(level)"
        }
        return line
    }

    private func rating(_ value: Double) -> String { value == value.rounded() ? String(Int(value)) : String(value) }
}
