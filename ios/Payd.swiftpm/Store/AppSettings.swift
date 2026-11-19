import Foundation
import Observation

/// Non-ledger settings kept in `UserDefaults` (web PaydContext.tsx:186,263-270 `payd_ai_enabled`, plus the
/// iOS-only Payd server address the app calls the web's API routes on).
@Observable
@MainActor
final class AppSettings {
    static let aiEnabledKey = "payd_ai_enabled"
    static let serverBaseURLKey = "payd_server_base_url"

    var aiEnabled: Bool {
        didSet { defaults.set(aiEnabled, forKey: Self.aiEnabledKey) }
    }

    /// "" means offline (no server configured).
    private(set) var serverBaseURL: String

    @ObservationIgnored private let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        self.aiEnabled = defaults.object(forKey: Self.aiEnabledKey) as? Bool ?? true
        let stored = defaults.string(forKey: Self.serverBaseURLKey) ?? ""
        self.serverBaseURL = Self.validated(stored).url ?? ""
    }

    var isOnline: Bool { !serverBaseURL.isEmpty }

    var api: PaydAPI { PaydAPI(baseURL: URL(string: serverBaseURL)) }

    /// Saves the server address. Returns an error message, or nil on success. "" switches to offline.
    func setServerBaseURL(_ text: String) -> String? {
        let result = Self.validated(text)
        guard let url = result.url else { return result.error }
        serverBaseURL = url
        defaults.set(url, forKey: Self.serverBaseURLKey)
        return nil
    }

    /// "<base>/join/<id>" when a server is set, else the app's own deep link.
    func inviteURL(groupId: String) -> String {
        isOnline ? "\(serverBaseURL)/join/\(groupId)" : "payd://join/\(groupId)"
    }

    private static func validated(_ text: String) -> (url: String?, error: String?) {
        var trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        while trimmed.hasSuffix("/") { trimmed.removeLast() }
        if trimmed.isEmpty { return ("", nil) }
        guard let components = URLComponents(string: trimmed),
              let scheme = components.scheme?.lowercased(), scheme == "http" || scheme == "https",
              let host = components.host, !host.isEmpty else {
            return (nil, "Enter a full address starting with http:// or https://.")
        }
        return (trimmed, nil)
    }
}
