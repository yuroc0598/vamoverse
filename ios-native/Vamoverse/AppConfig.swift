import Foundation

/// Where the app points: the Info.plist value from the build configuration (Config/*.xcconfig).
/// Debug builds can be repointed with the launch argument `-VamoBaseURL <url>` (simctl launch, the
/// Xcode scheme, or the UI tests); Release builds can't.
enum AppConfig {
    static var baseURL: URL {
        #if DEBUG
        if let override = UserDefaults.standard.string(forKey: "VamoBaseURL"), let url = URL(string: override) { return url }
        #endif
        if let configured = Bundle.main.object(forInfoDictionaryKey: "VamoBaseURL") as? String, let url = URL(string: configured) { return url }
        return URL(string: "https://vamoverse.app")!
    }

    /// Debug builds sign in with the dev route (any email, nothing sent), like the web in dev.
    static var usesDevSignIn: Bool {
        #if DEBUG
        true
        #else
        false
        #endif
    }

    /// APNs environment for tokens from this build (Debug builds use the sandbox).
    static var apnsEnvironment: String {
        #if DEBUG
        "sandbox"
        #else
        "production"
        #endif
    }

    /// Debug only: `-VamoResetSession YES` starts signed out (the UI tests use it).
    static var resetSessionOnLaunch: Bool {
        #if DEBUG
        UserDefaults.standard.bool(forKey: "VamoResetSession")
        #else
        false
        #endif
    }

    /// Debug only: `-VamoOpenLink /s/ses_123` opens that screen once signed in (UI tests, screenshots).
    static var openLinkOnLaunch: String? {
        #if DEBUG
        UserDefaults.standard.string(forKey: "VamoOpenLink").flatMap { $0.isEmpty ? nil : $0 }
        #else
        nil
        #endif
    }

    /// Debug only: `-VamoOpenURL vamoverse://b/…` runs the app's link handler at launch, exactly as if
    /// the system had opened the URL (no "Open in…?" prompt, so it works in screenshots and tests).
    static var openURLOnLaunch: URL? {
        #if DEBUG
        UserDefaults.standard.string(forKey: "VamoOpenURL").flatMap(URL.init(string:))
        #else
        nil
        #endif
    }

    /// Debug only: `-VamoOpenAssistant YES` opens the assistant once signed in (screenshots, UI tests).
    static var openAssistantOnLaunch: Bool {
        #if DEBUG
        UserDefaults.standard.bool(forKey: "VamoOpenAssistant")
        #else
        false
        #endif
    }

    /// Debug only: `-VamoSignInAs alex@demo.vamoverse.app` signs in with the dev route at launch
    /// (`npm run ios:sim:native -- --as <email>` switches roles without typing).
    static var signInAsOnLaunch: String? {
        #if DEBUG
        UserDefaults.standard.string(forKey: "VamoSignInAs").flatMap { $0.isEmpty ? nil : $0 }
        #else
        nil
        #endif
    }
}
