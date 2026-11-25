import Foundation

/// A web path as a native destination. Notification links, push `link`s, universal links, and
/// in-app navigation all go through `AppLink.parse`. The patterns are the server's route table
/// (src/lib/app-routes.ts → routes.json, bundled here); tests check every native route there maps
/// to a case.
public enum AppLink: Hashable, Sendable {
    case home
    case find
    case provider(slug: String)
    case session(id: String)
    case booking(id: String, token: String?)
    case messages
    case conversation(id: String)
    case notifications
    case settings
    case account
    case family(welcome: Bool)
    case business(welcome: Bool)
    case payments
    case payouts(returned: Bool)
    case onboarding
    // Providers
    case schedule
    case manageSession(id: String)
    case newOffering
    case offering(id: String)
    case crew
    case money
    /// A web route the app doesn't have a native screen for yet (or one that opens in Safari).
    case web(path: String)

    struct Route: Decodable {
        let pattern: String
        let screen: String
        let target: String
    }

    private struct File: Decodable { let routes: [Route] }

    static let routes: [Route] = {
        guard let url = Bundle.module.url(forResource: "routes", withExtension: "json"),
              let data = try? Data(contentsOf: url),
              let file = try? JSONDecoder().decode(File.self, from: data) else { fatalError("VamoKit's routes.json is missing; run npm run api:catalog") }
        return file.routes
    }()

    /// `/b/bkg_1?t=abc`, `https://vamoverse.app/s/ses_1`, `vamoverse://p/alex-rivera`, …
    public static func parse(_ link: String) -> AppLink {
        guard let components = URLComponents(string: link) else { return .web(path: link) }
        var segments = components.path.split(separator: "/").map(String.init)
        // vamoverse://p/alex → host "p", path "/alex"
        if components.scheme == "vamoverse", let host = components.host { segments.insert(host, at: 0) }
        let query = Dictionary(components.queryItems?.map { ($0.name, $0.value ?? "") } ?? [], uniquingKeysWith: { first, _ in first })
        let path = "/" + segments.joined(separator: "/")

        for route in routes {
            let pattern = route.pattern.split(separator: "/").map(String.init)
            guard pattern.count == segments.count else { continue }
            var params: [String: String] = [:]
            guard zip(pattern, segments).allSatisfy({ p, s in
                if p.hasPrefix(":") { params[String(p.dropFirst())] = s.removingPercentEncoding ?? s; return true }
                return p == s
            }) else { continue }
            return destination(screen: route.target == "native" ? route.screen : "safari", params: params, query: query) ?? .web(path: link.hasPrefix("/") ? link : path)
        }
        return .web(path: link.hasPrefix("/") ? link : path)
    }

    /// Screens with a native view. Others return nil and open as `.web` until their phase builds them.
    static func destination(screen: String, params: [String: String], query: [String: String]) -> AppLink? {
        switch screen {
        case "home", "today": return .home
        case "find": return .find
        case "provider": return params["slug"].map { .provider(slug: $0) }
        case "session": return params["id"].map { .session(id: $0) }
        case "booking": return params["id"].map { .booking(id: $0, token: query["t"].flatMap { $0.isEmpty ? nil : $0 }) }
        case "messages": return .messages
        case "conversation": return params["id"].map { .conversation(id: $0) }
        case "notifications": return .notifications
        case "settings": return .settings
        case "settingsAccount": return .account
        case "settingsFamily": return .family(welcome: query["welcome"] != nil)
        case "settingsBusiness": return .business(welcome: query["welcome"] != nil)
        case "settingsPayments": return .payments
        case "settingsPayouts": return .payouts(returned: query["returned"] != nil || query["refresh"] != nil)
        case "onboarding": return .onboarding
        case "schedule": return .schedule
        case "sessionManage": return params["id"].map { .manageSession(id: $0) }
        case "offeringNew": return .newOffering
        case "offering": return params["id"].map { .offering(id: $0) }
        case "crew": return .crew
        case "money": return .money
        default: return nil
        }
    }

    /// The web path for this destination (Share links, "Open on the web").
    public var path: String {
        switch self {
        case .home: "/today"
        case .find: "/find"
        case .provider(let slug): "/p/\(slug)"
        case .session(let id): "/s/\(id)"
        case .booking(let id, let token): "/b/\(id)" + (token.map { "?t=\($0)" } ?? "")
        case .messages: "/messages"
        case .conversation(let id): "/messages/\(id)"
        case .notifications: "/notifications"
        case .settings: "/settings"
        case .account: "/settings/account"
        case .family: "/settings/family"
        case .business: "/settings/business"
        case .payments: "/settings/payments"
        case .payouts: "/settings/payouts"
        case .onboarding: "/onboarding"
        case .schedule: "/schedule"
        case .manageSession(let id): "/sessions/\(id)"
        case .newOffering: "/offerings/new"
        case .offering(let id): "/offerings/\(id)"
        case .crew: "/crew"
        case .money: "/money"
        case .web(let path): path
        }
    }
}
