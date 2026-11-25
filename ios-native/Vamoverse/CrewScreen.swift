import ContactsUI
import MessageUI
import SwiftUI
import VamoKit

/// /crew: students, private notes, and invites. Paste is parsed on the server (clients.import
/// {text}); Contacts uses the system picker (no contacts permission). Invites are sent from the
/// coach's own Messages or Mail with the server's text; Vamoverse sends nothing itself.
struct CrewScreen: View {
    @Environment(SessionStore.self) private var session
    @State private var search = ""
    @State private var query = ""

    struct Data: Sendable {
        let clients: [Client]
        let invites: [Invite]
        let settings: ProviderSettings
    }

    var body: some View {
        Loaded(load: { () async throws(APIError) in
            Data(clients: try await session.api.run(.clientsList, ClientsListInput(search: query.isEmpty ? nil : query)),
                 invites: try await session.api.run(.clientsInvites),
                 settings: try await session.api.run(.providerSettings))
        }) { data, reload in
            CrewContent(data: data, search: query, reload: reload)
        }
        .id(query) // searches on submit, like the web form
        .searchable(text: $search, prompt: "Search by name")
        .onSubmit(of: .search) { query = search }
        .onChange(of: search) { _, text in if text.isEmpty { query = "" } }
        .navigationTitle("Crew")
    }
}

private struct CrewContent: View {
    let data: CrewScreen.Data
    let search: String
    let reload: @MainActor () async -> Void
    @Environment(SessionStore.self) private var session
    @Environment(Toasts.self) private var toasts
    @Environment(Navigator.self) private var navigator
    @State private var pasted = ""
    @State private var importing = false
    @State private var pickingContacts = false
    @State private var result: String?
    @State private var composing: Compose?
    @State private var preview: ImportPreview?

    /// The web's button label (crew-forms.tsx): "Save 3 invites".
    private var saveLabel: String {
        let n = preview?.rows.count ?? 0
        return "Save \(n > 0 ? "\(n) " : "")invite\(n == 1 ? "" : "s")"
    }

