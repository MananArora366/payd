import SwiftUI
import PaydCore

/// Listening sheet opened by the dock mic. Turns the transcript into a draft for Add Expense.
struct VoiceCaptureView: View {
    let onDraft: (VoiceExpenseDraft) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var speech = SpeechRecognizer()
    @State private var pulse = false
    @State private var hint: String?
    /// Typed fallback (as on the web) for when speech recognition can't run.
    @State private var typedText = ""
    @FocusState private var typingFocused: Bool

    /// What "Use This" parses: the spoken transcript, else the typed text.
    private var command: String {
        speech.transcript.isEmpty ? typedText.trimmingCharacters(in: .whitespaces) : speech.transcript
    }

    private var isListening: Bool { speech.status == .listening }
    private var isStarting: Bool { speech.status == .starting }

    var body: some View {
        VStack(spacing: 20) {
            PaydSectionLabel(title: isListening ? "Listening…" : isStarting ? "Starting…" : "Voice Expense")
                .padding(.top, 28)

            ZStack {
                Circle()
                    .fill(PaydTheme.violet.opacity(0.25))
                    .frame(width: 120, height: 120)
                    .scaleEffect(isListening && pulse ? 1.25 : 0.9)
                    .opacity(isListening ? 1 : 0)
                Button(action: toggle) {
                    Image(systemName: isListening ? "stop.fill" : "mic.fill")
                        .font(.system(size: 30, weight: .bold))
                        .foregroundStyle(.white)
                        .frame(width: 84, height: 84)
                        .background(PaydTheme.violet, in: Circle())
                        .shadow(color: PaydTheme.violet.opacity(0.6), radius: 16)
                }
                .disabled(isStarting)
                .opacity(isStarting ? 0.6 : 1)
                .accessibilityLabel(isListening ? "Stop listening" : "Start listening")
            }
            .frame(height: 130)

            Text(speech.transcript.isEmpty ? "Try “coffee 22 dirhams” or “spent 120 on dinner”" : "“\(speech.transcript)”")
                .font(.payd(.title3).weight(speech.transcript.isEmpty ? .regular : .bold))
                .foregroundStyle(speech.transcript.isEmpty ? PaydTheme.textMuted : .white)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 24)

            if case let .failed(message) = speech.status {
                Text(message).font(.payd(.footnote)).foregroundStyle(PaydTheme.rose)
                    .multilineTextAlignment(.center).padding(.horizontal, 24)
                TextField("Type it instead, e.g. coffee 22 dirhams", text: $typedText)
                    .font(.payd(.subheadline))
                    .foregroundStyle(.white)
                    .focused($typingFocused)
                    .submitLabel(.done)
                    .onSubmit(finish)
                    .autocorrectionDisabled()
                    .padding(.horizontal, 14)
                    .frame(height: 44)
                    .background(PaydTheme.card, in: Capsule())
                    .overlay(Capsule().strokeBorder(typingFocused ? PaydTheme.violet.opacity(0.6) : PaydTheme.border))
                    .padding(.horizontal, 20)
            } else if let hint {
                Text(hint).font(.payd(.footnote)).foregroundStyle(PaydTheme.amber)
            }

            Spacer()

            HStack(spacing: 10) {
                Button("Cancel") { dismiss() }
                    .frame(maxWidth: .infinity, minHeight: 48)
                    .paydCard(cornerRadius: 14)
                Button("Use This", action: finish)
                    .frame(maxWidth: .infinity, minHeight: 48)
                    .background(PaydTheme.violet, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                    .disabled(command.isEmpty)
                    .opacity(command.isEmpty ? 0.5 : 1)
            }
            .font(.payd(.subheadline).weight(.bold))
            .foregroundStyle(.white)
            .buttonStyle(.plain)
            .padding(.horizontal, 20)
            .padding(.bottom, 16)
        }
        .frame(maxWidth: .infinity)
        .background(PaydTheme.canvas)
        .presentationDetents([.medium, .large])
        .task { await speech.start() }
        .onDisappear { speech.stop() }
        .onAppear {
            withAnimation(.easeInOut(duration: 0.9).repeatForever(autoreverses: true)) { pulse = true }
        }
    }

    private func toggle() {
        hint = nil
        if isListening { speech.stop() } else { Task { await speech.start() } }
    }

    private func finish() {
        speech.stop()
        let draft = VoiceExpenseParser.parse(command)
        guard !draft.title.isEmpty || draft.amountMinor != nil else {
            hint = "Didn't catch an expense. Try again or type it."
            return
        }
        onDraft(draft)
        dismiss()
    }
}
