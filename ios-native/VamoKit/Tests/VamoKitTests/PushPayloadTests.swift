import Foundation
import Testing
@testable import VamoKit

struct PushPayloadTests {
    @Test func tappedNotificationsOpenTheirLink() {
        #expect(PushPayload.link(from: ["aps": [:], "link": "/b/bkg_1?t=abc"]) == .booking(id: "bkg_1", token: "abc"))
        #expect(PushPayload.link(from: ["link": "/sessions/ses_1"]) == .manageSession(id: "ses_1"))
        #expect(PushPayload.link(from: ["link": "/messages/cnv_1"]) == .conversation(id: "cnv_1"))
        #expect(PushPayload.link(from: ["link": NSNull()]) == .home)
        #expect(PushPayload.link(from: [:]) == .home)
        #expect(PushPayload.link(from: ["link": "/admin"]) == .web(path: "/admin"))
    }

    @Test func deviceTokensAreLowercaseHex() {
        #expect(deviceTokenHex(Data([0x00, 0xAB, 0x0F, 0xFF])) == "00ab0fff")
    }
}