    var body: some View {
        List {
            Section {
                if data.clients.isEmpty {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(search.isEmpty ? "Your crew is empty" : "No matches").font(.headline)
                        if search.isEmpty { Text("Invite your students below or share your page link. Anyone who books or joins is added automatically.").foregroundStyle(.secondary) }
                    }
                }
                ForEach(data.clients) { client in ClientRow(client: client, timeZone: data.settings.timezone, reload: reload) }
            } header: {
                HStack {
                    Text("Everyone you teach, in one place.").textCase(nil)
                    Spacer()
                    ShareLink(item: session.api.baseURL.appending(path: "p/\(data.settings.slug)"), subject: Text("Book with \(data.settings.displayName)")) {
                        Image(systemName: "square.and.arrow.up")
                    }
                    .accessibilityLabel("Share your page")
                }
            }

            if !data.invites.isEmpty {
                Section {
                    ForEach(data.invites) { invite in inviteRow(invite) }
                } header: {
                    Text("Not joined yet (\(data.invites.count))")
                } footer: {
                    Text("Tap Text or Email to send the invite from your own phone. They appear in your crew once they join or book.")
                }
            }

            Section {
                TextField("Maya Chen, maya@example.com\nSam Lee, (415) 555-0100", text: $pasted, axis: .vertical)
                    .lineLimit(3...10)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .accessibilityLabel("Students")
                    .accessibilityIdentifier("crew.import.text")
                if let preview, !pasted.isEmpty {
                    Text("\(preview.rows.count) ready to add\(preview.skipped.isEmpty ? "" : " · \(preview.skipped.count) line(s) need an email or phone")")
                        .font(.caption).foregroundStyle(.secondary)
                        .accessibilityIdentifier("crew.import.preview")
                }
                Button(importing ? "Saving…" : saveLabel) { Task { await importText() } }
                    .disabled(importing || (preview?.rows.isEmpty ?? true))
                    .accessibilityIdentifier("crew.import.save")
                Button { pickingContacts = true } label: { Label("Choose from Contacts", systemImage: "person.crop.circle.badge.plus") }
            } header: {
                Text("Invite students")
            } footer: {
                Text("Paste from a spreadsheet or your contacts: one person per line with a name and an email or mobile number.")
            }
        }
        .refreshable { await reload() }
        .task(id: pasted) {
            // The server's parse, as you type (debounced), so the count matches what Save will add.
            guard !pasted.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { preview = nil; return }
            try? await Task.sleep(for: .milliseconds(350))
            guard !Task.isCancelled else { return }
            preview = try? await session.api.run(.clientsPreview, PreviewImportInput(text: pasted))
        }
        .sheet(isPresented: $pickingContacts) {
            ContactPicker { contacts in Task { await importContacts(contacts) } }.ignoresSafeArea()
        }
        .sheet(item: $composing) { compose in
            ComposeSheet(compose: compose).ignoresSafeArea()
        }
        .alert(result ?? "", isPresented: Binding { result != nil } set: { if !$0 { result = nil } }) { Button("OK") {} }
    }

    private func inviteRow(_ invite: Invite) -> some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(invite.name).fontWeight(.medium)
                Text([invite.email, invite.phone].compactMap { $0 }.joined(separator: " · ")).font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
            HStack(spacing: 14) {
                if let phone = invite.phone { Button("Text") { send(.text(to: phone, body: invite.message)) } }
                if let email = invite.email { Button("Email") { send(.email(to: email, subject: invite.subject, body: invite.message)) } }
                Button("Remove", role: .destructive) { Task { await remove(invite) } }
            }
            .font(.subheadline).buttonStyle(.borderless)
        }
    }

    private func send(_ compose: Compose) {
        // The system composer when this device can send; otherwise the sms:/mailto: link (like the web).
        if compose.canCompose { composing = compose } else if let url = compose.url { UIApplication.shared.open(url) }
    }

    private func remove(_ invite: Invite) async {
        if await perform(session, toasts, { () async throws(APIError) in try await session.api.run(.clientsRemoveInvite, InviteIdInput(inviteId: invite.id)) }) != nil {
            await reload()
        }
    }

    private func importText() async {
        importing = true
        defer { importing = false }
        guard let imported = await perform(session, toasts, { () async throws(APIError) in try await session.api.run(.clientsImport, .text(pasted)) }) else { return }
        pasted = ""
        preview = nil
        result = summary(imported)
        await reload()
    }

    private func importContacts(_ contacts: [ImportInvitesInput.Contact]) async {
        guard !contacts.isEmpty else { return }
        guard let imported = await perform(session, toasts, { () async throws(APIError) in try await session.api.run(.clientsImport, .contacts(contacts)) }) else { return }
        result = summary(imported)
        await reload()
    }

    /// The web's confirmation (crew-forms.tsx), plus lines the server couldn't read.
    private func summary(_ r: ImportResult) -> String {
        let failed = r.failed.isEmpty ? "" : " Couldn’t add: \(r.failed.map { "\($0.name) (\($0.reason))" }.joined(separator: ", "))."
        let skipped = r.skipped.isEmpty ? "" : " \(r.skipped.count) line(s) need an email or phone."
        return "Saved \(r.added) invite\(r.added == 1 ? "" : "s").\(r.duplicates > 0 ? " \(r.duplicates) already invited." : "")\(failed)\(skipped) Send them from the list below."
    }
}

private struct ClientRow: View {
    let client: Client
    let timeZone: String
    let reload: @MainActor () async -> Void
    @Environment(SessionStore.self) private var session
    @Environment(Toasts.self) private var toasts
    @Environment(Navigator.self) private var navigator
    @State private var editing = false
    @State private var notes = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(client.playerName).fontWeight(.medium) + Text(client.junior ? " · junior · parent \(client.contactName)" : "").foregroundStyle(.secondary)
                    (Text(client.upcoming > 0 ? "\(client.upcoming) upcoming" : "Nothing booked")
                     + Text(client.lastSessionAt.map { " · last played \(VamoFormat.date($0, timeZone: timeZone))" } ?? "")
                     + Text(client.owedCents > 0 ? " · owes \(VamoFormat.money(client.owedCents))" : "").foregroundStyle(.red))
                        .font(.caption).foregroundStyle(.secondary)
                }
                Spacer()
                Button { Task { await message() } } label: { Image(systemName: "message") }.buttonStyle(.borderless).accessibilityLabel("Message \(client.playerName)")
            }
            if editing {
                HStack {
                    TextField("Only you can see this", text: $notes).textFieldStyle(.roundedBorder)
                    Button("Save") { Task { await save() } }.buttonStyle(.borderless)
                }
            } else {
                Button(client.notes.map { "Notes: \($0)" } ?? "+ Private notes") { notes = client.notes ?? ""; editing = true }
                    .font(.caption).foregroundStyle(.secondary).buttonStyle(.borderless)
            }
        }
        .padding(.vertical, 2)
    }

    private func save() async {
        if await perform(session, toasts, { () async throws(APIError) in try await session.api.run(.clientsUpdate, ClientNotesInput(playerId: client.playerId, notes: notes.isEmpty ? nil : notes)) }) != nil {
            toasts.success("Notes saved")
            editing = false
            await reload()
        }
    }

    private func message() async {
        if let started = await perform(session, toasts, { () async throws(APIError) in try await session.api.run(.messagesStart, StartThreadInput(playerId: client.playerId)) }) {
            navigator.open(.conversation(id: started.threadId), isProvider: true)
        }
    }
}

