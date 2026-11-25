import SwiftUI
import VamoKit

/// /money: the last 30 days: totals, who owes, recent payments, packages sold.
struct MoneyScreen: View {
    @Environment(SessionStore.self) private var session
    @Environment(\.dynamicTypeSize) private var typeSize

    struct Data: Sendable {
        let money: MoneySummary
        let settings: ProviderSettings
        let plan: PlanInfo
        let sold: [SoldPackage]
    }

    var body: some View {
        Loaded(load: { () async throws(APIError) in
            Data(money: try await session.api.run(.moneySummary, MoneyInput()), settings: try await session.api.run(.providerSettings),
                 plan: try await session.api.run(.planGet), sold: try await session.api.run(.creditsSold))
        }) { data, reload in
            let m = data.money
            let tz = data.settings.timezone
            List {
                Section {
                    if !data.settings.chargesEnabled {
                        NavigationLink(value: AppLink.payouts(returned: false)) { Text("Connect payouts to take card payments →").font(.subheadline) }
                            .listRowBackground(Color.yellow.opacity(0.12))
                    }
                    LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: typeSize.isAccessibilitySize ? 1 : 2), spacing: 12) {
                        tile("Collected", m.collectedCents)
                        tile("Refunded", m.refundedCents)
                        tile(data.plan.current == "pro" ? "Platform fees (Pro: none)" : "Platform fees (\(percent(data.plan.plans.free.feeBps))%)", m.feesCents)
                        tile("Net", m.collectedCents - m.refundedCents - m.feesCents)
                    }
                    .padding(.vertical, 4)
                } footer: {
                    Text("Last 30 days. Card processing is deducted by Stripe before payout.")
                }
                Section {
                    if m.owed.isEmpty { Text("Everyone’s paid up.").font(.subheadline).foregroundStyle(.secondary) }
                    ForEach(m.owed) { o in
                        HStack(alignment: .top) {
                            Text("\(o.playerName) · \(o.sessionTitle) · \(VamoFormat.dateTime(o.startsAt, timeZone: tz))"
                                 + (o.paymentStatus == "failed" ? " · card failed" : o.paymentRule == "external" ? " · pay outside app" : ""))
                            Spacer()
                            Text(VamoFormat.money(o.amountCents)).fontWeight(.medium)
                        }
                        .font(.subheadline)
                    }
                } header: {
                    Text("Owed to you (\(VamoFormat.money(m.owedCents)))")
                } footer: {
                    Text("Mark cash/Venmo payments as paid from the session page.")
                }
                Section("Recent payments") { PaymentRows(payments: m.recent, timeZone: tz) { $0.payerName ?? "" } }
                if !data.sold.isEmpty {
                    Section("Packages sold") {
                        ForEach(data.sold) { p in Text("\(p.name) · \(p.creditsTotal - p.creditsUsed) of \(p.creditsTotal) credits left").font(.subheadline) }
                    }
                }
            }
            .refreshable { await reload() }
        }
        .navigationTitle("Money")
    }

    private func percent(_ bps: Int) -> String {
        let value = Double(bps) / 100
        return value == value.rounded() ? String(Int(value)) : String(value)
    }

    private func tile(_ label: String, _ cents: Int) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label).font(.caption).foregroundStyle(.secondary)
            Text(VamoFormat.money(cents)).font(.title3.bold()).lineLimit(1).minimumScaleFactor(0.6)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(Color(.tertiarySystemFill), in: RoundedRectangle(cornerRadius: 12))
        .accessibilityElement(children: .combine)
    }
}

/// Payment history rows (components/payment-rows.tsx), for Money and a player's receipts.
struct PaymentRows: View {
    let payments: [PaymentRecord]
    let timeZone: String
    let who: (PaymentRecord) -> String

    var body: some View {
        if payments.isEmpty { Text("No payments yet.").font(.subheadline).foregroundStyle(.secondary) }
        ForEach(payments) { p in
            HStack(alignment: .top) {
                Text("\(who(p)) · \(Labels.shared.paymentPurpose(p.purpose)) · \(VamoFormat.dateTime(p.createdAt, timeZone: timeZone))"
                     + (p.status == "failed" ? " · failed" : p.refundedCents > 0 ? " · refunded \(VamoFormat.money(p.refundedCents))" : "")
                     + (p.status == "disputed" ? " · disputed" : ""))
                Spacer()
                Text(VamoFormat.money(p.amountCents)).fontWeight(.medium)
            }
            .font(.subheadline)
        }
    }
}
