import SwiftUI
import VamoKit

/// /settings/family: juniors (profiles, remove) and adding one with guardian consent.
struct FamilyScreen: View {
    let welcome: Bool
    @Environment(SessionStore.self) private var session

    var body: some View {
        Loaded(load: { () async throws(APIError) in try await session.api.run(.familyList).filter(\.isJunior) }) { juniors, reload in
            Form {
                if welcome {
                    Text("You’re in. Add your juniors so you can book for them.").foregroundStyle(.green)
                }
                ForEach(juniors) { junior in JuniorSection(junior: junior, reload: reload) }
                AddJuniorSection(reload: reload)
            }
            .refreshable { await reload() }
        }
        .navigationTitle("Family")
    }
}

private struct JuniorSection: View {
    let junior: Player
    let reload: @MainActor () async -> Void
    @Environment(SessionStore.self) private var session
    @Environment(Toasts.self) private var toasts
    @State private var confirmRemove = false
    @State private var removing = false

    var body: some View {
        Section {
            PlayerProfileForm(player: junior, showName: true, saved: reload)
        } header: {
            HStack {
                Text(junior.displayName)
                Spacer()
                Button("Remove") { confirmRemove = true }
                    .font(.subheadline).textCase(nil).disabled(removing)
                    .accessibilityIdentifier("family.remove")
            }
        }
        .alert("Remove \(junior.displayName) and delete their data?", isPresented: $confirmRemove) {
            Button("Cancel", role: .cancel) {}
            Button("Remove", role: .destructive) { Task { await remove() } }
        }
    }

    private func remove() async {
        removing = true
        defer { removing = false }
        if await perform(session, toasts, { () async throws(APIError) in try await session.api.run(.familyRemoveJunior, PlayerIdInput(playerId: junior.id)) }) != nil {
            toasts.success("\(junior.displayName) removed")
            await reload()
        }
    }
}

private struct AddJuniorSection: View {
    let reload: @MainActor () async -> Void
    @Environment(SessionStore.self) private var session
    @Environment(Toasts.self) private var toasts
    @State private var name = ""
    @State private var birthDate = Calendar.current.date(byAdding: .year, value: -10, to: .now) ?? .now
    @State private var gender = ""
    @State private var consent = false
    @State private var signature = ""
    @State private var adding = false

    var body: some View {
        Section {
            FormField("Junior’s name", text: $name).textContentType(.name)
            DatePicker("Birth date", selection: $birthDate, in: ...Date.now, displayedComponents: .date)
            GenderPicker(selection: $gender)
            Toggle(isOn: $consent) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("I am this junior’s parent or legal guardian and consent to Vamoverse storing their name, birth date, and tennis details so coaches can run sessions for them.")
                        .font(.subheadline)
                    Text("For players under 13, your first card payment also verifies this consent. You can remove the junior and their data at any time.")
                        .font(.caption).foregroundStyle(.secondary)
                }
            }
            FormField("Type your full name to sign", text: $signature).textContentType(.name)
            Button(adding ? "Adding…" : "Add junior", action: add).disabled(adding)
        } header: {
            Text("Add a junior")
        } footer: {
            Text("Juniors don’t get their own login. You book, pay, and receive every message for them.")
        }
    }

    private func add() {
        adding = true
        Task {
            defer { adding = false }
            let input = AddJuniorInput(displayName: name, birthDate: calendarDate(birthDate), gender: gender.isEmpty ? nil : gender, signatureName: signature, consent: consent)
            if await perform(session, toasts, { () async throws(APIError) in try await session.api.run(.familyAddJunior, input) }) != nil {
                toasts.success("Junior added")
                name = ""; gender = ""; consent = false; signature = ""
                await reload()
            }
        }
    }
}

/// One form for any player profile you manage (components/player-profile-form.tsx).
struct PlayerProfileForm: View {
    let player: Player
    var showName = false
    let saved: @MainActor () async -> Void
    @Environment(SessionStore.self) private var session
    @Environment(Toasts.self) private var toasts
    @State private var name = ""
    @State private var birthDate = Date.now
    @State private var gender = ""
    @State private var ntrp = ""
    @State private var utrSingles = ""
    @State private var utrDoubles = ""
    @State private var utrProfileId = ""
    @State private var saving = false
    @State private var loaded = false

