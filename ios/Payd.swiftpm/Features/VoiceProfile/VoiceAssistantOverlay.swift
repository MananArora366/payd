import OSLog
import PaydCore
import SwiftUI

/// Port of web/src/components/voice/FloatingMicrophone.tsx: the floating "type instead" button and the
/// voice cards (listening, processing, clarification, confirmation, answer, typed fallback). Calls the web's
/// `/api/ai/interpret` and `/api/ai/query`; when the server is unreachable it runs the same built-in rules
/// the server uses with AI off (`VoiceRules`).
struct VoiceAssistantOverlay: View {
    @Environment(LedgerStore.self) private var store
    @Environment(AppRouter.self) private var router
    @Environment(AppSettings.self) private var settings

    @State private var speech = SpeechRecognizer()
    @State private var transcript = ""
    @State private var isProcessing = false
    @State private var showTypedInput = false
    @State private var typedCommand = ""
    @State private var activeIntent: VoiceIntent?
    /// New identity per intent so the cards start from fresh state.
    @State private var intentID = UUID()
    @State private var needsClarification = false
    @State private var aiQueryAnswer: String?
    @State private var voiceError: String?
    /// Full original utterance (notes may be truncated), used for clarification follow-ups.
    @State private var lastTranscript = ""
    @State private var startTask: Task<Void, Never>?

    private static let logger = Logger(subsystem: "com.payd.SwiftExpenseTracker", category: "voice")
    private static let tooLongMessage = "That request is too long. Please keep it under 2,000 characters."
    private static let notUnderstoodMessage = "Sorry, we couldn't understand that just now. Check the text below and try again."

    init() {}

    private var isRecording: Bool { speech.status == .starting || speech.status == .listening }

    private var overlayOpen: Bool {
        activeIntent != nil || aiQueryAnswer != nil || isRecording || isProcessing || showTypedInput
    }

