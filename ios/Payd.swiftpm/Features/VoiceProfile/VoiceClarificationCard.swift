import PaydCore
import SwiftUI

/// Port of web/src/components/voice/ClarificationCard.tsx.
struct VoiceClarificationCard: View {
    let intent: VoiceIntent
    let onAnswer: (String) -> Void
    let onCancel: () -> Void

    @State private var answer = ""

    private var question: String {
        if let question = intent.clarificationQuestion, !question.isEmpty { return question }
        if intent.missingFields.contains("amount") { return "How much was the expense amount?" }
        if intent.missingFields.contains("participants") { return "Who would you like to split this with?" }
        return "Could you please clarify the details?"
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            header

            VStack(alignment: .leading, spacing: 8) {
                Text(question)
                    .font(.payd(size: 14))
                    .foregroundStyle(.white)
                    .fixedSize(horizontal: false, vertical: true)
                Text("Original voice command: \"\(intent.notes ?? "")\"")
                    .font(.payd(size: 12, italic: true))
                    .foregroundStyle(PaydTheme.slate400)
                    .fixedSize(horizontal: false, vertical: true)
            }

            HStack(spacing: 8) {
                VoiceProfileInput(placeholder: "e.g. 150 dirhams with Veer", text: $answer,
                                  accessibilityLabel: "Your answer", autoFocus: true, onSubmit: submit)
                Button(action: submit) {
                    Image(systemName: "arrow.right")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(.white)
                        .frame(width: 40, height: 40)
                        .background(PaydTheme.emerald600, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                        .shadow(color: .black.opacity(0.2), radius: 3, y: 2)
                }
                .buttonStyle(PressScaleButtonStyle())
                .accessibilityLabel("Send answer")
            }

            HStack {
                Spacer()
                Button("Cancel voice command", action: onCancel)
                    .font(.payd(size: 12))
                    .foregroundStyle(PaydTheme.slate400)
                    .buttonStyle(.plain)
            }
            .padding(.top, 4)
        }
        .padding(20)
        .frame(maxWidth: 512)
        .background(PaydTheme.slate900, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous)
            .strokeBorder(VoiceProfilePalette.amber800.opacity(0.6)))
        .shadow(color: .black.opacity(0.5), radius: 25, y: 12)
    }

    private var header: some View {
        VStack(spacing: 0) {
            HStack {
                HStack(spacing: 8) {
                    Image(systemName: "questionmark.circle")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(PaydTheme.amber400)
                        .padding(6)
                        .background(VoiceProfilePalette.amber950.opacity(0.6), in: Circle())
                        .accessibilityHidden(true)
                    Text("Need Quick Clarification".uppercased())
                        .font(.payd(size: 12, bold: true))
                        .tracking(0.6)
                        .foregroundStyle(PaydTheme.amber400)
                        .accessibilityAddTraits(.isHeader)
                }
                Spacer()
                Button(action: onCancel) {
                    Image(systemName: "xmark")
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundStyle(PaydTheme.slate400)
                        .padding(4)
                        .contentShape(Circle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Cancel voice command")
            }
            .padding(.bottom, 8)
            Rectangle().fill(PaydTheme.slate800).frame(height: 1)
        }
    }

    private func submit() {
        let trimmed = answer.voiceProfileTrimmed
        if !trimmed.isEmpty { onAnswer(trimmed) }
    }
}
