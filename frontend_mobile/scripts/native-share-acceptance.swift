import XCTest

// The OS hosts this sheet in SharingUIService, outside Maestro 2.11.0's
// foreground-app hierarchy. Read the actual system controls; never launch or
// replace the application or sheet created by the preceding invoice journey.
final class NativeShareAcceptance: XCTestCase {
    private let application = XCUIApplication(bundleIdentifier: "com.chemisttasker.app")
    private let sharingService = XCUIApplication(bundleIdentifier: "com.apple.sharinguiservice")

    private func element(_ app: XCUIApplication, label: String) -> XCUIElement {
        app.descendants(matching: .any)
            .matching(NSPredicate(format: "label == %@", label)).firstMatch
    }

    private func hasRevisionTwoShareSheet(_ app: XCUIApplication) -> Bool {
        guard app.state == .runningForeground || app.state == .runningBackground else {
            return false
        }
        let document = app.descendants(matching: .any)
            .matching(NSPredicate(format: "label CONTAINS %@", "INV-000001-revision-2"))
            .firstMatch
        return document.exists
            && element(app, label: "Copy").isHittable
            && element(app, label: "Save to Files").isHittable
    }

    override func tearDownWithError() throws {
        let screenshot = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        screenshot.name = "revision-2-system-share-sheet"
        screenshot.lifetime = .keepAlways
        add(screenshot)
        for app in [application, sharingService] {
            guard app.state == .runningForeground || app.state == .runningBackground else {
                continue
            }
            let hierarchy = XCTAttachment(string: app.debugDescription)
            hierarchy.name = app.label + "-hierarchy"
            hierarchy.lifetime = .keepAlways
            add(hierarchy)
        }
        try super.tearDownWithError()
    }

    func testRevisionTwoPDFIsPresentedInSystemShareSheet() {
        continueAfterFailure = false
        let visible = XCTNSPredicateExpectation(
            predicate: NSPredicate { [self] _, _ in
                hasRevisionTwoShareSheet(sharingService)
                    || hasRevisionTwoShareSheet(application)
            },
            object: nil
        )
        XCTAssertEqual(
            XCTWaiter.wait(for: [visible], timeout: 30), .completed,
            "The real revision-2 PDF and actionable Copy/Save to Files controls must be visible."
        )
    }
}
