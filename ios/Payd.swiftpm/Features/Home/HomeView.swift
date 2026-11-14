import PaydCore
import SwiftUI

/// Port of web/src/components/home/HomeView.tsx: hero balance, settle-up card, groups carousel, quick actions,
/// analytics, recurring bills and recent activity. The root ScrollView supplies the vertical scrolling and the
/// bottom padding that clears the dock (web `pb-28`).
struct HomeView: View {
    @Environment(LedgerStore.self) private var store
    @Environment(AppRouter.self) private var router

    init() {}

    var body: some View {
        VStack(alignment: .leading, spacing: 24) {
            HomeHeroCard()
            HomeSettleUpCard(onOpenSettleUp: { router.navigate(.settlements) })
            groupsCarousel
            quickActions
            HomeCashFlowAnalyticsCard(onNavigateSettlements: { router.navigate(.settlements) })
            HomeCategoryBreakdownCard(onNavigateTransactions: { router.navigate(.transactions) })
            RecurringBillsSection(groupId: nil)
            HomeRecentActivity()
        }
    }

    // MARK: Active groups (HomeView.tsx:161-225)

    private var groupsCarousel: some View {
        let groups = store.state.groups
        return VStack(alignment: .leading, spacing: 12) {
            SectionHeading("Active groups", actionTitle: "See all (\(groups.count)) \u{2192}") {
                router.navigate(.groups)
            }
            .padding(.horizontal, 4)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 12) {
                    ForEach(groups) { group in
                        HomeGroupCard(group: group) { router.openGroup(group.id) }
                    }
                }
                .scrollTargetLayout()
                .padding(.bottom, 8)
            }
            .scrollTargetBehavior(.viewAligned)
        }
    }

    // MARK: Quick actions (HomeView.tsx:227-262)

    private var quickActions: some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionHeading("Quick actions")
                .padding(.horizontal, 4)
            HStack(alignment: .top, spacing: 10) {
                HomeQuickActionButton(systemName: "cup.and.saucer", tint: PaydTheme.amber400, fill: PaydTheme.amber500,
                                      title: "Roulette", subtitle: "Who pays coffee?") {
                    router.present(.roulette(defaultGroupId: nil))
                }
                HomeQuickActionButton(systemName: "camera", tint: PaydTheme.emerald400, fill: PaydTheme.emerald500,
                                      title: "Payd Lens", subtitle: "Split a receipt") {
                    router.present(.receiptScanner)
                }
            }
        }
    }
}

// MARK: - Hero balance card (HomeView.tsx:94-156)

private struct HomeHeroCard: View {
    @Environment(LedgerStore.self) private var store
    @Environment(AppRouter.self) private var router

    var body: some View {
        let snapshot = store.snapshot
        let user = store.currentUser
        let net = snapshot.userNetBalance
        VStack(alignment: .leading, spacing: 0) {
            Text("Total net balance")
                .paydHeadingFont(size: 11)
                .tracking(11 * 0.05)
                .foregroundStyle(PaydTheme.brand100)
                .padding(.bottom, 8)

            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text((net > 0 ? "+" : net < 0 ? "-" : "") + Self.stripCurrencyCode(Currency.format(abs(net), currency: user.defaultCurrency)))
                    .font(.payd(size: 30, bold: true))
                    .tracking(30 * -0.025)
                    .monospacedDigit()
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
                Text(user.defaultCurrency)
                    .font(.payd(size: 14, bold: true))
                    .foregroundStyle(PaydTheme.brand100)
            }
            .foregroundStyle(.white)

            Text(subtitle(snapshot))
                .font(.payd(size: 12))
                .foregroundStyle(.white.opacity(0.8))
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 4)

            Rectangle().fill(.white.opacity(0.2)).frame(height: 1).padding(.vertical, 16)

            HStack(alignment: .center, spacing: 12) {
                metric(dot: PaydTheme.lime300, label: "Owed to you",
                       value: "+" + Currency.format(snapshot.userOwedToMe, currency: user.defaultCurrency))
                Spacer(minLength: 0)
                metric(dot: PaydTheme.rose500, label: "You owe",
                       value: "-" + Currency.format(snapshot.userIOwe, currency: user.defaultCurrency))
            }

