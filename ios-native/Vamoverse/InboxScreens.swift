import SwiftUI
import VamoKit

/// /notifications: newest first; opening the list marks everything read (as on the web).
struct NotificationsScreen: View {
    @Environment(SessionStore.self) private var session
    @Environment(Navigator.self) private var navigator

    var body: some View {
        Loaded(load: load) { page, reload in
            List {
                Section { PushPrompt() }
                Section {
                    if page.items.isEmpty { ContentUnavailableView("All caught up", systemImage: "bell") }
                    ForEach(page.items) { item in
                        Button { navigator.open(AppLink.parse(item.link ?? "/today"), isProvider: session.account?.isProvider ?? false) } label: {
                            VStack(alignment: .leading, spacing: 4) {
                                HStack(alignment: .firstTextBaseline) {
                                    Text(item.title).fontWeight(.medium).foregroundStyle(.primary)
                                    Spacer()
                                    Text(VamoFormat.dateTime(item.createdAt, timeZone: defaultTimeZone)).font(.caption).foregroundStyle(.secondary)
                                }
                                Text(item.body).font(.subheadline).foregroundStyle(.secondary)
                            }
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .listRowBackground(item.readAt == nil ? Color.accentColor.opacity(0.07) : nil)
                    }
                } footer: {
                    Text("We also send these by email, and by text for anything time-sensitive.")
                }
            }
            .refreshable { await reload() }
        }
        .navigationTitle("Notifications")
    }

    private func load() async throws(APIError) -> NotificationsPage {
        let page = try await session.api.run(.notificationsList, NotificationsInput(limit: 50))
        if page.unread > 0 {
            _ = try? await session.api.run(.notificationsMarkRead)
            await session.refreshUnread()
        }
        return page
    }
}

/// /messages: conversations, and a way to start one with each coach.
struct MessagesScreen: View {
    @Environment(SessionStore.self) private var session
    @Environment(Toasts.self) private var toasts
    @Environment(Navigator.self) private var navigator

    struct Data: Sendable {
        let threads: [MessageThread]
        let coaches: [MyCoach]
        let offerings: [Offering]
    }

    var body: some View {
        Loaded(load: load) { data, reload in
            List {
                Section {
                    if data.threads.isEmpty { ContentUnavailableView("No conversations yet", systemImage: "message") }
                    ForEach(data.threads) { thread in
                        NavigationLink(value: AppLink.conversation(id: thread.id)) {
                            HStack(alignment: .top) {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(thread.displayTitle).fontWeight(thread.unread > 0 ? .bold : .medium).lineLimit(1)
                                    Text(thread.lastMessage ?? "No messages yet").font(.subheadline).foregroundStyle(.secondary).lineLimit(1)
                                }
                                Spacer()
                                VStack(alignment: .trailing, spacing: 4) {
                                    if let at = thread.lastMessageAt { Text(VamoFormat.dateTime(at, timeZone: defaultTimeZone)).font(.caption).foregroundStyle(.secondary) }
                                    if thread.unread > 0 {
                                        Text("\(thread.unread)").font(.caption2.bold()).foregroundStyle(.white)
                                            .padding(.horizontal, 7).padding(.vertical, 2).background(Color.accentColor, in: Capsule())
                                    }
                                }
                            }
                        }
                    }
                } footer: {
                    Text(session.account?.isProvider == true ? "Message a student from Crew, or everyone in a series below." : "Talk to your coaches. Parents receive every message about their juniors.")
                }
                if !data.offerings.isEmpty {
                    Section("Message a whole series") {
                        ForEach(data.offerings) { offering in
                            Button { Task { await start(StartThreadInput(offeringId: offering.id)) } } label: { Label(offering.title, systemImage: "message") }
                        }
                    }
                }
                if !data.coaches.isEmpty {
                    Section("Message a coach") {
                        ForEach(data.coaches) { coach in
                            Button { Task { await start(StartThreadInput(providerId: coach.providerId)) } } label: { Label(coach.name, systemImage: "message") }
                        }
                    }
                }
            }
            .refreshable { await reload() }
        }
        .navigationTitle("Messages")
    }

