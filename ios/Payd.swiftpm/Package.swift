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
            teamIdentifier: "8WJHXBCT98",
            displayVersion: "1.0",
            bundleVersion: "1",
            supportedDeviceFamilies: [.phone, .pad],
            supportedInterfaceOrientations: [.portrait],
            capabilities: [
                .microphone(purposeString: "Payd listens when you tap the mic so you can add an expense by voice."),
                .speechRecognition(purposeString: "Payd uses Apple speech recognition to turn what you say into an expense.")
            ]
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
            path: ".",
            resources: [
                .process("Resources")
            ]
        )
    ]
)
