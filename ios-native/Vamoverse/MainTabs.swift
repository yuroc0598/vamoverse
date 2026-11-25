import SwiftUI
import VamoKit

/// The web's bottom bar (src/components/layout/AppShell.tsx): providers get Today · Schedule ·
/// Crew · Money, with Messages, Notifications, and Settings in the top bar; players and parents get
/// Home · Find · Messages · Profile, with Notifications in the top bar.
struct MainTabs: View {
    let account: Account
    @Environment(Navigator.self) private var navigator
    @Environment(SessionStore.self) private var session

    var body: some View {
        @Bindable var navigator = navigator
        TabView(selection: $navigator.selected) {
            if account.isProvider {
                tab(.today, "Today", icon: "sun.max") { ProviderTodayScreen(account: account) }
                tab(.schedule, "Schedule", icon: "calendar") { ScheduleScreen() }
                tab(.crew, "Crew", icon: "person.2") { CrewScreen() }
                tab(.money, "Money", icon: "dollarsign") { MoneyScreen() }
            } else {
                tab(.home, "Home", icon: "house") { HomeScreen(account: account) }
                tab(.find, "Find", icon: "magnifyingglass") { FindScreen() }
                tab(.messages, "Messages", icon: "message") { MessagesScreen() }
                tab(.profile, "Profile", icon: "gearshape") { SettingsScreen(account: account) }
            }
        }
        .onAppear {
            navigator.reset(isProvider: account.isProvider)
            openPendingLinks()
            if session.assistantEnabled && AppConfig.openAssistantOnLaunch { navigator.assistantOpen = true }
        }
        .onChange(of: account.userId) { _, _ in navigator.reset(isProvider: account.isProvider) }
        .onChange(of: navigator.pending) { _, _ in openPendingLinks() }
        .sheet(isPresented: $navigator.assistantOpen) { AssistantSheet(isProvider: account.isProvider) }
        .onChange(of: session.assistantEnabled) { _, enabled in
            if enabled && AppConfig.openAssistantOnLaunch { navigator.assistantOpen = true }
        }
    }

    /// Links waiting for the tabs: from onboarding, or the Debug `-VamoOpenLink` launch argument.
    private func openPendingLinks() {
        if let link = navigator.pending {
            navigator.pending = nil
            navigator.open(link, isProvider: account.isProvider)
        }
    }

    private func tab(_ tab: AppTab, _ label: String, icon: String, @ViewBuilder content: () -> some View) -> some View {
        NavigationStack(path: navigator.path(for: tab)) {
            content()
                .toolbar { TopBar(account: account) }
                .navigationDestination(for: AppLink.self) { link in
                    LinkDestination(link: link, account: account).toolbar { TopBar(account: account) }
                }
        }
        .tabItem { Label(label, systemImage: icon) }
        .tag(tab)
    }
}

/// Top-bar buttons, as on the web's mobile header.
struct TopBar: ToolbarContent {
    let account: Account
    @Environment(SessionStore.self) private var session

    var body: some ToolbarContent {
        if session.assistantEnabled {
            ToolbarItem(placement: .topBarLeading) { AssistantButton() }
        }
        ToolbarItemGroup(placement: .topBarTrailing) {
            if account.isProvider {
                NavigationLink(value: AppLink.messages) { Image(systemName: "message") }
                    .accessibilityLabel("Messages")
            }
            NavigationLink(value: AppLink.notifications) {
                Image(systemName: "bell")
                    .overlay(alignment: .topTrailing) {
                        if session.unread > 0 {
                            Circle().fill(Color.accentColor).frame(width: 8, height: 8).offset(x: 2, y: -2)
                        }
                    }
            }
            .accessibilityLabel(session.unread > 0 ? "Notifications, \(session.unread) unread" : "Notifications")
            .accessibilityIdentifier("topbar.notifications")
            if account.isProvider {
                NavigationLink(value: AppLink.settings) { Image(systemName: "gearshape") }
                    .accessibilityLabel("Settings")
            }
        }
    }
}

/// The web's /settings, with its section names (settings-nav.tsx). "Payouts & plan" is for providers.
struct SettingsScreen: View {
    let account: Account
    @Environment(SessionStore.self) private var session

    var body: some View {
        List {
            Section {
                VStack(alignment: .leading, spacing: 2) {
                    Text(account.displayName).font(.headline)
                    if let contact = account.email ?? account.phone { Text(contact).font(.subheadline).foregroundStyle(.secondary) }
                }
            }
            Section {
                row("Profile", icon: "person.crop.circle", link: .account)
                row("Family", icon: "figure.and.child.holdinghands", link: .family(welcome: false))
                row("Coaching & hitting", icon: "tennis.racket", link: .business(welcome: false))
                if account.isProvider { row("Payouts & plan", icon: "banknote", link: .payouts(returned: false)) }
                row("Payments", icon: "creditcard", link: .payments)
            }
            Section {
                Link("Terms", destination: session.api.baseURL.appending(path: "terms"))
                Link("Privacy", destination: session.api.baseURL.appending(path: "privacy"))
            }
            Section {
                Button("Sign out", role: .destructive) { session.signOut() }
                    .accessibilityIdentifier("settings.signOut")
            }
        }
        .navigationTitle("Settings")
    }

    private func row(_ title: String, icon: String, link: AppLink) -> some View {
        NavigationLink(value: link) { Label(title, systemImage: icon) }
    }
}