    var body: some View {
        Group {
            if showName { FormField("Name", text: $name) }
            if player.isJunior { DatePicker("Birth date", selection: $birthDate, in: ...Date.now, displayedComponents: .date) }
            GenderPicker(selection: $gender)
            field("NTRP (optional)", prompt: "e.g. 3.5", $ntrp, keyboard: .decimalPad)
            field("UTR singles (optional)", $utrSingles, keyboard: .decimalPad)
            field("UTR doubles (optional)", $utrDoubles, keyboard: .decimalPad)
            field("UTR profile number (optional)", $utrProfileId, keyboard: .numberPad,
                  hint: "The number at the end of your UTR profile link. Shown as self-reported.")
            Text("Ratings are self-reported. Coaches can always approve players outside a session’s level range.").font(.caption).foregroundStyle(.secondary)
            Button(saving ? "Saving…" : "Save", action: save).disabled(saving)
        }
        .onAppear(perform: fill)
    }

    /// A labelled field (label above, so long labels never truncate), like the web's TextField.
    private func field(_ label: String, prompt: String = "", _ text: Binding<String>, keyboard: UIKeyboardType, hint: String? = nil) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label).font(.subheadline).foregroundStyle(.secondary)
            TextField(prompt, text: text).keyboardType(keyboard).accessibilityLabel(label)
            if let hint { Text(hint).font(.caption).foregroundStyle(.secondary) }
        }
    }

    private func fill() {
        guard !loaded else { return }
        loaded = true
        name = player.displayName
        if let date = player.birthDate.flatMap(dateFromCalendarString) { birthDate = date }
        gender = player.gender ?? ""
        ntrp = player.ntrp.map(format) ?? ""
        utrSingles = player.utrSingles.map(format) ?? ""
        utrDoubles = player.utrDoubles.map(format) ?? ""
        utrProfileId = player.utrProfileId ?? ""
    }

    private func format(_ value: Double) -> String { value == value.rounded() ? String(Int(value)) : String(value) }

    private func save() {
        saving = true
        Task {
            defer { saving = false }
            let input = UpdatePlayerInput(
                playerId: player.id, displayName: showName ? name : nil, birthDate: player.isJunior ? calendarDate(birthDate) : nil,
                gender: gender.isEmpty ? nil : gender, ntrp: ntrp, utrSingles: utrSingles, utrDoubles: utrDoubles,
                utrProfileId: utrProfileId.trimmingCharacters(in: .whitespaces).isEmpty ? nil : utrProfileId.trimmingCharacters(in: .whitespaces))
            if await perform(session, toasts, { () async throws(APIError) in try await session.api.run(.playersUpdate, input) }) != nil {
                toasts.success("Profile saved")
                await saved()
            }
        }
    }
}

struct GenderPicker: View {
    @Binding var selection: String

    var body: some View {
        Picker(selection: $selection) {
            Text("Prefer not to say").tag("")
            Text("Female").tag("female")
            Text("Male").tag("male")
            Text("Non-binary").tag("nonbinary")
        } label: {
            VStack(alignment: .leading) {
                Text("Gender")
                Text("Only used for men’s, women’s, and mixed sessions.").font(.caption).foregroundStyle(.secondary)
            }
        }
    }
}

/// "YYYY-MM-DD" → that day at noon in the device's calendar (so no time zone shifts it a day).
func dateFromCalendarString(_ text: String) -> Date? {
    let parts = text.split(separator: "-").compactMap { Int($0) }
    guard parts.count == 3 else { return nil }
    return Calendar.current.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2], hour: 12))
}

/// A picked day as "YYYY-MM-DD" (the server's date format), in the device's calendar.
func calendarDate(_ date: Date) -> String {
    let c = Calendar.current.dateComponents([.year, .month, .day], from: date)
    return String(format: "%04d-%02d-%02d", c.year!, c.month!, c.day!)
}