            buttons.padding(.top, 20)
        }
        .padding(24)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(PaydTheme.brandHero, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    /// HomeView.tsx:69-77 (the group count is every group, as on the web).
    private func subtitle(_ snapshot: LedgerSnapshot) -> String {
        let groupsLabel = PaydFormat.plural(store.state.groups.count, "active group", "active groups")
        if snapshot.userOwedToMe == 0 && snapshot.userIOwe == 0 && snapshot.userNetBalance == 0 {
            return "You are all settled up"
        }
        if snapshot.userNetBalance > 0 { return "You are owed net across \(groupsLabel)" }
        if snapshot.userNetBalance < 0 { return "You have pending liabilities across \(groupsLabel)" }
        return "Your balances net out to zero across \(groupsLabel)"
    }

    /// `.replace(/^[A-Z]{3}\s*/, '')`.
    static func stripCurrencyCode(_ text: String) -> String {
        let prefix = text.prefix(3)
        guard prefix.count == 3, prefix.allSatisfy({ ("A"..."Z").contains($0) }) else { return text }
        return String(text.dropFirst(3).drop(while: { $0.isWhitespace }))
    }

    private func metric(dot: Color, label: String, value: String) -> some View {
        HStack(spacing: 8) {
            Circle().fill(dot).frame(width: 10, height: 10).accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 0) {
                Text(label)
                    .font(.payd(size: 10, bold: true))
                    .homeUppercaseWider(size: 10)
                    .foregroundStyle(.white.opacity(0.7))
                Text(value)
                    .font(.payd(size: 14, bold: true))
                    .foregroundStyle(.white)
                    .monospacedDigit()
            }
        }
        .accessibilityElement(children: .combine)
    }

    private var buttons: some View {
        GeometryReader { proxy in
            let available = max(0, proxy.size.width - 10)
            HStack(spacing: 10) {
                Button { router.navigate(.settlements) } label: {
                    HStack(spacing: 8) {
                        Image(systemName: "dollarsign.circle")
                            .font(.system(size: 16, weight: .semibold))
                            .accessibilityHidden(true)
                        Text("Settle up")
                    }
                }
                .buttonStyle(PaydFilledButtonStyle(fill: .white, text: PaydTheme.brand900))
                .frame(width: available * 3 / 5)

                Button { router.present(.newSplit(defaultGroupId: nil)) } label: {
                    HStack(spacing: 8) {
                        Image(systemName: "arrow.triangle.branch")
                            .font(.system(size: 16, weight: .bold))
                            .accessibilityHidden(true)
                        Text("New split")
                            .font(.payd(size: 12, bold: true))
                    }
                }
                .buttonStyle(HomeGlassButtonStyle())
                .frame(width: available * 2 / 5)
            }
        }
        .frame(height: 48)
    }
}

/// `h-12 rounded-xl bg-white/15 text-white font-semibold text-xs border border-white/20 active:scale-95`.
private struct HomeGlassButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.payd(size: 12, bold: true))
            .foregroundStyle(.white)
            .lineLimit(1)
            .minimumScaleFactor(0.8)
            .frame(maxWidth: .infinity, minHeight: 48)
            .background(.white.opacity(0.15), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(.white.opacity(0.2)))
            .contentShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            .scaleEffect(configuration.isPressed ? 0.95 : 1)
            .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
    }
}

// MARK: - Group card (HomeView.tsx:174-222)

private struct HomeGroupCard: View {
    @Environment(LedgerStore.self) private var store
    let group: LedgerGroup
    let onOpen: () -> Void

