// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "PulseWatchKit",
    platforms: [
        .iOS(.v17),
        .watchOS(.v10),
        .macOS(.v14)
    ],
    products: [
        .library(name: "PulseWatchKit", targets: ["PulseWatchAPI", "PulseWatchVault", "PulseWatchModels"])
    ],
    targets: [
        .target(name: "PulseWatchModels"),
        .target(
            name: "PulseWatchVault",
            dependencies: ["PulseWatchModels"]
        ),
        .target(
            name: "PulseWatchAPI",
            dependencies: ["PulseWatchModels", "PulseWatchVault"]
        ),
        .testTarget(
            name: "PulseWatchKitTests",
            dependencies: ["PulseWatchAPI", "PulseWatchVault", "PulseWatchModels"]
        )
    ]
)
