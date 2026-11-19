import OSLog
import PaydCore
import SwiftUI

/// Port of web/src/components/modals/TransactionDetailDrawer.tsx: one transaction's details, split
/// allocation, WhatsApp/copy sharing, and the two-step soft-delete (or restore when already deleted).
struct TransactionDetailView: View {
    let transactionId: String

    @Environment(LedgerStore.self) private var store
    @Environment(AppRouter.self) private var router
    @Environment(\.openURL) private var openURL

    @State private var copied = false
    @State private var confirmingDelete = false

    private static let logger = Logger(subsystem: "com.payd.SwiftExpenseTracker", category: "expenses")

    init(transactionId: String) {
        self.transactionId = transactionId
    }

    var body: some View {
        SwiftUI.Group {
            if let transaction = store.state.transactions.first(where: { $0.id == transactionId }) {
                ScrollView {
                    content(transaction)
                        .padding(24)
                }
                .scrollBounceBehavior(.basedOnSize)
            } else {
                Color.clear.onAppear { router.dismissSheet() }
            }
        }
        .task(id: copied) {
            guard copied else { return }
            try? await Task.sleep(for: .seconds(2))
            if !Task.isCancelled { copied = false }
        }
    }

    // MARK: - Layout

    private func content(_ t: LedgerTransaction) -> some View {
        let state = store.state
        let currentUserId = state.currentUserId
        let category = state.categories.first { $0.id == t.categoryId }
        let payer = state.users.first { $0.id == t.payerId }
        let group = state.groups.first { $0.id == t.groupId }
        let txnSplits = state.splits.filter { $0.transactionId == t.id }
        let isDeleted = t.deletedAt != nil

        return VStack(alignment: .leading, spacing: 16) {
            header(t, isDeleted: isDeleted)
            titleBanner(t)
            metaTiles(category: category, payer: payer, currentUserId: currentUserId)
            if group != nil || !(t.notes ?? "").isEmpty {
                groupNotesBox(group: group, notes: t.notes)
            }
            if !txnSplits.isEmpty {
                splitAllocation(t, splits: txnSplits, users: state.users, currentUserId: currentUserId)
            }
            if !txnSplits.isEmpty && !isDeleted {
                shareRow(t, splits: txnSplits, payer: payer, group: group, state: state)
                    .padding(.top, 4)
            }
            if !isDeleted && !confirmingDelete {
                deletionNotice
            }
            if !isDeleted && confirmingDelete {
                deleteConfirmation(payer: payer, group: group, paidBySomeoneElse: t.payerId != currentUserId)
            }
            actions(t, isDeleted: isDeleted)
                .padding(.top, 8)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .animation(.easeOut(duration: 0.15), value: confirmingDelete)
    }

    private func header(_ t: LedgerTransaction, isDeleted: Bool) -> some View {
        VStack(spacing: 0) {
            HStack(spacing: 8) {
                let isIncome = t.type == .income
                pill(t.type.rawValue.uppercased(),
                     fill: (isIncome ? ExpensesPalette.teal950 : PaydTheme.emerald950).opacity(0.6),
                     text: isIncome ? PaydTheme.teal400 : PaydTheme.emerald400)
                if isDeleted {
                    pill("SOFT DELETED (REVERSED)", fill: ExpensesPalette.rose950.opacity(0.6), text: PaydTheme.rose400)
                }
                Spacer()
                Button {
                    router.dismissSheet()
                } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(PaydTheme.slate400)
                        .frame(width: 32, height: 32)
                        .contentShape(Circle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Close transaction details")
            }
            .padding(.bottom, 12)
            Rectangle().fill(PaydTheme.slate800).frame(height: 1)
        }
    }

    private func pill(_ text: String, fill: Color, text color: Color) -> some View {
        Text(text)
            .font(.payd(size: 10, bold: true))
            .tracking(0.5)
            .foregroundStyle(color)
            .lineLimit(1)
            .padding(.horizontal, 10)
            .padding(.vertical, 2)
            .background(fill, in: Capsule())
    }

    private func titleBanner(_ t: LedgerTransaction) -> some View {
        let isIncome = t.type == .income
        return HStack(alignment: .center, spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text(t.title)
                    .font(.payd(size: 20, bold: true))
                    .foregroundStyle(.white)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityAddTraits(.isHeader)
                HStack(spacing: 6) {
                    Image(systemName: "calendar")
                        .font(.system(size: 12))
                        .accessibilityHidden(true)
                    Text(PaydFormat.longDateTime(t.occurredAt))
                        .font(.payd(size: 12))
                }
                .foregroundStyle(PaydTheme.slate400)
            }
            Spacer(minLength: 8)
            Text("\(isIncome ? "+" : "")\(Currency.format(t.amountMinor, currency: t.currency))")
                .font(.payd(size: 24, bold: true))
                .monospacedDigit()
                .foregroundStyle(isIncome ? PaydTheme.teal400 : .white)
                .multilineTextAlignment(.trailing)
        }
    }

    private func metaTiles(category: PaydCore.Category?, payer: User?, currentUserId: String) -> some View {
        HStack(spacing: 8) {
            HStack(spacing: 10) {
                Image(systemName: CategoryIcon.symbol(forLucide: category?.icon))
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(PaydTheme.emerald500)
                    .frame(width: 32, height: 32)
                    .background(PaydTheme.emerald500.opacity(0.1), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                    .accessibilityHidden(true)
                tileText(label: "CATEGORY", value: category?.name ?? "Uncategorized")
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(12)
            .background(PaydTheme.slate850, in: RoundedRectangle(cornerRadius: 12, style: .continuous))

            HStack(spacing: 10) {
                AvatarView(user: payer, size: 28)
                tileText(label: "PAID BY", value: nameWithYou(payer, currentUserId: currentUserId))
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(12)
            .background(PaydTheme.slate850, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        }
        .fixedSize(horizontal: false, vertical: true)
    }

    private func tileText(label: String, value: String) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(label)
                .font(.payd(size: 10, bold: true))
                .foregroundStyle(PaydTheme.slate400)
            Text(value)
                .font(.payd(size: 12))
                .foregroundStyle(PaydTheme.slate200)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxHeight: .infinity, alignment: .center)
    }

    private func nameWithYou(_ user: User?, currentUserId: String) -> String {
        "\(user?.name ?? "") \(user?.id == currentUserId ? "(You)" : "")".expensesTrimmed
    }

    private func groupNotesBox(group: LedgerGroup?, notes: String?) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            if let group {
                HStack {
                    Text("Group:").foregroundStyle(PaydTheme.slate400)
                    Spacer()
                    Text(group.name)
                        .font(.payd(size: 12, bold: true))
                        .foregroundStyle(PaydTheme.slate200)
                }
            }
            if let notes, !notes.isEmpty {
                HStack(alignment: .top) {
                    Text("Notes:").foregroundStyle(PaydTheme.slate400)
                    Spacer()
                    Text(notes)
                        .font(.payd(size: 12, italic: true))
                        .foregroundStyle(PaydTheme.slate300)
                        .multilineTextAlignment(.trailing)
                }
            }
        }
        .font(.payd(size: 12))
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(PaydTheme.slate850, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
    }

    private func splitAllocation(_ t: LedgerTransaction, splits: [TransactionSplit], users: [User],
                                 currentUserId: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                HStack(spacing: 6) {
                    Image(systemName: "person.2")
                        .font(.system(size: 12))
                        .accessibilityHidden(true)
                    Text("SPLIT ALLOCATION")
                }
                Spacer()
                Text(PaydFormat.plural(splits.count, "member", "members").uppercased())
            }
            .font(.payd(size: 12, bold: true))
            .tracking(0.6)
            .foregroundStyle(PaydTheme.slate400)

            VStack(spacing: 6) {
                ForEach(splits) { split in
                    let user = users.first { $0.id == split.userId }
                    HStack(spacing: 8) {
                        AvatarView(user: user, size: 20)
                        Text(nameWithYou(user, currentUserId: currentUserId))
                            .font(.payd(size: 12))
                            .foregroundStyle(PaydTheme.slate200)
                        Spacer()
                        Text(Currency.format(split.shareMinor, currency: t.currency))
                            .font(.payd(size: 12, bold: true))
                            .monospacedDigit()
                            .foregroundStyle(.white)
                    }
                    .padding(8)
                    .background(PaydTheme.slate850.opacity(0.6), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(PaydTheme.slate800))
                }
            }
        }
    }

