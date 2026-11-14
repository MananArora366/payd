import SwiftUI
import PaydCore

/// The current user's groups as web-style cards with their personal balance in each.
struct GroupsView: View {
    @Environment(LedgerStore.self) private var store

    private var groups: [PaydCore.Group] {
        LedgerQueries.groups(for: store.currentUserId, in: store.state)
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                PaydScreenTitle(title: "Groups")
                PaydSectionLabel(title: "\(groups.count) active groups")
                    .padding(.bottom, 4)

                if groups.isEmpty {
                    ContentUnavailableView("No groups yet", systemImage: "person.2",
                                           description: Text("Groups you join will show up here."))
                        .padding(.vertical, 24)
                        .paydCard(cornerRadius: 24)
                }
                ForEach(groups) { group in
                    GroupCard(group: group, state: store.state)
                }
            }
            .padding(16)
        }
        .background(PaydTheme.canvas)
    }
}

private struct GroupCard: View {
    let group: PaydCore.Group
    let state: LedgerState

    private var myBalance: Int { LedgerQueries.groupBalances(group.id, in: state)[state.currentUserId] ?? 0 }
    private var members: [User] { LedgerQueries.groupMembers(group.id, in: state) }
    private var totalSpentMinor: Int {
        state.transactions.filter { $0.groupId == group.id && !$0.isDeleted && $0.type == .expense }
            .map(\.amountMinor).reduce(0, +)
    }

    /// Same keyword → emoji mapping as the web's getGroupEmoji.
    private var emoji: String {
        let name = group.name.lowercased()
        if ["dubai", "trip", "beach"].contains(where: name.contains) { return "🌴" }
        if ["apartment", "flat", "home"].contains(where: name.contains) { return "🏙️" }
        if ["supper", "food", "dinner"].contains(where: name.contains) { return "🍷" }
        if ["coffee", "cafe"].contains(where: name.contains) { return "☕" }
        return "👥"
    }

    private var badge: (String, Color) {
        if myBalance > 0 { return ("+" + Currency.format(myBalance, currency: group.currency), PaydTheme.emerald) }
        if myBalance < 0 { return (Currency.format(myBalance, currency: group.currency), PaydTheme.rose) }
        return ("Settled", PaydTheme.violetLight)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(emoji).font(.system(size: 26))
                Spacer()
                PaydBadge(text: badge.0, tint: badge.1)
            }
            .padding(.bottom, 4)

            Text(group.name.uppercased())
                .font(.paydHeading(.subheadline))
                .tracking(1.2)
                .foregroundStyle(.white)
            if let description = group.description, !description.isEmpty {
                Text(description)
                    .font(.payd(.caption))
                    .foregroundStyle(PaydTheme.textSecondary)
                    .lineLimit(1)
            }

            Rectangle().fill(.white.opacity(0.06)).frame(height: 1).padding(.top, 6)
            HStack {
                Text("\(members.count) members").font(.payd(.caption)).foregroundStyle(PaydTheme.textSecondary)
                Spacer()
                Text(Currency.format(totalSpentMinor, currency: group.currency))
                    .font(.payd(.footnote).weight(.bold))
                    .foregroundStyle(.white)
            }
        }
        .padding(16)
        .paydCard(cornerRadius: 20)
    }
}