// MARK: Contacts and compose

/// The system contact picker: returns only what the coach picks (no contacts permission).
private struct ContactPicker: UIViewControllerRepresentable {
    let picked: ([ImportInvitesInput.Contact]) -> Void

    func makeUIViewController(context: Context) -> CNContactPickerViewController {
        let picker = CNContactPickerViewController()
        picker.delegate = context.coordinator
        picker.displayedPropertyKeys = [CNContactEmailAddressesKey, CNContactPhoneNumbersKey]
        picker.predicateForEnablingContact = NSPredicate(format: "emailAddresses.@count > 0 OR phoneNumbers.@count > 0")
        return picker
    }

    func updateUIViewController(_ controller: CNContactPickerViewController, context: Context) {}
    func makeCoordinator() -> Coordinator { Coordinator(picked: picked) }

    final class Coordinator: NSObject, CNContactPickerDelegate {
        let picked: ([ImportInvitesInput.Contact]) -> Void
        init(picked: @escaping ([ImportInvitesInput.Contact]) -> Void) { self.picked = picked }

        func contactPicker(_ picker: CNContactPickerViewController, didSelect contacts: [CNContact]) {
            picked(contacts.compactMap { contact in
                let name = CNContactFormatter.string(from: contact, style: .fullName) ?? ""
                let email = contact.emailAddresses.first.map { String($0.value) }
                let phone = contact.phoneNumbers.first?.value.stringValue
                return name.isEmpty || (email == nil && phone == nil) ? nil : .init(name: name, email: email, phone: phone)
            })
        }
    }
}

enum Compose: Identifiable {
    case text(to: String, body: String)
    case email(to: String, subject: String, body: String)

    var id: String {
        switch self {
        case .text(let to, _): "sms:\(to)"
        case .email(let to, _, _): "mailto:\(to)"
        }
    }

    @MainActor var canCompose: Bool {
        switch self {
        case .text: MFMessageComposeViewController.canSendText()
        case .email: MFMailComposeViewController.canSendMail()
        }
    }

    /// The web's sms:/mailto: links (crew-forms.tsx).
    var url: URL? {
        let allowed = CharacterSet.urlQueryAllowed.subtracting(CharacterSet(charactersIn: "&=?+"))
        switch self {
        case .text(let to, let body): return URL(string: "sms:\(to)?&body=\(body.addingPercentEncoding(withAllowedCharacters: allowed) ?? "")")
        case .email(let to, let subject, let body):
            return URL(string: "mailto:\(to)?subject=\(subject.addingPercentEncoding(withAllowedCharacters: allowed) ?? "")&body=\(body.addingPercentEncoding(withAllowedCharacters: allowed) ?? "")")
        }
    }
}

private struct ComposeSheet: UIViewControllerRepresentable {
    let compose: Compose
    @Environment(\.dismiss) private var dismiss

    func makeUIViewController(context: Context) -> UIViewController {
        switch compose {
        case .text(let to, let body):
            let controller = MFMessageComposeViewController()
            controller.recipients = [to]
            controller.body = body
            controller.messageComposeDelegate = context.coordinator
            return controller
        case .email(let to, let subject, let body):
            let controller = MFMailComposeViewController()
            controller.setToRecipients([to])
            controller.setSubject(subject)
            controller.setMessageBody(body, isHTML: false)
            controller.mailComposeDelegate = context.coordinator
            return controller
        }
    }

    func updateUIViewController(_ controller: UIViewController, context: Context) {}
    func makeCoordinator() -> Coordinator { Coordinator { dismiss() } }

    final class Coordinator: NSObject, MFMessageComposeViewControllerDelegate, MFMailComposeViewControllerDelegate {
        let done: () -> Void
        init(done: @escaping () -> Void) { self.done = done }
        func messageComposeViewController(_ controller: MFMessageComposeViewController, didFinishWith result: MessageComposeResult) { done() }
        func mailComposeController(_ controller: MFMailComposeViewController, didFinishWith result: MFMailComposeResult, error: Error?) { done() }
    }
}
