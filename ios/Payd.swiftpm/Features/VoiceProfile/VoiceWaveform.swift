import SwiftUI

/// Port of web/src/components/voice/VoiceWaveform.tsx: concentric ripple orb plus a 9-bar equalizer
/// (tailwind.config.js `micRipple` 1.8 s ease-out, `barJump` 1 s ease-in-out).
struct VoiceWaveform: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var start = Date()

    private static let barHeights: [CGFloat] = [16, 34, 48, 56, 38, 52, 28, 42, 20]
    private static let barDelays: [Double] = [0.1, 0.3, 0.15, 0.4, 0.25, 0.35, 0.05, 0.2, 0.45]

    var body: some View {
        TimelineView(.animation(paused: reduceMotion)) { context in
            let t = context.date.timeIntervalSince(start)
            VStack(spacing: 16) {
                ZStack {
                    ripple(diameter: 80, opacity: 0.4, t: t, delay: 0)
                    ripple(diameter: 112, opacity: 0.3, t: t, delay: 0.5)
                    Image(systemName: "mic")
                        .font(.system(size: 22, weight: .bold))
                        .foregroundStyle(PaydTheme.zinc950)
                        .frame(width: 64, height: 64)
                        .background(PaydTheme.brand400, in: Circle())
                }
                .frame(width: 112, height: 112)

                HStack(spacing: 6) {
                    ForEach(Self.barHeights.indices, id: \.self) { index in
                        Capsule()
                            .fill(PaydTheme.brand300)
                            .frame(width: 6, height: Self.barHeights[index])
                            .scaleEffect(x: 1, y: barScale(t: t, delay: Self.barDelays[index]), anchor: .center)
                    }
                }
                .frame(height: 56)
            }
            .padding(.vertical, 8)
        }
        .accessibilityHidden(true)
    }

    private func ripple(diameter: CGFloat, opacity: Double, t: Double, delay: Double) -> some View {
        let local = t - delay
        let progress = reduceMotion || local < 0 ? 0 : local.truncatingRemainder(dividingBy: 1.8) / 1.8
        let eased = 1 - (1 - progress) * (1 - progress)
        return Circle()
            .strokeBorder(PaydTheme.brand400.opacity(opacity), lineWidth: 2)
            .frame(width: diameter, height: diameter)
            .scaleEffect(reduceMotion || local < 0 ? 1 : 0.85 + 0.5 * eased)
            .opacity(reduceMotion || local < 0 ? 1 : 0.8 * (1 - eased))
    }

    /// `barJump`: scaleY 0.3 → 1 → 0.3, ease-in-out per half; unscaled until the delay elapses.
    private func barScale(t: Double, delay: Double) -> CGFloat {
        let local = t - delay
        if reduceMotion || local < 0 { return 1 }
        let phase = local.truncatingRemainder(dividingBy: 1)
        let half = phase < 0.5 ? phase / 0.5 : (phase - 0.5) / 0.5
        let eased = 0.5 - cos(.pi * half) / 2
        return CGFloat(phase < 0.5 ? 0.3 + 0.7 * eased : 1 - 0.7 * eased)
    }
}

/// `w-2 h-2 rounded-full bg-brand-400 animate-ping`.
struct VoicePingDot: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var start = Date()

    var body: some View {
        TimelineView(.animation(paused: reduceMotion)) { context in
            let phase = reduceMotion ? 0 : context.date.timeIntervalSince(start).truncatingRemainder(dividingBy: 1)
            let progress = min(1, phase / 0.75)
            Circle()
                .fill(PaydTheme.brand400)
                .frame(width: 8, height: 8)
                .scaleEffect(1 + progress)
                .opacity(1 - progress)
        }
        .frame(width: 8, height: 8)
        .accessibilityHidden(true)
    }
}
