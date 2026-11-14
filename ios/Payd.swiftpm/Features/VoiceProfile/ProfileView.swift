import PaydCore
import SwiftUI

/// Port of web/src/components/profile/ProfileView.tsx (validation: `ProfileForm`, port of profileForm.ts),
/// plus the iOS-only "Payd server" card (SPEC §4.6): the app calls the web's API routes on that address.
struct ProfileView: View {
    @Environment(LedgerStore.self) private var store
    @Environment(AppSettings.self) private var settings

    @State private var didLoad = false
    @State private var budgetMajor = ""
    @State private var name = ""
    @State private var saveMessage: String?
    @State private var saveToken = UUID()
    @State private var nameError: String?
    @State private var budgetError: String?

    @State private var serverText = ""
    @State private var serverError: String?
    @State private var serverMessage: String?
    @State private var serverToken = UUID()

    private static let ledgerCurrency = "AED"

    init() {}

    var body: some View {
        VStack(alignment: .leading, spacing: 24) {
            ScreenTitle("User profile & settings", subtitle: "Manage your budget, currency and privacy")

            if let saveMessage {
                savedBanner(saveMessage)
            }

            profileCard
            aiCard
            serverCard
            privacyCard
        }
        .frame(maxWidth: 672)
        .frame(maxWidth: .infinity)
        .padding(.bottom, 112)
        .onAppear(perform: load)
    }

    // MARK: - Profile card

