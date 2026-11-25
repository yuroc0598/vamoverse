import SwiftUI
import VamoKit

/// /onboarding: name, adult confirmation, and what you'll use Vamoverse for. Parents continue to
/// Family; coaches and hitters to business setup, as on the web.
struct OnboardingScreen: View {
    let account: Account
    @Environment(SessionStore.self) private var session
    @Environment(Toasts.self) private var toasts
    @Environment(Navigator.self) private var navigator
    @State private var name = ""
    @State private var coaching = false
    @State private var hitting = false
    @State private var parent = false
    @State private var adult = false
    @State private var saving = false

    var body: some View {
        NavigationStack {
            Form {
                Section { TextField("Your name", text: $name).textContentType(.name) } header: { Text("Your name") } footer: { Text("Two quick questions and you’re in.") }
                Section {
                    toggle("I coach tennis", "Run lessons and clinics, get paid, manage your students", $coaching)
                    toggle("I’m a paid hitting partner", "Offer hitting sessions by the hour", $hitting)
                    toggle("I book for my kids", "Add juniors to your account after this step", $parent)
                } header: {
                    Text("What will you use Vamoverse for? (choose any)")
                } footer: {
                    Text("Everyone can book lessons, clinics, and hitting sessions.")
                }
                Section {
                    toggle("I’m 18 or older", "Players under 18 are added by a parent or guardian.", $adult)
                }
                Section {
                    Button(saving ? "Saving…" : "Continue", action: submit)
                        .frame(maxWidth: .infinity)
                        .disabled(saving || name.trimmingCharacters(in: .whitespaces).isEmpty)
                }
                Section { Button("Sign out", role: .destructive) { session.signOut() } }
            }
            .navigationTitle("Welcome to Vamoverse")
        }
        .onAppear { if name.isEmpty { name = account.displayName } }
    }

    private func toggle(_ title: String, _ hint: String, _ isOn: Binding<Bool>) -> some View {
        Toggle(isOn: isOn) {
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                Text(hint).font(.caption).foregroundStyle(.secondary)
            }
        }
    }

    private func submit() {
        saving = true
        Task {
            defer { saving = false }
            let input = OnboardingInput(displayName: name, adult: adult, offersCoaching: coaching, offersHitting: hitting)
            guard await perform(session, toasts, { () async throws(APIError) in try await session.api.run(.onboardingComplete, input) }) != nil else { return }
            if coaching || hitting { navigator.pending = .business(welcome: true) }
            else if parent { navigator.pending = .family(welcome: true) }
            await session.reload()
        }
    }
}
