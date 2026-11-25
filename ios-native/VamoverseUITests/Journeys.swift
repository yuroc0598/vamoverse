import XCTest

/// The same journeys as the web-shell suite (scripts/e2e-ios/flows.ts), one test method per step.
/// scripts/e2e-ios/run-native.ts runs them one at a time against a throwaway server, passes the
/// data each needs (VAMO_SESSION_ID, VAMO_BOOKING_ID), and checks the database after each.
/// Each method stands on its own: it signs in as whoever it needs (Debug launch arguments).
/// xcodebuild passes TEST_RUNNER_<NAME> environment variables through as <NAME>.
final class Journeys: XCTestCase {
    private func env(_ name: String) -> String {
        guard let value = ProcessInfo.processInfo.environment[name], !value.isEmpty else {
            XCTFail("\(name) is not set (run through npm run test:ios-native)")
            return ""
        }
        return value
    }

    private var baseURL: String { ProcessInfo.processInfo.environment["VAMO_BASE_URL"] ?? "http://localhost:3101" }

    override func setUp() {
        continueAfterFailure = false
    }

    /// Every failure saves the app's element tree (types, identifiers, labels), so it's clear what
    /// was on screen, not just which query missed. run-native.ts sets VAMO_UI_TREE_FILE to a path in
    /// the results folder (the simulator can write host paths); it's also attached to the result.
    override func record(_ issue: XCTIssue) {
        var issue = issue
        let tree = MainActor.assumeIsolated { XCUIApplication().debugDescription }
        if let path = ProcessInfo.processInfo.environment["VAMO_UI_TREE_FILE"], !path.isEmpty {
            try? "\(issue.compactDescription)\n\n\(tree)".write(toFile: path, atomically: true, encoding: .utf8)
        }
        let attachment = XCTAttachment(string: tree)
        attachment.name = "App UI tree at failure"
        attachment.lifetime = .keepAlways
        issue.add(attachment)
        super.record(issue)
    }

    /// Launches the app pointed at the test server; `fresh` starts signed out, `as` signs in with
    /// the dev route, `open` opens a web path once signed in.
    @MainActor
    private func launch(fresh: Bool = false, as email: String? = nil, open path: String? = nil) -> XCUIApplication {
        let app = XCUIApplication()
        var arguments = ["-VamoBaseURL", baseURL]
        if fresh { arguments += ["-VamoResetSession", "YES"] }
        if let email { arguments += ["-VamoSignInAs", email] }
        if let path { arguments += ["-VamoOpenLink", path] }
        app.launchArguments = arguments
        app.launch()
        return app
    }

    @MainActor
    private func signIn(_ app: XCUIApplication, as email: String) {
        let field = app.textFields["signin.email"]
        XCTAssertTrue(field.waitForExistence(timeout: 15), "the sign-in form")
        field.tap()
        field.typeText(email)
        app.buttons["signin.continue"].tap()
    }

