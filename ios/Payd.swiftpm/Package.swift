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
                .camera(purposeString: "Payd Lens uses the camera to scan your receipts."),
                .photoLibrary(purposeString: "Payd Lens reads the receipt photo you choose so you can split the bill."),
                .microphone(purposeString: "Payd listens when you tap the mic so you can add an expense by voice."),
                .speechRecognition(purposeString: "Payd uses Apple speech recognition to turn what you say into an expense."),
                .localNetwork(purposeString: "Payd connects to your Payd server on your local network."),
                .appTransportSecurity(configuration: .init(allowsLocalNetworking: true))
            ],
            additionalInfoPlistContentFilePath: "Config/AdditionalInfo.plist"
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
            exclude: ["README.md", "Config"],
            resources: [
                .process("Resources")
            ]
        )
    ]
)