    private var profileCard: some View {
        let user = store.currentUser
        return VStack(alignment: .leading, spacing: 20) {
            HStack(spacing: 16) {
                VoiceProfileAvatar(user: user, size: 64, cornerRadius: 16)
                    .padding(2)
                    .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).strokeBorder(PaydTheme.brand500, lineWidth: 2))
                VStack(alignment: .leading, spacing: 2) {
                    Text(user.name)
                        .paydHeadingFont(size: 16)
                        .foregroundStyle(.white)
                    Text(user.email)
                        .font(.payd(size: 12))
                        .foregroundStyle(PaydTheme.zinc400)
                    Text("Verified Ledger Account")
                        .paydHeadingFont(size: 10)
                        .foregroundStyle(PaydTheme.brand300)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 2)
                        .background(PaydTheme.brand500.opacity(0.2), in: Capsule())
                        .overlay(Capsule().strokeBorder(PaydTheme.brand500.opacity(0.3)))
                        .padding(.top, 4)
                }
            }

            VStack(alignment: .leading, spacing: 16) {
                VStack(alignment: .leading, spacing: 4) {
                    FieldLabel("Display name")
                    VoiceProfileInput(placeholder: "", text: Binding(get: { name }, set: { value in
                        name = value
                        nameError = nil
                    }), fill: PaydTheme.canvas, stroke: Color.white.opacity(0.1), focusColor: PaydTheme.brand500,
                    isError: nameError != nil, maxLength: 60, accessibilityLabel: "Display name")
                    .textContentType(.name)
                    if let nameError { VoiceProfileFieldError(text: nameError) }
                }

                VStack(alignment: .leading, spacing: 4) {
                    FieldLabel("Default currency")
                    HStack {
                        Text("AED - UAE Dirham (د.إ)")
                            .font(.payd(size: 14))
                            .foregroundStyle(PaydTheme.zinc300)
                        Spacer()
                        Image(systemName: "chevron.down")
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundStyle(PaydTheme.zinc500)
                    }
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                    .background(PaydTheme.canvas, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(Color.white.opacity(0.1)))
                    .opacity(0.8)
                    .accessibilityElement(children: .combine)
                    .accessibilityLabel("Default currency")
                    .accessibilityValue("AED - UAE Dirham")
                    .accessibilityHint("AED only for now. Multi-currency is coming soon.")
                    Text("AED only for now. Multi-currency is coming soon.")
                        .font(.payd(size: 10))
                        .foregroundStyle(PaydTheme.zinc500)
                }

                VStack(alignment: .leading, spacing: 4) {
                    FieldLabel("Monthly budget limit")
                    VoiceProfileInput(placeholder: "", text: Binding(get: { budgetMajor }, set: { value in
                        budgetMajor = value
                        budgetError = nil
                    }), kind: .decimal, fill: PaydTheme.canvas, stroke: Color.white.opacity(0.1),
                    focusColor: PaydTheme.brand500, isError: budgetError != nil, bold: true,
                    prefix: Self.ledgerCurrency, prefixColor: PaydTheme.brand400,
                    accessibilityLabel: "Monthly budget limit")
                    if let budgetError { VoiceProfileFieldError(text: budgetError) }
                }

                Button("Save Profile Settings", action: save)
                    .buttonStyle(PaydPrimaryButtonStyle(height: 44))
            }
            .padding(.top, 16)
            .overlay(alignment: .top) { Rectangle().fill(PaydTheme.border).frame(height: 1) }
        }
        .paydCard(padding: 24)
        .shadow(color: .black.opacity(0.15), radius: 4, y: 2)
    }

    private func savedBanner(_ text: String) -> some View {
        VoiceProfileNotice(text: text, tint: PaydTheme.emerald500, textColor: PaydTheme.emerald400,
                           systemName: "checkmark.circle", bold: true, cornerRadius: 16, fillOpacity: 0.15)
            .accessibilityAddTraits(.isStaticText)
            .task(id: saveToken) {
                try? await Task.sleep(for: .seconds(2.5))
                guard !Task.isCancelled else { return }
                saveMessage = nil
            }
    }

    // MARK: - AI card

    private var aiCard: some View {
        HStack(alignment: .top, spacing: 16) {
            HStack(alignment: .top, spacing: 12) {
                IconTile(systemName: "cpu", tint: PaydTheme.brand300, size: 32, iconSize: 15, cornerRadius: 12)
                VStack(alignment: .leading, spacing: 4) {
                    Text("AI features")
                        .paydHeadingFont(size: 14)
                        .foregroundStyle(.white)
                    Text(settings.aiEnabled
                         ? "Claude reads receipt photos in Payd Lens (including blurry ones), understands what you say and answers questions about your balances."
                         : "Off. Payd Lens uses on-device text recognition, and voice input and questions use built-in rules. Nothing is sent to an AI model.")
                        .font(.payd(size: 12))
                        .foregroundStyle(PaydTheme.zinc400)
                        .lineSpacing(3)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            Spacer(minLength: 0)
            aiSwitch
        }
        .paydCard(padding: 20)
    }

    private var aiSwitch: some View {
        let isOn = settings.aiEnabled
        return Button {
            settings.aiEnabled.toggle()
        } label: {
            ZStack(alignment: .leading) {
                Capsule()
                    .fill(isOn ? PaydTheme.brand400 : PaydTheme.zinc800)
                    .overlay(Capsule().strokeBorder(isOn ? PaydTheme.brand400 : Color.white.opacity(0.1)))
                Circle()
                    .fill(isOn ? PaydTheme.card : PaydTheme.zinc400)
                    .frame(width: 16, height: 16)
                    .offset(x: isOn ? 24 : 4)
            }
            .frame(width: 44, height: 24)
            .animation(.easeOut(duration: 0.15), value: isOn)
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("AI features")
        .accessibilityValue(isOn ? "On" : "Off")
        .accessibilityAddTraits(.isToggle)
    }

    // MARK: - Payd server card (iOS only)

    private var serverCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top, spacing: 12) {
                IconTile(systemName: "server.rack", tint: PaydTheme.brand300, size: 32, iconSize: 15, cornerRadius: 12)
                VStack(alignment: .leading, spacing: 4) {
                    Text("Payd server")
                        .paydHeadingFont(size: 14)
                        .foregroundStyle(.white)
                    Text("Payd Lens, voice and Careem features use your Payd web server. Leave empty to work offline with on-device recognition.")
                        .font(.payd(size: 12))
                        .foregroundStyle(PaydTheme.zinc400)
                        .lineSpacing(3)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }

            HStack(spacing: 8) {
                VoiceProfileInput(placeholder: "https://your-payd-server.example", text: Binding(get: { serverText }, set: { value in
                    serverText = value
                    serverError = nil
                }), kind: .url, fill: PaydTheme.canvas, stroke: Color.white.opacity(0.1), focusColor: PaydTheme.brand500,
                isError: serverError != nil, accessibilityLabel: "Payd server address", onSubmit: saveServer)
                Button("Save", action: saveServer)
                    .buttonStyle(VoiceProfileButtonStyle(fill: PaydTheme.brand400, text: PaydTheme.zinc950,
                                                         fullWidth: false))
            }

            if let serverError { VoiceProfileFieldError(text: serverError) }
            if let serverMessage {
                VoiceProfileNotice(text: serverMessage, tint: PaydTheme.emerald500, textColor: PaydTheme.emerald400,
                                   systemName: "checkmark.circle", bold: true, fillOpacity: 0.15)
                    .task(id: serverToken) {
                        try? await Task.sleep(for: .seconds(2.5))
                        guard !Task.isCancelled else { return }
                        self.serverMessage = nil
                    }
            }
        }
        .paydCard(padding: 20)
    }

    // MARK: - Privacy card

    private var privacyCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 8) {
                IconTile(systemName: "lock", tint: PaydTheme.brand400, size: 32, iconSize: 15, cornerRadius: 12)
                Text("Privacy & accuracy")
                    .paydHeadingFont(size: 12)
                    .foregroundStyle(.white)
                    .accessibilityAddTraits(.isHeader)
            }
            VStack(alignment: .leading, spacing: 8) {
                privacyLine("🔒 ", "Audio is processed in real time and never stored",
                            ": Your microphone audio is processed on-device or streamed for ephemeral transcript extraction. Payd never saves voice recordings.")
                privacyLine("⚡ ", "AI only reads, never counts",
                            ": AI helps understand what you say and what is on your receipts. It never calculates balances or changes your records on its own; every amount is worked out by Payd and shown to you before it is saved.")
                privacyLine("💎 ", "Exact to the fils",
                            ": Splits are calculated to the exact fils or cent, so shares always add up to the full bill with nothing lost to rounding.")
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .paydCard(padding: 20)
        .shadow(color: .black.opacity(0.1), radius: 1, y: 1)
    }

    private func privacyLine(_ emoji: String, _ strong: String, _ rest: String) -> some View {
        (Text(emoji) + Text(strong).font(.payd(size: 12, bold: true)).foregroundStyle(.white) + Text(rest))
            .font(.payd(size: 12))
            .foregroundStyle(PaydTheme.zinc400)
            .lineSpacing(3)
            .fixedSize(horizontal: false, vertical: true)
    }

    // MARK: - Actions

    private func load() {
        guard !didLoad else { return }
        didLoad = true
        let user = store.currentUser
        name = user.name
        budgetMajor = LedgerQueries.monthlyBudget(for: user.id, in: store.state)
            .map { Currency.minorToMajorPlainString($0.limitMinor) } ?? "5000"
        serverText = settings.serverBaseURL
    }

    /// ProfileView.tsx `handleSaveSettings`.
    private func save() {
        let result = ProfileForm.validate(name: name, budgetText: budgetMajor)
        nameError = result.nameError
        budgetError = result.budgetError
        guard result.nameError == nil, result.budgetError == nil else {
            saveMessage = nil
            return
        }
        let trimmed = name.voiceProfileTrimmed
        store.updateBudget(limitMinor: result.budgetMinor, categoryId: nil)
        store.updateUserProfile(UserProfileUpdate(name: trimmed, defaultCurrency: Self.ledgerCurrency))
        name = trimmed
        saveToken = UUID()
        saveMessage = "Profile settings saved."
    }

    private func saveServer() {
        serverMessage = nil
        if let error = settings.setServerBaseURL(serverText) {
            serverError = error
            return
        }
        serverError = nil
        serverText = settings.serverBaseURL
        serverToken = UUID()
        serverMessage = "Server address saved."
    }
}
