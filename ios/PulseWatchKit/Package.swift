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
        .library(
            name: "PulseWatchKit",
            targets: ["PulseWatchAPI", "PulseWatchVault", "PulseWatchModels", "PulseWatchSync", "PulseWatchUI"]
        )
    ],
    targets: [
        .target(name: "PulseWatchModels"),
        .target(name: "PulseWatchUI"),
        .target(
            name: "PulseWatchVault",
            dependencies: ["PulseWatchModels"]
        ),
        .target(
            name: "PulseWatchAPI",
            dependencies: ["PulseWatchModels", "PulseWatchVault"]
        ),
        .target(
            name: "PulseWatchSync",
            dependencies: ["PulseWatchModels", "PulseWatchVault"]
        ),
        .testTarget(
            name: "PulseWatchKitTests",
            dependencies: ["PulseWatchAPI", "PulseWatchVault", "PulseWatchModels"]
        )
    ]
)
