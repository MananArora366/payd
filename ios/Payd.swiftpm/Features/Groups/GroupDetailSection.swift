import PaydCore
import SwiftUI

/// Selected group detail of web/src/components/groups/GroupsView.tsx:323-564: header controls, member balances,
/// optimal debt simplification, group expense log and the group's recurring bills.
struct GroupDetailSection: View {
    let group: LedgerGroup

    @Environment(LedgerStore.self) private var store
    @Environment(AppRouter.self) private var router
    @Environment(AppSettings.self) private var settings
    @State private var copiedToken = false
    @State private var copyResetTask: Task<Void, Never>?

    var body: some View {
        let members = store.groupMembers(group.id)
        let balances = store.groupBalances(group.id)
        VStack(alignment: .leading, spacing: 24) {
            headerCard(memberCount: members.count)
            balancesCard(members: members, balances: balances)
            simplificationCard
            expenseLog
            RecurringBillsSection(groupId: group.id)
                .padding(.top, 8)
        }
        .onDisappear { copyResetTask?.cancel() }
    }

    // MARK: - Header (326-365)

    private func headerCard(memberCount: Int) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 10) {
                    Text(PaydFormat.groupEmoji(group.name)).font(.system(size: 24))
                    Text(group.name)
                        .paydHeadingFont(size: 18)
                        .foregroundStyle(.white)
                        .accessibilityAddTraits(.isHeader)
                    Text("\(memberCount) MEMBERS")
                        .paydHeadingFont(size: 10)
                        .foregroundStyle(PaydTheme.brand300)
                        .lineLimit(1)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 2)
                        .background(PaydTheme.brand500.opacity(0.2), in: Capsule())
                }
                Text(group.description ?? "")
                    .font(.payd(size: 12))
                    .foregroundStyle(PaydTheme.zinc400)
                    .fixedSize(horizontal: false, vertical: true)
            }
            GroupsFlowLayout(spacing: 8) {
                copyInviteButton
                rouletteButton
                addExpenseButton
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .paydCard(padding: 20)
    }

    private var copyInviteButton: some View {
        Button(action: copyInvite) {
            HStack(spacing: 6) {
                Image(systemName: copiedToken ? "checkmark" : "doc.on.doc")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(copiedToken ? PaydTheme.emerald400 : PaydTheme.zinc300)
                Text(copiedToken ? "Invite Link Copied!" : "Copy Invite")
                    .font(.payd(size: 12, bold: true))
                    .foregroundStyle(PaydTheme.zinc300)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 8)
            .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(Color.white.opacity(0.1)))
            .contentShape(Rectangle())
        }
        .buttonStyle(PressScaleButtonStyle())
    }

    private var rouletteButton: some View {
        Button {
            router.present(.roulette(defaultGroupId: group.id))
        } label: {
            HStack(spacing: 6) {
                Image(systemName: "cup.and.saucer").font(.system(size: 12, weight: .semibold))
                Text("Coffee Roulette").font(.payd(size: 12, bold: true))
            }
            .foregroundStyle(PaydTheme.amber300)
            .padding(.horizontal, 14)
            .padding(.vertical, 8)
            .background(PaydTheme.amber500.opacity(0.2), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous)
                .strokeBorder(PaydTheme.amber500.opacity(0.3)))
        }
        .buttonStyle(PressScaleButtonStyle())
        .accessibilityHint("Fair Payer Coffee Roulette")
    }

    private var addExpenseButton: some View {
        Button {
            router.present(.addExpense(AddExpenseRequest(type: .expense, groupId: group.id)))
        } label: {
            HStack(spacing: 6) {
                Image(systemName: "plus").font(.system(size: 12, weight: .heavy))
                Text("Add Expense").font(.payd(size: 14, bold: true))
            }
            .foregroundStyle(.white)
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
            .background(PaydTheme.brand600, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        }
        .buttonStyle(PressScaleButtonStyle())
    }

    /// handleCopyInviteLink: copy, then "Invite Link Copied!" for 2 s.
    private func copyInvite() {
        ShareActions.copy(settings.inviteURL(groupId: group.id))
        copiedToken = true
        copyResetTask?.cancel()
        copyResetTask = Task {
            try? await Task.sleep(for: .seconds(2))
            guard !Task.isCancelled else { return }
            copiedToken = false
        }
    }

    // MARK: - Member balances (368-429)

    private func balancesCard(members: [User], balances: Shares) -> some View {
        let sum = GroupLogic.sumBalances(balances)
        let currentId = store.currentUser.id
        return VStack(alignment: .leading, spacing: 12) {
            HStack {
                HStack(spacing: 6) {
                    Image(systemName: "person.2")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(PaydTheme.brand400)
                        .accessibilityHidden(true)
                    Text("Member balances")
                        .paydHeadingFont(size: 12)
                        .foregroundStyle(PaydTheme.zinc400)
                }
                Spacer(minLength: 8)
                HStack(spacing: 4) {
                    Image(systemName: "checkmark.shield").font(.system(size: 12, weight: .semibold))
                    Text("Σ Balances = \(Currency.format(sum, currency: "AED"))")
                        .font(.payd(size: 11))
                        .monospacedDigit()
                }
                .foregroundStyle(sum == 0 ? PaydTheme.emerald400 : PaydTheme.amber400)
                .accessibilityHint(sum == 0
                    ? "Every fils is accounted for: member balances sum to zero"
                    : "Member balances do not sum to zero, so some activity involves non-members")
            }
            VStack(spacing: 10) {
                ForEach(members) { member in
                    memberRow(member, balance: balances[member.id] ?? 0, currentId: currentId)
                }
            }
        }
        .paydCard(padding: 20)
    }

    private func memberRow(_ member: User, balance: Int, currentId: String) -> some View {
        HStack {
            HStack(spacing: 10) {
                InitialsDisc(PaydFormat.firstLetter(member.name), size: 32, fontSize: 12)
                VStack(alignment: .leading, spacing: 0) {
                    Text(groupsNameWithYou(member, currentUserId: currentId))
                        .font(.payd(size: 12, bold: true))
                        .foregroundStyle(.white)
                    Text(balance > 0 ? "Gets back" : balance < 0 ? "Owes" : "Settled")
                        .font(.payd(size: 10))
                        .foregroundStyle(PaydTheme.zinc400)
                }
            }
            Spacer(minLength: 8)
            Text(GroupsBalanceStyle.signed(balance))
                .font(.payd(size: 12, bold: true))
                .foregroundStyle(GroupsBalanceStyle.color(balance, zero: PaydTheme.zinc500))
                .monospacedDigit()
        }
        .paydCard(padding: 12, fill: PaydTheme.surface202025, stroke: Color.white.opacity(0.06))
    }

    // MARK: - Optimal debt simplification (432-508)

    private var simplificationCard: some View {
        let debts = store.groupSimplifiedDebts(group.id)
        let currentId = store.currentUser.id
        return VStack(alignment: .leading, spacing: 12) {
            HStack {
                HStack(spacing: 8) {
                    Image(systemName: "arrow.left.arrow.right")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(PaydTheme.brand400)
                        .padding(6)
                        .background(PaydTheme.brand500.opacity(0.2), in: Circle())
                        .accessibilityHidden(true)
                    Text("Optimal debt simplification")
                        .paydHeadingFont(size: 12)
                        .foregroundStyle(PaydTheme.brand300)
                }
                Spacer(minLength: 8)
                Text("Minimizes total payment transfers")
                    .font(.payd(size: 11))
                    .foregroundStyle(PaydTheme.zinc400)
                    .multilineTextAlignment(.trailing)
            }
            if debts.isEmpty {
                Text("Everyone in this group is completely settled! Zero outstanding debt.")
                    .font(.payd(size: 12))
                    .foregroundStyle(PaydTheme.zinc400)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: .infinity)
                    .padding(16)
                    .background(Color.black.opacity(0.4), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            } else {
                VStack(spacing: 8) {
                    ForEach(debts.indices, id: \.self) { index in
                        debtRow(debts[index], currentId: currentId)
                    }
                }
            }
        }
        .paydCard(padding: 20, stroke: PaydTheme.brand500.opacity(0.3))
    }

    private func debtRow(_ debt: SimplifiedDebt, currentId: String) -> some View {
        HStack(spacing: 8) {
            HStack(spacing: 8) {
                Text(groupsNameWithYou(store.user(debt.fromUserId), currentUserId: currentId))
                    .font(.payd(size: 12, bold: true))
                    .foregroundStyle(.white)
                Text("→ pays →")
                    .font(.system(size: 12, design: .serif).italic())
                    .foregroundStyle(PaydTheme.zinc400)
                    .fixedSize()
                Text(groupsNameWithYou(store.user(debt.toUserId), currentUserId: currentId))
                    .font(.payd(size: 12, bold: true))
                    .foregroundStyle(.white)
            }
            Spacer(minLength: 4)
            HStack(spacing: 8) {
                Text(Currency.format(debt.amountMinor, currency: "AED"))
                    .font(.payd(size: 14, bold: true))
                    .foregroundStyle(PaydTheme.emerald500)
                    .monospacedDigit()
                    .fixedSize()
                    .padding(.trailing, 4)
                Button {
                    router.present(.careemPay(CareemPayRequest(senderId: debt.fromUserId, recipientId: debt.toUserId,
                                                               amountMinor: debt.amountMinor, groupId: group.id,
                                                               reference: "\(group.name) settlement")))
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: "bolt.fill").font(.system(size: 10, weight: .bold))
                        Text("Careem Pay").font(.payd(size: 11, bold: true))
                    }
                    .foregroundStyle(.white)
                    .fixedSize()
                    .padding(.horizontal, 12)
                    .padding(.vertical, 6)
                    .background(PaydTheme.emerald600, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                }
                .buttonStyle(PressScaleButtonStyle())
                .accessibilityHint("Instant Careem Pay Transfer")
                Button {
                    router.present(.recordSettlement(SettlementRequest(senderId: debt.fromUserId,
                                                                       recipientId: debt.toUserId,
                                                                       amountMinor: debt.amountMinor,
                                                                       groupId: group.id)))
                } label: {
                    Text("Manual")
                        .font(.payd(size: 11, bold: true))
                        .foregroundStyle(PaydTheme.zinc300)
                        .fixedSize()
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .background(PaydTheme.cardSubtle, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                }
                .buttonStyle(.plain)
            }
        }
        .paydCard(padding: 14, fill: PaydTheme.surface202025)
    }

    // MARK: - Group expense log (511-557)

    private var expenseLog: some View {
        let transactions = store.state.transactions.filter { $0.groupId == group.id && $0.deletedAt == nil }
        return VStack(alignment: .leading, spacing: 12) {
            Text("GROUP EXPENSE LOG (\(transactions.count))")
                .paydHeadingFont(size: 12)
                .foregroundStyle(PaydTheme.zinc400)
                .accessibilityAddTraits(.isHeader)
            VStack(spacing: 8) {
                if transactions.isEmpty {
                    Text("No expenses added to this group yet.")
                        .font(.payd(size: 12))
                        .foregroundStyle(PaydTheme.zinc400)
                        .multilineTextAlignment(.center)
                        .frame(maxWidth: .infinity)
                        .paydCard(padding: 32)
                } else {
                    ForEach(transactions) { txn in expenseRow(txn) }
                }
            }
        }
    }

    private func expenseRow(_ txn: LedgerTransaction) -> some View {
        let payerName = store.user(txn.payerId)?.name ?? ""
        let splitCount = store.state.splits.filter { $0.transactionId == txn.id }.count
        return Button {
            router.present(.transactionDetail(transactionId: txn.id))
        } label: {
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(txn.title)
                        .font(.payd(size: 14, bold: true))
                        .foregroundStyle(.white)
                        .multilineTextAlignment(.leading)
                    Text("Paid by \(payerName) • Split among \(splitCount) members")
                        .font(.payd(size: 11))
                        .foregroundStyle(PaydTheme.zinc400)
                        .multilineTextAlignment(.leading)
                }
                Spacer(minLength: 8)
                VStack(alignment: .trailing, spacing: 0) {
                    Text(Currency.format(txn.amountMinor, currency: txn.currency))
                        .font(.payd(size: 14, bold: true))
                        .foregroundStyle(.white)
                        .monospacedDigit()
                    Text(PaydFormat.shortDate(txn.occurredAt))
                        .font(.payd(size: 10))
                        .foregroundStyle(PaydTheme.zinc400)
                }
            }
            .paydCard(padding: 14)
            .shadow(color: .black.opacity(0.05), radius: 1, y: 1)
            .contentShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        }
        .buttonStyle(.plain)
    }
}