    /// Hosted pages run in Safari's view service; depending on the OS their elements show up in
    /// the app's tree or the service's. Returns the first match in either.
    @MainActor
    private func hosted(_ query: (XCUIApplication) -> XCUIElement, in app: XCUIApplication, timeout: TimeInterval) -> XCUIElement? {
        let safari = XCUIApplication(bundleIdentifier: "com.apple.SafariViewService")
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            for candidate in [query(app), query(safari)] where candidate.exists { return candidate }
            usleep(250_000)
        }
        return nil
    }

    /// Waits until `element` matches `format`. On timeout the failure says what the element actually
    /// showed, which a plain predicate expectation doesn't.
    @MainActor
    private func waitFor(_ element: XCUIElement, named name: String, _ format: String, _ args: Any..., timeout: TimeInterval = 15,
                         file: StaticString = #filePath, line: UInt = #line) {
        let predicate = NSPredicate(format: format, argumentArray: args)
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            if element.exists && predicate.evaluate(with: element) { return }
            usleep(250_000)
        }
        let actual = element.exists ? "label \"\(element.label)\", enabled \(element.isEnabled)" : "not on screen"
        XCTFail("\(name): expected \(predicate.predicateFormat) within \(Int(timeout))s; it shows \(actual)", file: file, line: line)
    }

    @MainActor
    private func text(containing fragment: String, in app: XCUIApplication) -> XCUIElement {
        app.staticTexts.containing(NSPredicate(format: "label CONTAINS %@", fragment)).firstMatch
    }

    // MARK: 1. Player signs in with the login form

    @MainActor
    func test01_PlayerSignsIn() {
        let app = launch(fresh: true)
        signIn(app, as: "maya@demo.vamoverse.app")
        XCTAssertTrue(app.navigationBars["Hi, Maya"].waitForExistence(timeout: 15), "the player home")
        for tab in ["Home", "Find", "Messages", "Profile"] { XCTAssertTrue(app.tabBars.buttons[tab].exists, "the \(tab) tab") }
        XCTAssertFalse(app.tabBars.buttons["Money"].exists, "players don't get provider tabs")

        // The session survives a relaunch (token in the Keychain).
        app.terminate()
        let again = launch()
        XCTAssertTrue(again.navigationBars["Hi, Maya"].waitForExistence(timeout: 15), "still signed in after relaunch")
    }

    // MARK: 2. Player books and pays through checkout

    @MainActor
    func test02_PlayerBooksAndPays() {
        let app = launch(as: "maya@demo.vamoverse.app", open: "/s/\(env("VAMO_SESSION_ID"))")
        let book = app.buttons["book.submit"]
        XCTAssertTrue(book.waitForExistence(timeout: 20), "the book panel")
        XCTAssertEqual(book.label, "Book and pay")
        book.tap()

        // Stripe Checkout in production; the dev payment simulator here. Both open in Safari.
        guard let complete = hosted({ $0.buttons["Complete"] }, in: app, timeout: 30) else { return XCTFail("the checkout page") }
        complete.tap()
        // The simulator redirects to the web booking page; close Safari to return to the app.
        XCTAssertNotNil(hosted({ $0.staticTexts.containing(NSPredicate(format: "label CONTAINS %@", "booked")).firstMatch }, in: app, timeout: 30), "the paid booking page")
        guard let done = hosted({ $0.buttons["Done"] }, in: app, timeout: 10) else { return XCTFail("Safari's Done button") }
        done.tap()

        let headline = app.descendants(matching: .any)["booking.headline"]
        XCTAssertTrue(headline.waitForExistence(timeout: 20), "the booking screen")
        waitFor(headline, named: "booking headline", "label BEGINSWITH %@", "You’re booked")
        XCTAssertEqual(app.staticTexts["booking.payment"].label, "Paid $60.")
    }

    // MARK: 3. Player cancels and is refunded per the policy

    @MainActor
    func test03_PlayerCancels() {
        let app = launch(as: "maya@demo.vamoverse.app", open: "/b/\(env("VAMO_BOOKING_ID"))")
        let cancel = app.buttons["booking.cancel"]
        XCTAssertTrue(cancel.waitForExistence(timeout: 20), "the cancel button")
        cancel.tap()
        let confirm = app.alerts.buttons["Cancel booking"]
        XCTAssertTrue(confirm.waitForExistence(timeout: 5), "the confirmation")
        confirm.tap()

        let headline = app.descendants(matching: .any)["booking.headline"]
        waitFor(headline, named: "booking headline", "label BEGINSWITH %@", "Cancelled")
        // A late cancel keeps the payment line and shows the partial refund on it.
        let payment = app.staticTexts["booking.payment"]
        if payment.exists { XCTAssertTrue(payment.label.contains("refunded"), "refund on the booking: \(payment.label)") }
    }

    // MARK: 4. Player books a pay-after lesson with a saved card

    @MainActor
    func test04_PlayerBooksPayAfter() {
        let app = launch(as: "maya@demo.vamoverse.app", open: "/s/\(env("VAMO_SESSION_ID"))")
        let book = app.buttons["book.submit"]
        XCTAssertTrue(book.waitForExistence(timeout: 20), "the book panel")
        XCTAssertEqual(book.label, "Book (pay after)")
        book.tap()
        // The card saved in journey 2 is used: no checkout, straight to the booking.
        let headline = app.descendants(matching: .any)["booking.headline"]
        XCTAssertTrue(headline.waitForExistence(timeout: 20), "the booking screen")
        waitFor(headline, named: "booking headline", "label CONTAINS %@", "charged after the session")
    }

    /// Waits for the error toast and returns its text (the server's message).
    @MainActor
    private func toastText(_ app: XCUIApplication) -> String {
        let toast = app.buttons["toast"]
        XCTAssertTrue(toast.waitForExistence(timeout: 15), "the error toast")
        return toast.label
    }

    /// Scrolls a form until the element is on screen (long forms), then returns it.
    @MainActor
    private func scrolledTo(_ element: XCUIElement, in app: XCUIApplication) -> XCUIElement {
        var tries = 0
        while !element.isHittable && tries < 8 { app.swipeUp(); tries += 1 }
        return element
    }

    // MARK: 5. Coach adds a student to the next lesson slot

    @MainActor
    func test05_CoachAddsStudent() {
        let app = launch(as: "alex@demo.vamoverse.app", open: "/sessions/\(env("VAMO_SESSION_ID"))")
        let picker = app.buttons["manage.addPlayer.picker"]
        XCTAssertTrue(picker.waitForExistence(timeout: 20), "the add-a-student picker")
        scrolledTo(picker, in: app).tap()
        let sarah = app.buttons["Sarah Patel"]
        XCTAssertTrue(sarah.waitForExistence(timeout: 5), "Sarah in the picker")
        sarah.tap()
        let weekly = app.switches["manage.addPlayer.weekly"]
        if weekly.exists, (weekly.value as? String) == "1" { weekly.tap() }
        scrolledTo(app.buttons["manage.addPlayer.add"], in: app).tap()
        let alert = app.alerts.firstMatch
        XCTAssertTrue(alert.waitForExistence(timeout: 15), "the confirmation")
        XCTAssertTrue(alert.label.hasPrefix("Added to"), "alert: \(alert.label)")
        alert.buttons["OK"].tap()
    }

    // MARK: 6. Coach cannot move a booked lesson onto another booked one

    @MainActor
    func test06_CoachCannotOverlap() {
        let app = launch(as: "alex@demo.vamoverse.app", open: "/sessions/\(env("VAMO_SESSION_ID"))")
        XCTAssertTrue(app.buttons["manage.addPlayer.picker"].waitForExistence(timeout: 20), "the session screen")
        // The edit section is below the fold, and the list only builds rows as they scroll in.
        let time = scrolledTo(app.datePickers["manage.time"], in: app)
        XCTAssertTrue(time.exists, "the time picker")
        time.tap()
        // Lesson slots start on the hour; :30 overlaps the next slot, which is booked (step 5).
        let minutes = app.pickerWheels.element(boundBy: 1)
        XCTAssertTrue(minutes.waitForExistence(timeout: 5), "the minute wheel")
        minutes.adjust(toPickerWheelValue: "30")
        app.navigationBars.firstMatch.tap() // close the picker
        scrolledTo(app.buttons["manage.save"], in: app).tap()
        let message = toastText(app)
        XCTAssertTrue(message.contains("overlaps another booked session"), "toast: \(message)")
    }

    // MARK: 7. Coach imports contacts as invites only

    @MainActor
    func test07_CoachImportsContacts() {
        let run = env("VAMO_RUN")
        let app = launch(as: "alex@demo.vamoverse.app", open: "/crew")
        let field = app.textFields["crew.import.text"].exists ? app.textFields["crew.import.text"] : app.textViews["crew.import.text"]
        XCTAssertTrue(field.waitForExistence(timeout: 20), "the paste field")
        scrolledTo(field, in: app).tap()
        let lines = ["Ella \(run), ella.\(run)@example.com", "Maya Lookup \(run), maya@demo.vamoverse.app", "Ray \(run), +1 415 555 \(env("VAMO_PHONE_SUFFIX"))"]
        field.typeText(lines.joined(separator: "\n"))
        // The server's preview counts the lines first, as the web does ("Save 3 invites").
        let save = app.buttons["crew.import.save"]
        waitFor(save, named: "save button", "label == %@ AND isEnabled == true", "Save 3 invites")
        scrolledTo(save, in: app).tap()
        let alert = app.alerts.firstMatch
        XCTAssertTrue(alert.waitForExistence(timeout: 15), "the confirmation")
        XCTAssertTrue(alert.label.hasPrefix("Saved 3 invites"), "alert: \(alert.label)")
        alert.buttons["OK"].tap()
        XCTAssertTrue(text(containing: "Maya Lookup \(run)", in: app).waitForExistence(timeout: 10), "the invite list")
    }

    // MARK: 8. Coach with booked sessions cannot delete the account

    @MainActor
    func test08_CoachCannotDeleteAccount() {
        let app = launch(as: "alex@demo.vamoverse.app", open: "/settings/account")
        XCTAssertTrue(app.switches["account.notifyPush"].waitForExistence(timeout: 20), "the account screen")
        // Delete is at the bottom; the list only builds rows as they scroll in.
        let delete = scrolledTo(app.buttons["account.delete"], in: app)
        XCTAssertTrue(delete.exists, "the delete button")
        delete.tap()
        let confirmField = app.alerts.textFields.firstMatch
        XCTAssertTrue(confirmField.waitForExistence(timeout: 5), "the DELETE prompt")
        confirmField.typeText("DELETE")
        app.alerts.buttons["Delete"].tap()
        let message = toastText(app)
        XCTAssertTrue(message.contains("Cancel your upcoming booked sessions first"), "toast: \(message)")
    }

    // MARK: 9. Parent cannot remove a junior with an upcoming booking

    @MainActor
    func test09_ParentCannotRemoveJunior() {
        let app = launch(as: "dave@demo.vamoverse.app", open: "/settings/family")
        let remove = app.buttons["family.remove"].firstMatch
        XCTAssertTrue(remove.waitForExistence(timeout: 20), "Leo on the Family screen")
        remove.tap()
        let confirm = app.alerts.buttons["Remove"]
        XCTAssertTrue(confirm.waitForExistence(timeout: 5), "the confirmation")
        confirm.tap()
        // The server refuses (409); its message is shown as is.
        let toast = app.buttons["toast"]
        XCTAssertTrue(toast.waitForExistence(timeout: 15), "the error toast")
        XCTAssertTrue(toast.label.contains("Cancel this junior’s upcoming bookings first"), "toast: \(toast.label)")
        XCTAssertTrue(app.staticTexts["Leo Kim"].exists || app.otherElements["Leo Kim"].exists || remove.exists, "Leo is still listed")
    }
}
