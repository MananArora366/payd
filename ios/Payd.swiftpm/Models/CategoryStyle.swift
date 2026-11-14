import SwiftUI
import PaydCore

extension PaydCore.Category {
    private static let palette: [Color] = [.orange, .green, .blue, .purple, .indigo, .brown,
                                           .red, .pink, .teal, .cyan, .mint, .gray]

    /// Stable tint derived from the category's position in the seed catalogue.
    var color: Color {
        guard let index = SeedData.categories.firstIndex(where: { $0.id == id }) else { return .gray }
        return Self.palette[index % Self.palette.count]
    }
}
