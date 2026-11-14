import PaydCore
import SwiftUI

/// Wrapping row for the web's `flex flex-wrap gap-*` button groups (GroupsView.tsx:338, FairPayerRouletteModal.tsx:493).
struct GroupsFlowLayout: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let rows = arrange(subviews: subviews, maxWidth: proposal.width ?? .infinity)
        let width = rows.map(\.width).max() ?? 0
        let height = rows.map(\.height).reduce(0, +) + spacing * CGFloat(max(0, rows.count - 1))
        return CGSize(width: proposal.width ?? width, height: height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var y = bounds.minY
        for row in arrange(subviews: subviews, maxWidth: bounds.width) {
            var x = bounds.minX
            for index in row.indices {
                let size = subviews[index].sizeThatFits(.unspecified)
                subviews[index].place(at: CGPoint(x: x, y: y + (row.height - size.height) / 2),
                                      proposal: ProposedViewSize(size))
                x += size.width + spacing
            }
            y += row.height + spacing
        }
    }

    private struct Row {
        var indices: [Int] = []
        var width: CGFloat = 0
        var height: CGFloat = 0
    }

    private func arrange(subviews: Subviews, maxWidth: CGFloat) -> [Row] {
        var rows: [Row] = []
        var current = Row()
        for index in subviews.indices {
            let size = subviews[index].sizeThatFits(.unspecified)
            let needed = current.indices.isEmpty ? size.width : current.width + spacing + size.width
            if !current.indices.isEmpty && needed > maxWidth {
                rows.append(current)
                current = Row()
            }
            current.width = current.indices.isEmpty ? size.width : current.width + spacing + size.width
            current.height = max(current.height, size.height)
            current.indices.append(index)
        }
        if !current.indices.isEmpty { rows.append(current) }
        return rows
    }
}

/// Text colour of a signed balance (`text-[#10B981]` / `text-[#F43F5E]` / zero colour).
enum GroupsBalanceStyle {
    static func color(_ minor: Int, zero: Color) -> Color {
        minor > 0 ? PaydTheme.emerald500 : minor < 0 ? PaydTheme.rose500 : zero
    }

    /// `{bal > 0 ? '+' : ''}{formatMinorUnits(bal, 'AED')}`.
    static func signed(_ minor: Int) -> String {
        (minor > 0 ? "+" : "") + Currency.format(minor, currency: "AED")
    }
}

/// `{user.name} {isMe ? '(You)' : ''}` without the trailing space.
func groupsNameWithYou(_ user: User?, currentUserId: String) -> String {
    guard let user else { return "" }
    return user.id == currentUserId ? "\(user.name) (You)" : user.name
}
