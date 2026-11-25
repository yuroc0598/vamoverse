import Foundation
import Testing
@testable import VamoKit

struct AppLinkTests {
    @Test func parsesTheLinksTheServerWrites() {
        #expect(AppLink.parse("/b/bkg_1?t=abc&paid=1") == .booking(id: "bkg_1", token: "abc"))
        #expect(AppLink.parse("/b/bkg_1") == .booking(id: "bkg_1", token: nil))
        #expect(AppLink.parse("/s/ses_1?cancelled=1") == .session(id: "ses_1"))
        #expect(AppLink.parse("https://vamoverse.app/p/alex-rivera") == .provider(slug: "alex-rivera"))
        #expect(AppLink.parse("vamoverse://p/alex-rivera") == .provider(slug: "alex-rivera"))
        #expect(AppLink.parse("/messages/cnv_1") == .conversation(id: "cnv_1"))
        #expect(AppLink.parse("/messages") == .messages)
        #expect(AppLink.parse("/today?package=1") == .home)
        #expect(AppLink.parse("/settings/family?welcome=1") == .family(welcome: true))
        #expect(AppLink.parse("/settings") == .settings)
        #expect(AppLink.parse("/notifications") == .notifications)
    }

    @Test func providerScreensAndWebOnlyPaths() {
        #expect(AppLink.parse("/sessions/ses_1") == .manageSession(id: "ses_1"))
        #expect(AppLink.parse("/settings/payouts?returned=1") == .payouts(returned: true))
        #expect(AppLink.parse("/settings/business?welcome=1") == .business(welcome: true))
        #expect(AppLink.parse("/offerings/new") == .newOffering)
        #expect(AppLink.parse("/money") == .money)
        #expect(AppLink.parse("/admin") == .web(path: "/admin"))
        #expect(AppLink.parse("/nope/1") == .web(path: "/nope/1"))
    }

    /// Native routes in routes.json without a screen yet. Shrinks as phases add screens; a new
    /// web page shows up here as a failure until it gets a case or joins this list.
    /// Sign-in is the root screen until phase 5 (Supabase) makes /login links meaningful.
    static let notYetNative: Set<String> = ["signIn"]

    @Test func everyNativeRouteInTheServerTableHasAScreenOrIsListedAsPending() {
        for route in AppLink.routes where route.target == "native" {
            let sample = route.pattern.split(separator: "/").map { $0.hasPrefix(":") ? "x1" : String($0) }.joined(separator: "/")
            let link = AppLink.parse("/" + sample)
            if Self.notYetNative.contains(route.screen) {
                #expect(link == .web(path: "/" + sample), "\(route.screen) has a screen now; remove it from notYetNative")
            } else {
                if case .web = link { Issue.record("no native screen for \(route.screen) (\(route.pattern))") }
            }
        }
    }

    @Test func roundTripsToWebPaths() {
        for link in [AppLink.provider(slug: "alex-rivera"), .session(id: "ses_1"), .booking(id: "bkg_1", token: "t1"), .conversation(id: "c1"), .family(welcome: false)] {
            #expect(AppLink.parse(link.path) == (link == .family(welcome: false) ? .family(welcome: false) : link))
        }
    }
}
