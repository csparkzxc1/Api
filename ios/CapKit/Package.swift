// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "CapKit",
    platforms: [
        .iOS(.v17),
        .watchOS(.v10),
        .macOS(.v14)
    ],
    products: [
        .library(
            name: "CapKit",
            targets: ["CapAPI", "CapVault", "CapModels", "CapSync", "CapUI"]
        )
    ],
    targets: [
        .target(name: "CapModels"),
        .target(name: "CapUI"),
        .target(
            name: "CapVault",
            dependencies: ["CapModels"]
        ),
        .target(
            name: "CapAPI",
            dependencies: ["CapModels", "CapVault"]
        ),
        .target(
            name: "CapSync",
            dependencies: ["CapModels", "CapVault"]
        ),
        .testTarget(
            name: "CapKitTests",
            dependencies: ["CapAPI", "CapVault", "CapModels"]
        )
    ]
)
