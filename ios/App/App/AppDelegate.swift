import UIKit
import Capacitor
import os.log

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    // Unified-logging handle. View with: `npm run ios:logs` doesn't capture these —
    // use Console.app or `xcrun devicectl` / `log stream --predicate 'subsystem == "com.vamoverse.app"'`.
    static let log = Logger(subsystem: "com.vamoverse.app", category: "lifecycle")

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        AppDelegate.log.info("App launched (launchOptions present: \(launchOptions != nil, privacy: .public))")
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
        AppDelegate.log.debug("App will resign active")
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        AppDelegate.log.info("App entered background")
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        AppDelegate.log.debug("App will enter foreground")
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        AppDelegate.log.info("App became active")
    }

    func applicationWillTerminate(_ application: UIApplication) {
        AppDelegate.log.info("App will terminate")
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        // URLs can embed sensitive params (tokens) — mark the value private so it's
        // redacted in device logs unless explicitly enabled.
        AppDelegate.log.info("Opened via URL: \(url.absoluteString, privacy: .private)")
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        AppDelegate.log.info("Continue user activity: \(userActivity.activityType, privacy: .public)")
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

}

// UIScene lifecycle (required when built with the iOS 27 SDK; apps without a scene
// manifest crash at launch). UIKit loads Main.storyboard (one CAPBridgeViewController)
// into `window` per the Info.plist scene configuration. Links now arrive on the scene;
// Capacitor's SceneDelegateProxy (Capacitor 8.6+) hands them to plugins, holding
// cold-start links until the plugins have loaded.
class SceneDelegate: UIResponder, UIWindowSceneDelegate {

    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        AppDelegate.log.info("Scene connected (URLs: \(connectionOptions.urlContexts.count, privacy: .public), activities: \(connectionOptions.userActivities.count, privacy: .public))")
        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        for context in URLContexts {
            AppDelegate.log.info("Scene opened via URL: \(context.url.absoluteString, privacy: .private)")
        }
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        AppDelegate.log.info("Scene continue user activity: \(userActivity.activityType, privacy: .public)")
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}