    var body: some View {
        ZStack(alignment: .bottomTrailing) {
            keyboardButton
                .padding(.trailing, 16)
                .padding(.bottom, 96)
                .ignoresSafeArea(.keyboard)

            if overlayOpen {
                ZStack(alignment: .bottom) {
                    Rectangle()
                        .fill(.ultraThinMaterial)
                        .overlay(Color.black.opacity(0.75))
                        .ignoresSafeArea()
                        .contentShape(Rectangle())
                        .onTapGesture {}
                        .accessibilityHidden(true)
                    // Bottom-aligned like the web's `items-end`; scrolls only when a card is taller than the screen.
                    GeometryReader { proxy in
                        ScrollView {
                            cards
                                .padding(16)
                                .frame(maxWidth: .infinity, minHeight: proxy.size.height, alignment: .bottom)
                        }
                        .scrollBounceBehavior(.basedOnSize)
                        .defaultScrollAnchor(.bottom)
                        .scrollDismissesKeyboard(.interactively)
                    }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
                .transition(.opacity)
                .accessibilityElement(children: .contain)
                .accessibilityLabel("Payd voice assistant")
                .accessibilityAddTraits(.isModal)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomTrailing)
        .animation(.easeOut(duration: 0.15), value: overlayOpen)
        .onChange(of: router.voiceTriggerCount) { toggleRecording() }
        .onChange(of: speech.status) { _, status in handleSpeech(status) }
    }

    // MARK: - Cards (FloatingMicrophone.tsx:347-551)

    @ViewBuilder private var cards: some View {
        VStack(spacing: 16) {
            if isRecording { listeningCard }
            if isProcessing && !isRecording { processingCard }
            if needsClarification, let intent = activeIntent, !isProcessing {
                VoiceClarificationCard(intent: intent, onAnswer: handleClarificationAnswer) {
                    activeIntent = nil
                    needsClarification = false
                }
                .id(intentID)
                .transition(.move(edge: .bottom).combined(with: .opacity))
            }
            if !needsClarification, let intent = activeIntent, !isProcessing {
                VoiceConfirmationCard(intent: intent, categories: store.state.categories,
                                      onConfirm: { activeIntent = nil }, onCancel: { activeIntent = nil })
                    .id(intentID)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
            if let answer = aiQueryAnswer, !isProcessing { answerCard(answer) }
            if showTypedInput && !isProcessing && activeIntent == nil && aiQueryAnswer == nil && !isRecording {
                typedCard
            }
        }
    }

    private var listeningCard: some View {
        VStack(spacing: 16) {
            HStack {
                HStack(spacing: 6) {
                    VoicePingDot()
                    Text("Listening...")
                }
                .paydHeadingFont(size: 12)
                .foregroundStyle(PaydTheme.brand400)
                Spacer()
                closeButton("Stop listening") { speech.abort() }
            }

            VoiceWaveform()

            Text(speech.transcript.isEmpty
                 ? (transcript.isEmpty ? "Speak now: \"Paid 120 AED for dinner with Prakarsh split equally\"" : transcript)
                 : speech.transcript)
                .font(.payd(size: 14, italic: true))
                .foregroundStyle(PaydTheme.zinc200)
                .multilineTextAlignment(.center)
                .frame(maxWidth: .infinity, minHeight: 48)
                .padding(.horizontal, 12)

            Button("Tap when you're done", action: toggleRecording)
                .buttonStyle(VoiceProfileButtonStyle(fill: PaydTheme.brand400, text: PaydTheme.zinc950,
                                                     cornerRadius: 16, verticalPadding: 14))

            Button {
                speech.abort()
                showTypedInput = true
            } label: {
                HStack(spacing: 6) {
                    Image(systemName: "keyboard")
                        .font(.system(size: 13, weight: .medium))
                    Text("Type instead")
                }
                .font(.payd(size: 12))
                .foregroundStyle(PaydTheme.zinc400)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 8)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        }
        .padding(24)
        .frame(maxWidth: 448)
        .paydVoiceCard(stroke: PaydTheme.brand500.opacity(0.4))
        .transition(.move(edge: .bottom).combined(with: .opacity))
    }

    private var processingCard: some View {
        VStack(spacing: 16) {
            ProgressView()
                .tint(PaydTheme.brand300)
                .controlSize(.regular)
                .frame(width: 48, height: 48)
                .background(PaydTheme.brand500.opacity(0.15), in: Circle())
            VStack(spacing: 4) {
                Text("Interpreting Speech")
                    .paydHeadingFont(size: 14)
                    .foregroundStyle(.white)
                Text("Working out the details…")
                    .font(.payd(size: 12))
                    .foregroundStyle(PaydTheme.zinc400)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(24)
        .frame(maxWidth: 384)
        .paydVoiceCard(stroke: Color.white.opacity(0.1))
        .transition(.scale(scale: 0.95).combined(with: .opacity))
    }

    private func answerCard(_ answer: String) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            VStack(spacing: 0) {
                HStack {
                    HStack(spacing: 8) {
                        Image(systemName: "cpu")
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundStyle(PaydTheme.brand400)
                            .padding(6)
                            .background(PaydTheme.brand500.opacity(0.2), in: Circle())
                            .accessibilityHidden(true)
                        Text("Payd Financial Intelligence")
                            .font(.payd(size: 14, bold: true))
                            .foregroundStyle(PaydTheme.brand400)
                            .accessibilityAddTraits(.isHeader)
                    }
                    Spacer()
                    closeButton("Close answer") { aiQueryAnswer = nil }
                }
                .padding(.bottom, 8)
                Rectangle().fill(PaydTheme.border).frame(height: 1)
            }

            Text(answer)
                .font(.payd(size: 14))
                .foregroundStyle(PaydTheme.zinc200)
                .lineSpacing(4)
                .frame(maxWidth: .infinity, alignment: .leading)
                .fixedSize(horizontal: false, vertical: true)
                .padding(16)
                .background(PaydTheme.cardSubtle.opacity(0.6), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(PaydTheme.border))
                .textSelection(.enabled)

            Text("* Answer grounded in real-time ledger calculation. Gemini formats explanations only.")
                .font(.payd(size: 11, italic: true))
                .foregroundStyle(PaydTheme.zinc400)
                .fixedSize(horizontal: false, vertical: true)

            Button("Close") { aiQueryAnswer = nil }
                .buttonStyle(VoiceProfileButtonStyle(fill: PaydTheme.cardSubtle, text: .white))
        }
        .padding(24)
        .frame(maxWidth: 448)
        .paydVoiceCard(stroke: Color.white.opacity(0.1))
        .transition(.scale(scale: 0.95).combined(with: .opacity))
    }

    private var typedCard: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack {
                Text("Type instead")
                    .font(.payd(size: 14, bold: true))
                    .foregroundStyle(PaydTheme.brand400)
                    .accessibilityAddTraits(.isHeader)
                Spacer()
                closeButton("Close typed input") {
                    showTypedInput = false
                    voiceError = nil
                }
            }

            if let voiceError {
                VoiceProfileNotice(text: voiceError, tint: PaydTheme.amber500, textColor: PaydTheme.amber300)
                    .accessibilityAddTraits(.isStaticText)
            }

            VStack(spacing: 12) {
                VoiceProfileInput(placeholder: "e.g. Paid 120 AED for dinner with Prakarsh and Veer", text: $typedCommand,
                                  fill: PaydTheme.canvas, stroke: Color.white.opacity(0.1), focusColor: PaydTheme.brand500,
                                  cornerRadius: 16, verticalPadding: 12, horizontalPadding: 16,
                                  maxLength: VoiceRules.maxTextLength, accessibilityLabel: "Type your request",
                                  autoFocus: true, onSubmit: submitTyped)

                HStack(spacing: 8) {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 6) {
                            chip("Dinner 120 split", fills: "Paid 120 AED for dinner with Prakarsh and Veer")
                            chip("Spend query", fills: "How much did I spend this week?")
                            chip("Repayment", fills: "Prakarsh paid me back 80 AED")
                        }
                        .padding(.vertical, 4)
                    }
                    Button(action: submitTyped) {
                        Image(systemName: "paperplane")
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundStyle(.white)
                            .frame(width: 40, height: 40)
                            .background(PaydTheme.brand600, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                    }
                    .buttonStyle(PressScaleButtonStyle())
                    .accessibilityLabel("Send")
                }
            }
        }
        .padding(20)
        .frame(maxWidth: 448)
        .paydVoiceCard(stroke: Color.white.opacity(0.1))
        .transition(.scale(scale: 0.95).combined(with: .opacity))
    }

