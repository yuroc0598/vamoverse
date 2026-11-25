// swift-tools-version: 6.0
// VamoKit: the native app's API client, models, and formatters. No UI; tested with `swift test`.
import PackageDescription

let package = Package(
    name: "VamoKit",
    platforms: [.iOS(.v17), .macOS(.v14)],
    products: [.library(name: "VamoKit", targets: ["VamoKit"])],
    targets: [
        .target(name: "VamoKit", resources: [.copy("Resources/strings.json"), .copy("Resources/routes.json")]),
        .testTarget(name: "VamoKitTests", dependencies: ["VamoKit"], resources: [.copy("Fixtures")]),
    ]
)
