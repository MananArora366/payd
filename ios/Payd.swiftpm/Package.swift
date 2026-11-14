// swift-tools-version: 5.9
import PackageDescription
import AppleProductTypes

let package = Package(
    name: "SwiftExpenseTracker",
    platforms: [
        .iOS("17.0")
    ],
    products: [
        .iOSApplication(
            name: "SwiftExpenseTracker",
            targets: ["AppModule"],
            bundleIdentifier: "com.payd.SwiftExpenseTracker",
            displayVersion: "1.0",
            bundleVersion: "1",
            supportedDeviceFamilies: [.phone, .pad],
            supportedInterfaceOrientations: [.portrait]
        )
    ],
    dependencies: [
        .package(path: "../PaydCore")
    ],
    targets: [
        .executableTarget(
            name: "AppModule",
            dependencies: [
                .product(name: "PaydCore", package: "PaydCore")
            ],
            path: "."
        )
    ]
)
