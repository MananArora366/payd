// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "PaydCore",
    platforms: [.iOS("17.0"), .macOS("14.0")],
    products: [
        .library(name: "PaydCore", targets: ["PaydCore"])
    ],
    targets: [
        .target(name: "PaydCore"),
        .testTarget(name: "PaydCoreTests", dependencies: ["PaydCore"])
    ]
)