    private func chip(_ title: String, fills text: String) -> some View {
        Button(title) { typedCommand = text }
            .font(.payd(size: 11))
            .foregroundStyle(PaydTheme.zinc300)
            .lineLimit(1)
            .padding(.horizontal, 10)
            .padding(.vertical, 4)
            .background(PaydTheme.cardSubtle, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
            .buttonStyle(PressScaleButtonStyle())
    }

    private func closeButton(_ label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: "xmark")
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(PaydTheme.zinc400)
                .padding(4)
                .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }

    /// `fixed bottom-24 right-4` keyboard button.
    private var keyboardButton: some View {
        Button {
            voiceError = nil
            showTypedInput = true
        } label: {
            Image(systemName: "keyboard")
                .font(.system(size: 15, weight: .medium))
                .foregroundStyle(PaydTheme.zinc300)
                .frame(width: 40, height: 40)
                .background(PaydTheme.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(Color.white.opacity(0.1)))
                .shadow(color: .black.opacity(0.35), radius: 12, y: 8)
        }
        .buttonStyle(PressScaleButtonStyle())
        .accessibilityLabel("Type instead of speaking")
    }

    // MARK: - Flow (FloatingMicrophone.tsx:125-323)

    private func toggleRecording() {
        voiceError = nil
        if isRecording {
            speech.stop()
        } else {
            startTask?.cancel()
            startTask = Task { await speech.start() }
        }
    }