    // MARK: - Share / copy (TransactionDetailDrawer.tsx:67-94)

    private func breakdownSummary(_ t: LedgerTransaction, splits: [TransactionSplit], payer: User?,
                                  group: LedgerGroup?, state: LedgerState) -> String {
        let payerName = payer?.id == state.currentUserId ? "You" : (payer?.name).flatMap { $0.isEmpty ? nil : $0 } ?? "Someone"
        var lines = "🧾 *\(t.title)* (\(Currency.format(t.amountMinor, currency: t.currency)))\n"
        lines += "Paid by: \(payerName)\n"
        if let group { lines += "Group: \(group.name)\n" }
        if !splits.isEmpty {
            lines += "\n*Split Breakdown:*\n"
            for split in splits {
                let name = state.users.first { $0.id == split.userId }?.name
                let shown = (name?.isEmpty ?? true) ? "User" : (name ?? "User")
                lines += "• \(shown): \(Currency.format(split.shareMinor, currency: t.currency))\n"
            }
        }
        lines += "\nTracked on Payd • Settle easily via Careem Pay! 💚"
        return lines
    }

    private func shareRow(_ t: LedgerTransaction, splits: [TransactionSplit], payer: User?, group: LedgerGroup?,
                          state: LedgerState) -> some View {
        let text = breakdownSummary(t, splits: splits, payer: payer, group: group, state: state)
        return HStack(spacing: 8) {
            Button {
                shareToWhatsApp(text)
            } label: {
                Label("Share to WhatsApp", systemImage: "square.and.arrow.up")
                    .labelStyle(CompactIconLabelStyle())
                    .foregroundStyle(PaydTheme.emerald400)
                    .frame(maxWidth: .infinity, minHeight: 38)
                    .background(PaydTheme.emerald500.opacity(0.1), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .strokeBorder(PaydTheme.emerald500.opacity(0.25)))
            }
            .buttonStyle(PressScaleButtonStyle(scale: 0.97))

            Button {
                ShareActions.copy(text)
                copied = true
            } label: {
                HStack(spacing: 6) {
                    Image(systemName: copied ? "checkmark" : "doc.on.doc")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(copied ? PaydTheme.emerald500 : PaydTheme.slate300)
                        .accessibilityHidden(true)
                    Text(copied ? "Copied!" : "Copy Breakdown")
                        .font(.payd(size: 12, bold: true))
                        .foregroundStyle(PaydTheme.slate300)
                }
                .frame(maxWidth: .infinity, minHeight: 38)
                .background(PaydTheme.slate800, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            }
            .buttonStyle(PressScaleButtonStyle(scale: 0.97))
        }
    }

    private func shareToWhatsApp(_ text: String) {
        guard let url = ShareActions.whatsAppURL(text: text) else {
            Self.logger.error("Could not build the WhatsApp share URL")
            store.errorMessage = "Couldn't open WhatsApp. Use Copy Breakdown instead."
            return
        }
        openURL(url) { accepted in
            if !accepted {
                Self.logger.error("WhatsApp share URL was not opened")
                store.errorMessage = "Couldn't open WhatsApp. Use Copy Breakdown instead."
            }
        }
    }

    // MARK: - Delete / restore (TransactionDetailDrawer.tsx:96-109, 281-340)

    private var deletionNotice: some View {
        HStack(alignment: .top, spacing: 8) {
            Image(systemName: "exclamationmark.shield")
                .font(.system(size: 14))
                .foregroundStyle(PaydTheme.emerald500)
                .padding(.top, 1)
                .accessibilityHidden(true)
            Text("Deleting an entry keeps a record of the change and updates everyone's balances straight away.")
                .font(.payd(size: 11))
                .foregroundStyle(PaydTheme.slate500)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(PaydTheme.slate800.opacity(0.8), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    private func deleteConfirmation(payer: User?, group: LedgerGroup?, paidBySomeoneElse: Bool) -> some View {
        let payerName = (payer?.name).flatMap { $0.isEmpty ? nil : $0 } ?? "Someone else"
        let warning = paidBySomeoneElse
            ? "\(payerName) paid for this. Deleting it changes their balance too, so check with them first. "
            : ""
        let scope = group.map { " in \($0.name)" } ?? ""
        let message = "\(warning)This reverses the entry for everyone\(scope). You can restore it later from Activity with \u{201C}Include Deleted\u{201D}. Tap delete again to confirm."
        return HStack(alignment: .top, spacing: 8) {
            Image(systemName: "exclamationmark.shield")
                .font(.system(size: 14))
                .foregroundStyle(PaydTheme.rose400)
                .padding(.top, 1)
                .accessibilityHidden(true)
            Text(message)
                .font(.payd(size: 11))
                .foregroundStyle(ExpensesPalette.rose200)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(PaydTheme.rose500.opacity(0.1), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(PaydTheme.rose500.opacity(0.3)))
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isStaticText)
    }

    private func actions(_ t: LedgerTransaction, isDeleted: Bool) -> some View {
        HStack(spacing: 12) {
            if isDeleted {
                Button {
                    store.restoreTransaction(t.id)
                    router.dismissSheet()
                } label: {
                    Label("Restore Transaction", systemImage: "arrow.counterclockwise")
                        .labelStyle(CompactIconLabelStyle(fontSize: 14, iconSize: 14, spacing: 8))
                }
                .buttonStyle(PaydFilledButtonStyle(fill: PaydTheme.emerald600, text: .white, height: 42))
            } else {
                Button {
                    handleDelete(t)
                } label: {
                    Label(confirmingDelete ? "Yes, delete & reverse" : "Soft-Delete & Reverse", systemImage: "trash")
                        .labelStyle(CompactIconLabelStyle(fontSize: 14, iconSize: 14, spacing: 8))
                        .foregroundStyle(confirmingDelete ? .white : PaydTheme.rose400)
                        .frame(maxWidth: .infinity, minHeight: 42)
                        .background(confirmingDelete ? PaydTheme.rose600 : PaydTheme.rose500.opacity(0.1),
                                    in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous)
                            .strokeBorder(confirmingDelete ? PaydTheme.rose500 : PaydTheme.rose500.opacity(0.3)))
                }
                .buttonStyle(PressScaleButtonStyle(scale: 0.97))
            }
            Button(confirmingDelete ? "Keep it" : "Close") {
                if confirmingDelete {
                    confirmingDelete = false
                } else {
                    router.dismissSheet()
                }
            }
            .buttonStyle(PaydSecondaryButtonStyle(height: 42))
        }
    }

    private func handleDelete(_ t: LedgerTransaction) {
        guard confirmingDelete else {
            confirmingDelete = true
            return
        }
        store.softDeleteTransaction(t.id)
        confirmingDelete = false
        router.dismissSheet()
    }
}

/// Icon + text label (`flex items-center justify-center gap-1.5 text-xs font-semibold`).
struct CompactIconLabelStyle: LabelStyle {
    var fontSize: CGFloat = 12
    var iconSize: CGFloat = 12
    var spacing: CGFloat = 6

    func makeBody(configuration: Configuration) -> some View {
        HStack(spacing: spacing) {
            configuration.icon
                .font(.system(size: iconSize, weight: .semibold))
                .accessibilityHidden(true)
            configuration.title
                .font(.payd(size: fontSize, bold: true))
                .lineLimit(1)
                .minimumScaleFactor(0.8)
        }
    }
}