    var body: some View {
        let userBalance = store.groupBalances(group.id)[store.currentUser.id] ?? 0
        let membersLabel = PaydFormat.plural(store.groupMembers(group.id).count, "member", "members")
        let spend = SpendMath.groupSpendMinor(group.id, transactions: store.state.transactions)
        let description = group.description.flatMap { $0.isEmpty ? nil : $0 }
        Button(action: onOpen) {
            VStack(alignment: .leading, spacing: 0) {
                HStack {
                    Text(PaydFormat.groupEmoji(group.name)).font(.system(size: 24))
                    Spacer(minLength: 8)
                    balanceBadge(userBalance)
                }
                .padding(.bottom, 10)

                Text(group.name)
                    .paydHeadingFont(size: 14)
                    .foregroundStyle(.white)
                    .lineLimit(1)
                    .padding(.bottom, 4)
                Text(description ?? "\(membersLabel) \u{2022} \(group.currency) ledger")
                    .font(.payd(size: 12))
                    .foregroundStyle(PaydTheme.zinc400)
                    .lineLimit(1)

                VStack(spacing: 0) {
                    Rectangle().fill(.white.opacity(0.06)).frame(height: 1)
                    HStack(alignment: .firstTextBaseline) {
                        Text(membersLabel)
                            .font(.payd(size: 11))
                            .foregroundStyle(PaydTheme.zinc400)
                        Spacer(minLength: 8)
                        Text(Currency.format(spend, currency: group.currency))
                            .font(.payd(size: 12, bold: true))
                            .foregroundStyle(.white)
                            .monospacedDigit()
                    }
                    .padding(.top, 10)
                }
                .padding(.top, 12)
            }
            .frame(width: 220 - 32, alignment: .leading)
            .paydCard(padding: 16, cornerRadius: 16)
            .shadow(color: .black.opacity(0.25), radius: 10, y: 6)
            .contentShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        }
        .buttonStyle(PressScaleButtonStyle())
        .accessibilityLabel("Open \(group.name)")
    }

    @ViewBuilder
    private func balanceBadge(_ balance: Int) -> some View {
        let (text, color, fill): (String, Color, Color) = balance > 0
            ? ("+" + Currency.format(balance, currency: group.currency), PaydTheme.emerald400, PaydTheme.emerald500)
            : balance < 0
            ? ("-" + Currency.format(abs(balance), currency: group.currency), PaydTheme.rose400, PaydTheme.rose500)
            : ("Settled", PaydTheme.brand400, PaydTheme.brand500)
        Text(text)
            .font(.payd(size: 11, bold: true))
            .foregroundStyle(color)
            .monospacedDigit()
            .lineLimit(1)
            .padding(.horizontal, 10)
            .padding(.vertical, 2)
            .background(fill.opacity(0.15), in: Capsule())
    }
}

// MARK: - Quick action button (HomeView.tsx:235-260)

private struct HomeQuickActionButton: View {
    let systemName: String
    let tint: Color
    let fill: Color
    let title: String
    let subtitle: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 0) {
                Image(systemName: systemName)
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(tint)
                    .frame(width: 32, height: 32)
                    .background(fill.opacity(0.2), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                    .padding(.bottom, 8)
                    .accessibilityHidden(true)
                Text(title)
                    .paydHeadingFont(size: 12)
                    .foregroundStyle(.white)
                Text(subtitle)
                    .font(.payd(size: 10))
                    .foregroundStyle(tint)
                    .padding(.top, 2)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .paydCard(padding: 14, cornerRadius: 16)
            .shadow(color: .black.opacity(0.1), radius: 4, y: 2)
            .contentShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        }
        .buttonStyle(PressScaleButtonStyle())
        .accessibilityElement(children: .combine)
    }
}

// MARK: - Recent activity (HomeView.tsx:273-368)

private struct HomeRecentActivity: View {
    @Environment(LedgerStore.self) private var store
    @Environment(AppRouter.self) private var router

    private static let limit = 6

    var body: some View {
        let recent = Array(SpendMath.sortedByDateDesc(store.state.transactions.filter { !$0.isDeleted }).prefix(Self.limit))
        VStack(alignment: .leading, spacing: 12) {
            SectionHeading("Recent activity", actionTitle: "See all \u{2192}") { router.navigate(.transactions) }
                .padding(.horizontal, 4)

            VStack(spacing: 10) {
                if recent.isEmpty {
                    emptyCard
                } else {
                    ForEach(recent) { transaction in
                        row(transaction)
                    }
                }
            }
        }
    }

