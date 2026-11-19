import SwiftUI

/// One wheel slice (FairPayerRouletteModal.tsx `sliceWeights`).
struct RouletteSlice: Equatable {
    let userId: String
    let firstName: String
    let weight: Int
}

/// The 260 pt canvas wheel of FairPayerRouletteModal.tsx:117-195 (slices start at 3 o'clock and run clockwise),
/// rotated by `rotation` degrees with the web's 4 s cubic-bezier(0.15, 0.9, 0.2, 1) transition.
struct RouletteWheel: View {
    let slices: [RouletteSlice]
    let showsBoost: Bool
    let rotation: Double

    static let size: CGFloat = 260
    static let sliceColors: [Color] = [
        Color(hex: 0x10b981), Color(hex: 0x06b6d4), Color(hex: 0x3b82f6), Color(hex: 0xa1a1aa),
        Color(hex: 0xf59e0b), Color(hex: 0xec4899), Color(hex: 0x14b8a6), Color(hex: 0xf97316),
    ]
    private static let strokeColor = Color(hex: 0x0f172a)
    private static let hubRing = Color(hex: 0x38bdf8)
    private static let boostColor = Color(hex: 0xfef08a)

    var body: some View {
        VStack(spacing: -12) {
            pointer.zIndex(1)
            Canvas { context, size in draw(in: &context, size: size) }
                .frame(width: Self.size, height: Self.size)
                .clipShape(Circle())
                .shadow(color: .black.opacity(0.25), radius: 25, y: 25)
                .rotationEffect(.degrees(rotation))
                .accessibilityHidden(true)
        }
    }

    /// `border-t-[16px] border-t-amber-500` downward triangle, 20 pt wide.
    private var pointer: some View {
        Path { path in
            path.move(to: .zero)
            path.addLine(to: CGPoint(x: 20, y: 0))
            path.addLine(to: CGPoint(x: 10, y: 16))
            path.closeSubpath()
        }
        .fill(PaydTheme.amber500)
        .frame(width: 20, height: 16)
        .shadow(color: .black.opacity(0.15), radius: 3, y: 2)
    }

    private func draw(in context: inout GraphicsContext, size: CGSize) {
        let center = CGPoint(x: size.width / 2, y: size.height / 2)
        let radius = size.width / 2 - 8
        let totalWeight = slices.reduce(0) { $0 + $1.weight }
        guard !slices.isEmpty, totalWeight > 0 else { return }

        var start = 0.0
        for (index, slice) in slices.enumerated() {
            let span = Double(slice.weight) / Double(totalWeight) * 2 * Double.pi
            var path = Path()
            path.move(to: center)
            path.addRelativeArc(center: center, radius: radius, startAngle: .radians(start), delta: .radians(span))
            path.closeSubpath()
            context.fill(path, with: .color(Self.sliceColors[index % Self.sliceColors.count]))
            context.stroke(path, with: .color(Self.strokeColor), lineWidth: 2)
            drawLabel(slice, in: context, center: center, radius: radius, angle: start + span / 2)
            start += span
        }
        drawHub(in: &context, center: center)
    }

    private func drawLabel(_ slice: RouletteSlice, in context: GraphicsContext, center: CGPoint, radius: CGFloat,
                           angle: Double) {
        var label = context
        label.translateBy(x: center.x, y: center.y)
        label.rotate(by: .radians(angle))
        label.addFilter(.shadow(color: .black.opacity(0.4), radius: 2))
        let name = Text(slice.firstName).font(.system(size: 12, weight: .bold)).foregroundStyle(Color.white)
        label.draw(name, at: CGPoint(x: radius - 18, y: 0), anchor: .trailing)
        if showsBoost && slice.weight > 1 {
            let boost = Text("+\(slice.weight - 1)x").font(.system(size: 9, weight: .bold))
                .foregroundStyle(Self.boostColor)
            label.draw(boost, at: CGPoint(x: radius - 18, y: 13), anchor: .trailing)
        }
    }

    private func drawHub(in context: inout GraphicsContext, center: CGPoint) {
        let hub = Path(ellipseIn: CGRect(x: center.x - 24, y: center.y - 24, width: 48, height: 48))
        context.fill(hub, with: .color(Self.strokeColor))
        context.stroke(hub, with: .color(Self.hubRing), lineWidth: 3)
        context.draw(Text("☕").font(.system(size: 14)), at: center, anchor: .center)
    }
}