    private func handleSpeech(_ status: SpeechRecognizer.Status) {
        switch status {
        case .finished:
            let text = speech.transcript
            transcript = text
            Task { await processTranscript(text) }
        case let .failed(failure):
            voiceError = failure.message
            showTypedInput = true
        case .idle, .starting, .listening:
            break
        }
    }

    /// Returns true when the request was understood and a card was shown.
    @discardableResult
    private func processTranscript(_ raw: String) async -> Bool {
        guard !raw.voiceProfileTrimmed.isEmpty else { return false }
        isProcessing = true
        voiceError = nil
        transcript = raw
        lastTranscript = raw
        defer { isProcessing = false }

        guard let intent = await interpret(raw) else {
            voiceError = raw.utf16.count > VoiceRules.maxTextLength ? Self.tooLongMessage : Self.notUnderstoodMessage
            // Keep the text so the user can edit and resend it.
            typedCommand = raw
            showTypedInput = true
            return false
        }
        if intent.intent == .query {
            await handleFinancialQuery(raw)
        } else {
            intentID = UUID()
            activeIntent = intent
            needsClarification = !intent.missingFields.isEmpty
        }
        return true
    }

    /// `/api/ai/interpret`, or the server's AI-off rules on device when no server can be reached.
    private func interpret(_ raw: String) async -> VoiceIntent? {
        let context = InterpretContext.from(state: store.state)
        do {
            let response = try await settings.api.interpret(
                InterpretRequest(transcript: raw, context: context, aiEnabled: settings.aiEnabled))
            return response.intent
        } catch where error.isUnreachable {
            // Same validation as the route (lib/ai/request.ts validateText), then the deterministic parser.
            let text = raw.voiceProfileTrimmed
            guard !text.isEmpty, raw.utf16.count <= VoiceRules.maxTextLength else { return nil }
            return VoiceRules.deterministicParseIntent(text, context: context)
        } catch {
            Self.logger.error("Interpret failed: \(String(describing: error), privacy: .public)")
            return nil
        }
    }

    private func handleFinancialQuery(_ queryText: String) async {
        let dataContext = QueryDataContext.from(query: queryText, state: store.state, snapshot: store.snapshot)
        do {
            let response = try await settings.api.query(
                QueryRequest(query: queryText, dataContext: dataContext, aiEnabled: settings.aiEnabled))
            aiQueryAnswer = response.answer ?? VoiceRules.offlineQueryFallback(dataContext)
        } catch where error.isUnreachable {
            let text = queryText.voiceProfileTrimmed
            aiQueryAnswer = queryText.utf16.count <= VoiceRules.maxTextLength
                ? VoiceRules.deterministicAnswerQuery(text, context: dataContext)
                : VoiceRules.offlineQueryFallback(dataContext)
        } catch {
            Self.logger.error("Query failed: \(String(describing: error), privacy: .public)")
            aiQueryAnswer = VoiceRules.offlineQueryFallback(dataContext)
        }
    }

    private func handleClarificationAnswer(_ clarifiedText: String) {
        let base = lastTranscript.isEmpty ? (activeIntent?.notes ?? "") : lastTranscript
        let combined = "\(base) \(clarifiedText)".voiceProfileTrimmed
        needsClarification = false
        Task { await processTranscript(combined) }
    }

    private func submitTyped() {
        let text = typedCommand.voiceProfileTrimmed
        guard !text.isEmpty else { return }
        if text.utf16.count > VoiceRules.maxTextLength {
            voiceError = Self.tooLongMessage
            return
        }
        Task {
            if await processTranscript(text) {
                typedCommand = ""
                showTypedInput = false
            }
        }
    }
}

private extension View {
    /// `bg-[#18181b] border rounded-2xl shadow-2xl`.
    func paydVoiceCard(stroke: Color) -> some View {
        background(PaydTheme.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(stroke))
            .shadow(color: .black.opacity(0.5), radius: 25, y: 12)
    }
}
