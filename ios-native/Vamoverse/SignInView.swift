import AuthenticationServices
import SwiftUI
import VamoKit

/// The web's /login. Debug builds show the development sign-in (any email, nothing is sent);
/// Release builds sign in through Supabase (email link, text code, Apple, Google).
struct SignInView: View {
    @Environment(SessionStore.self) private var session
    @Environment(Toasts.self) private var toasts
    @State private var email = ""
    @State private var pending = false
    @FocusState private var emailFocused: Bool

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                Text("Vamoverse")
                    .font(.title.bold())
                    .foregroundStyle(Color.accentColor)
                    .padding(.top, 40)
                VStack(alignment: .leading, spacing: 6) {
                    Text("Sign in or create an account").font(.title2.bold())
                    Text("No password needed. New here? We’ll set you up in a minute.")
                        .foregroundStyle(.secondary)
                }
                switch session.mode {
                case .dev: devForm
                case .supabase(let supabase): SupabaseSignInForm(supabase: supabase)
                case .unconfigured: comingSoon
                }
            }
            .padding(24)
            HStack(spacing: 16) {
                Link("Terms", destination: session.api.baseURL.appending(path: "terms"))
                Link("Privacy", destination: session.api.baseURL.appending(path: "privacy"))
            }
            .font(.footnote)
        }
        .scrollDismissesKeyboard(.interactively)
    }

    private var devForm: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Local development sign-in: no email is sent.")
                .font(.footnote)
                .padding(12)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Color.yellow.opacity(0.15), in: RoundedRectangle(cornerRadius: 10))
            VStack(alignment: .leading, spacing: 6) {
                Text("Email").font(.subheadline.weight(.medium))
                TextField("", text: $email)
                    .textContentType(.emailAddress)
                    .keyboardType(.emailAddress)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .submitLabel(.continue)
                    .focused($emailFocused)
                    .onSubmit(submit)
                    .padding(12)
                    .background(RoundedRectangle(cornerRadius: 12).strokeBorder(.quaternary))
                    .accessibilityLabel("Email")
                    .accessibilityIdentifier("signin.email")
            }
            Button(action: submit) {
                Text(pending ? "Signing in…" : "Continue").frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .disabled(pending || email.trimmingCharacters(in: .whitespaces).isEmpty)
            .accessibilityIdentifier("signin.continue")
            Text("Server: \(session.api.baseURL.absoluteString)")
                .font(.caption2)
                .foregroundStyle(.tertiary)
        }
    }

    private var comingSoon: some View {
        Text("Sign-in isn’t set up for this build yet.")
            .foregroundStyle(.secondary)
    }

    private func submit() {
        guard !pending, !email.trimmingCharacters(in: .whitespaces).isEmpty else { return }
        pending = true
        emailFocused = false
        Task {
            defer { pending = false }
            do throws(APIError) { try await session.devSignIn(email: email) } catch { toasts.error(error) }
        }
    }
}

/// Production sign-in, as on the web (login-form.tsx SupabaseLogin), plus native Sign in with Apple.
private struct SupabaseSignInForm: View {
    let supabase: SupabaseSignIn
    @Environment(SessionStore.self) private var session
    @Environment(Toasts.self) private var toasts
    @State private var method = "email"
    @State private var contact = ""
    @State private var code = ""
    @State private var sent = false
    @State private var pending = false
    @State private var nonce = SupabaseSignIn.makeNonce()

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            if sent && method == "email" {
                Text("Check **\(contact)** for a sign-in link. Open it on this phone to continue.")
            } else {
                SignInWithAppleButton(.continue) { request in
                    nonce = SupabaseSignIn.makeNonce()
                    request.requestedScopes = [.fullName, .email]
                    request.nonce = nonce.hashed
                } onCompletion: { result in
                    Task { await apple(result) }
                }
                .signInWithAppleButtonStyle(.black)
                .frame(height: 48)
                Button { run { try await supabase.signInWithGoogle(); await session.reload() } } label: { Text("Continue with Google").frame(maxWidth: .infinity) }
                    .buttonStyle(.bordered).controlSize(.large)
                Text("or").font(.caption).foregroundStyle(.secondary).frame(maxWidth: .infinity)
                Picker("Sign in with", selection: $method) {
                    Text("Email link").tag("email")
                    Text("Text message code").tag("phone")
                }
                .pickerStyle(.segmented)
                .onChange(of: method) { _, _ in sent = false; code = "" }
                if method == "email" {
                    FormField("Email", text: $contact).textContentType(.emailAddress).keyboardType(.emailAddress).textInputAutocapitalization(.never)
                } else {
                    FormField("Mobile number", text: $contact, prompt: "+1 415 555 0100", keyboard: .phonePad).textContentType(.telephoneNumber).disabled(sent)
                    if sent { FormField("6-digit code", text: $code, keyboard: .numberPad).textContentType(.oneTimeCode) }
                }
                Button(action: submit) {
                    Text(pending ? "Please wait…" : sent ? "Verify and continue" : method == "email" ? "Email me a link" : "Text me a code").frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent).controlSize(.large)
                .disabled(pending || contact.trimmingCharacters(in: .whitespaces).isEmpty)
            }
        }
    }

    private func submit() {
        let value = contact.trimmingCharacters(in: .whitespaces)
        if method == "email" { run { try await supabase.sendEmailLink(to: value); sent = true } }
        else if sent { run { try await supabase.verifyTextCode(phone: value, code: code); await session.reload() } }
        else { run { try await supabase.sendTextCode(to: value); sent = true } }
    }

    private func apple(_ result: Result<ASAuthorization, Error>) async {
        switch result {
        case .success(let authorization):
            guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
                  let data = credential.identityToken, let idToken = String(data: data, encoding: .utf8) else { return }
            let raw = nonce.raw
            run { try await supabase.signInWithApple(idToken: idToken, nonce: raw); await session.reload() }
        case .failure(let error):
            if (error as? ASAuthorizationError)?.code != .canceled { toasts.error(APIError(code: "unauthorized", message: error.localizedDescription, status: 0)) }
        }
    }

    private func run(_ work: @escaping @MainActor () async throws -> Void) {
        pending = true
        Task {
            defer { pending = false }
            do {
                try await work()
            } catch {
                toasts.error(APIError(code: "unauthorized", message: SupabaseSignIn.message(error), status: 0))
            }
        }
    }
}