    private func load() async throws(APIError) -> Data {
        Data(threads: try await session.api.run(.messagesThreads), coaches: try await session.api.run(.coachesMine),
             offerings: session.account?.isProvider == true ? try await session.api.run(.offeringsList) : [])
    }

    private func start(_ target: StartThreadInput) async {
        if let started = await perform(session, toasts, { () async throws(APIError) in try await session.api.run(.messagesStart, target) }) {
            navigator.open(.conversation(id: started.threadId), isProvider: session.account?.isProvider ?? false)
        }
    }
}

/// /messages/[id]: one conversation; polls every 5 seconds while open, like the web.
struct ConversationScreen: View {
    let threadId: String
    @Environment(SessionStore.self) private var session
    @Environment(Toasts.self) private var toasts
    @State private var conversation: Conversation?
    @State private var draft = ""
    @State private var sending = false
    @State private var failed: APIError?

    var body: some View {
        Group {
            if let conversation {
                VStack(spacing: 0) {
                    ScrollViewReader { proxy in
                        ScrollView {
                            LazyVStack(spacing: 8) {
                                if conversation.messages.isEmpty { Text("Say hello 👋").foregroundStyle(.secondary).padding(.top, 40) }
                                ForEach(conversation.messages) { bubble($0) }
                                Color.clear.frame(height: 1).id("bottom")
                            }
                            .padding()
                        }
                        .onAppear { proxy.scrollTo("bottom") }
                        .onChange(of: conversation.messages.count) { _, _ in withAnimation { proxy.scrollTo("bottom") } }
                    }
                    composer
                }
                .navigationTitle(conversation.thread.displayTitle)
            } else if let failed {
                ContentUnavailableView("Something went wrong", systemImage: "exclamationmark.triangle", description: Text(failed.message))
            } else {
                ProgressView()
            }
        }
        .navigationBarTitleDisplayMode(.inline)
        .task {
            // Poll while the screen is open (the task is cancelled when it closes).
            while !Task.isCancelled {
                await refresh()
                try? await Task.sleep(for: .seconds(5))
            }
        }
    }

    private func bubble(_ message: ChatMessage) -> some View {
        VStack(alignment: message.mine ? .trailing : .leading, spacing: 2) {
            if !message.mine { Text(message.senderName).font(.caption).foregroundStyle(.secondary) }
            Text(message.body)
                .padding(.horizontal, 12).padding(.vertical, 8)
                .foregroundStyle(message.mine ? Color.white : Color.primary)
                .background(message.mine ? Color.accentColor : Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 16))
        }
        .frame(maxWidth: .infinity, alignment: message.mine ? .trailing : .leading)
    }

    private var composer: some View {
        HStack(alignment: .bottom, spacing: 8) {
            TextField("Message", text: $draft, axis: .vertical)
                .lineLimit(1...5)
                .padding(.horizontal, 12).padding(.vertical, 8)
                .background(RoundedRectangle(cornerRadius: 18).strokeBorder(.quaternary))
                .accessibilityIdentifier("conversation.composer")
            Button(action: send) { Image(systemName: "arrow.up.circle.fill").font(.title) }
                .disabled(sending || draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                .accessibilityLabel("Send")
        }
        .padding(.horizontal).padding(.vertical, 8)
        .background(.bar)
    }

    private func refresh() async {
        do {
            conversation = try await session.api.run(.messagesRead, ThreadIdInput(threadId: threadId))
            failed = nil
        } catch {
            session.handle(error)
            if conversation == nil { failed = error }
        }
    }

    private func send() {
        let body = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !body.isEmpty else { return }
        sending = true
        Task {
            defer { sending = false }
            if await perform(session, toasts, { () async throws(APIError) in try await session.api.run(.messagesSend, SendMessageInput(threadId: threadId, body: body)) }) != nil {
                draft = ""
                await refresh()
            }
        }
    }
}