    private var emptyCard: some View {
        VStack(spacing: 0) {
            Image(systemName: "receipt")
                .font(.system(size: 32))
                .foregroundStyle(PaydTheme.zinc500)
                .opacity(0.5)
                .padding(.bottom, 8)
                .accessibilityHidden(true)
            Text("No expenses recorded yet")
                .paydHeadingFont(size: 14)
                .foregroundStyle(.white)
            Text("Tap the center microphone or New split to start.")
                .font(.payd(size: 12))
                .foregroundStyle(PaydTheme.zinc400)
                .multilineTextAlignment(.center)
                .padding(.top, 4)
        }
        .frame(maxWidth: .infinity)
        .paydCard(padding: 32, cornerRadius: 16)
    }

    private func row(_ t: LedgerTransaction) -> some View {
        let state = store.state
        let me = store.currentUser.id
        let category = LedgerQueries.category(t.categoryId, in: state)
        let payerName = store.user(t.payerId)?.name.nonEmptyName
        let isPayer = t.payerId == me
        let isIncome = t.type == .income
        let share = Self.shareLine(t, isPayer: isPayer, payerName: payerName, me: me, splits: state.splits)
        let who = isIncome
            ? (isPayer ? "Received by you" : "Received by \(payerName ?? "Unknown")")
            : (isPayer ? "Paid by you" : "Paid by \(payerName ?? "Unknown")")

        return Button { router.present(.transactionDetail(transactionId: t.id)) } label: {
            HStack(spacing: 12) {
                Text(PaydFormat.categoryEmojiHome(category?.name))
                    .font(.system(size: 20))
                    .frame(width: 44, height: 44)
                    .background(PaydTheme.brand500.opacity(0.1), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                    .accessibilityHidden(true)

                VStack(alignment: .leading, spacing: 2) {
                    Text(t.title)
                        .font(.payd(size: 14, bold: true))
                        .foregroundStyle(.white)
                        .lineLimit(1)
                    Text("\(who) \u{2022} \(PaydFormat.shortDate(t.occurredAt))")
                        .font(.payd(size: 12))
                        .foregroundStyle(PaydTheme.zinc400)
                        .lineLimit(1)
                }
                .frame(maxWidth: .infinity, alignment: .leading)

                VStack(alignment: .trailing, spacing: 2) {
                    Text((isIncome ? "+" : "") + Currency.format(t.amountMinor, currency: t.currency))
                        .font(.payd(size: 14, bold: true))
                        .foregroundStyle(isIncome ? PaydTheme.emerald500 : .white)
                        .monospacedDigit()
                    Text(share.text)
                        .font(.payd(size: 11))
                        .foregroundStyle(share.color)
                        .monospacedDigit()
                }
                .fixedSize()
            }
            .paydCard(padding: 14, cornerRadius: 16)
            .shadow(color: .black.opacity(0.05), radius: 1, y: 1)
            .contentShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        }
        .buttonStyle(PressScaleButtonStyle(scale: 0.99))
        .accessibilityElement(children: .combine)
    }

    /// HomeView.tsx:301-322: what this entry means for me, in one short line.
    private static func shareLine(_ t: LedgerTransaction, isPayer: Bool, payerName: String?, me: String,
                                  splits: [TransactionSplit]) -> (text: String, color: Color) {
        let myShare = SpendMath.myExpenseShareMinor(t, userId: me, splits: splits)
        if t.type == .income {
            return (isPayer ? "Income" : "Income \u{00B7} \(payerName ?? "someone else")", PaydTheme.emerald500)
        }
        if t.type != .expense {
            return (PaydFormat.titleCaseFirst(t.type.rawValue), PaydTheme.zinc400)
        }
        if isPayer {
            return (myShare > 0 ? "Your share: \(Currency.format(myShare, currency: t.currency))" : "You paid for others",
                    PaydTheme.emerald500)
        }
        if SpendMath.isParticipant(t, userId: me, splits: splits) && myShare > 0 {
            return ("You owe: \(Currency.format(myShare, currency: t.currency))", PaydTheme.rose500)
        }
        return ("Not in your split", PaydTheme.zinc500)
    }
}

private extension String {
    /// JS `name || fallback`: an empty name falls back.
    var nonEmptyName: String? { isEmpty ? nil : self }
}
