import SwiftUI
import VamoKit

/// Opens the assistant (shown only when the server has it enabled, as on the web).
struct AssistantButton: View {
    @Environment(Navigator.self) private var navigator

    var body: some View {
        Button { navigator.assistantOpen = true } label: { Image(systemName: "sparkles") }
            .accessibilityLabel("Open assistant")
            .accessibilityIdentifier("assistant.open")
    }
}

/// The web's assistant panel (components/assistant-panel.tsx): ask in plain words; anything that
/// changes your schedule or money comes back as a card to confirm or cancel first.
struct AssistantSheet: View {
    let isProvider: Bool
    @Environment(SessionStore.self) private var session
    @Environment(\.dismiss) private var dismiss
    @State private var lines: [AssistantLine] = []
    @State private var pending: PendingAction?
    @State private var draft = ""
    @State private var busy = false

    private var suggestions: [String] {
        isProvider
            ? ["What do I have today?", "Who owes me money?", "Rain tomorrow: cancel my sessions and tell everyone", "Book Maya every Thursday at 3pm"]
            : ["What do I have coming up?", "Find a hitting partner this weekend", "Cancel my next booking", "Which coaches have openings Saturday?"]
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                ScrollViewReader { proxy in
                    ScrollView {
                        LazyVStack(alignment: .leading, spacing: 10) {
                            if lines.isEmpty {
                                Text("Ask in plain words. I’ll show you any change before it happens.").font(.subheadline).foregroundStyle(.secondary)
                                ForEach(suggestions, id: \.self) { s in
                                    Button { send(s) } label: {
                                        Text(s).font(.subheadline).frame(maxWidth: .infinity, alignment: .leading).padding(12)
                                            .background(RoundedRectangle(cornerRadius: 12).strokeBorder(.quaternary))
                                    }
                                    .buttonStyle(.plain).disabled(busy)
                                }
                            }
                            ForEach(Array(lines.enumerated()), id: \.offset) { _, line in bubble(line) }
                            if let pending { confirmCard(pending) }
                            if busy { Text("Working…").font(.subheadline).foregroundStyle(.secondary) }
                            Color.clear.frame(height: 1).id("bottom")
                        }
                        .padding()
                    }
                    .onChange(of: lines.count) { _, _ in withAnimation { proxy.scrollTo("bottom") } }
                    .onChange(of: pending) { _, _ in withAnimation { proxy.scrollTo("bottom") } }
                }
                composer
            }
            .navigationTitle("Assistant")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button { restart() } label: { Image(systemName: "arrow.counterclockwise") }.accessibilityLabel("New conversation").disabled(busy)
                }
                ToolbarItem(placement: .topBarTrailing) { Button("Close") { dismiss() } }
            }
            .task { await loadHistory() }
        }
    }

    private func bubble(_ line: AssistantLine) -> some View {
        let user = line.role == "user"
        let result = line.role == "result"
        return Text(line.text)
            .font(.subheadline)
            .padding(.horizontal, 12).padding(.vertical, 8)
            .foregroundStyle(user ? Color.white : result ? Color.green : Color.primary)
            .background(user ? Color.accentColor : result ? Color.green.opacity(0.1) : Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 16))
            .frame(maxWidth: .infinity, alignment: user ? .trailing : .leading)
    }

    private func confirmCard(_ action: PendingAction) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Confirm \(action.actions.count > 1 ? "these \(action.actions.count) changes" : "this change"):").font(.subheadline.weight(.semibold))
            ForEach(Array(action.actions.enumerated()), id: \.offset) { _, item in
                VStack(alignment: .leading, spacing: 2) {
                    Text("• \(item.description)").font(.subheadline.weight(.medium))
                    if !item.note.isEmpty { Text(item.note).font(.caption).foregroundStyle(.secondary).padding(.leading, 12) }
                }
            }
            HStack {
                Button { resolve("confirm") } label: { Label("Confirm", systemImage: "checkmark") }.buttonStyle(.borderedProminent)
                Button("Cancel") { resolve("cancel") }.buttonStyle(.bordered)
            }
            .controlSize(.small).disabled(busy)
        }
        .padding(12)
        .background(RoundedRectangle(cornerRadius: 16).strokeBorder(Color.accentColor, lineWidth: 2))
        .accessibilityIdentifier("assistant.pending")
    }

    private var composer: some View {
        HStack(spacing: 8) {
            TextField("e.g. Move Tuesday’s clinic to 7pm", text: $draft)
                .padding(.horizontal, 12).padding(.vertical, 10)
                .background(RoundedRectangle(cornerRadius: 12).strokeBorder(.quaternary))
                .submitLabel(.send)
                .onSubmit { send(draft) }
                .accessibilityLabel("Message the assistant")
                .accessibilityHint("Ask in plain words. Anything that changes your schedule or money is shown for you to confirm first.")
            Button { send(draft) } label: { Image(systemName: "arrow.up.circle.fill").font(.title) }
                .disabled(busy || draft.trimmingCharacters(in: .whitespaces).isEmpty)
                .accessibilityLabel("Send")
        }
        .padding(.horizontal).padding(.vertical, 8)
        .background(.bar)
    }

    /// Errors become an assistant line with the server's message, as on the web.
    private func guarded(_ work: @escaping @MainActor () async throws(APIError) -> Void) {
        busy = true
        Task {
            defer { busy = false }
            do throws(APIError) { try await work() } catch {
                session.handle(error)
                lines.append(AssistantLine(role: "assistant", text: error.message))
            }
        }
    }

    private func loadHistory() async {
        guard let history = try? await session.api.run(.assistantHistory) else { return }
        lines = history.messages
        pending = history.pendingAction
    }

    private func send(_ text: String) {
        let text = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, !busy else { return }
        draft = ""
        pending = nil
        lines.append(AssistantLine(role: "user", text: text))
        guarded { () async throws(APIError) in
            let reply = try await session.api.run(.assistantSend, AssistantSendInput(text: text))
            lines.append(AssistantLine(role: "assistant", text: reply.reply))
            pending = reply.pendingAction
        }
    }

    private func resolve(_ decision: String) {
        guard let action = pending else { return }
        guarded { () async throws(APIError) in
            let result = try await session.api.run(.assistantResolve, AssistantResolveInput(actionId: action.id, decision: decision))
            pending = nil
            lines += result.outcomes.map { o in
                AssistantLine(role: "result", text: "\(o.ok ? "✓" : decision == "cancel" ? "–" : "✗") \(o.summary)\(o.ok || decision == "cancel" ? "" : ": \(o.message)")")
            }
            if decision == "confirm" { await session.reload() }
        }
    }

    private func restart() {
        guarded { () async throws(APIError) in
            _ = try await session.api.run(.assistantReset)
            lines = []
            pending = nil
        }
    }
}
