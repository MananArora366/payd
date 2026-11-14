import OSLog
import PaydCore
import SwiftUI

/// Port of web/src/components/modals/AddExpenseModal.tsx. Every presentation starts from fresh state
/// built from `request` (type, group, Careem/receipt prefill); the maths lives in `AddExpenseLogic`.
struct AddExpenseView: View {
    let request: AddExpenseRequest

    @Environment(LedgerStore.self) private var store

    init(request: AddExpenseRequest) {
        self.request = request
    }

    var body: some View {
        AddExpenseForm(request: request, state: store.state, visibleGroups: store.snapshot.visibleGroups)
    }
}

/// The form itself (web `AddExpenseForm`). Initial state is computed once from the ledger at open time.
private struct AddExpenseForm: View {
    @Environment(LedgerStore.self) private var store
    @Environment(AppRouter.self) private var router

    @State private var type: TransactionType
    @State private var title: String
    @State private var amountText: String
    @State private var categoryId: String
    @State private var payerId: String
    @State private var groupId: String?
    @State private var paymentMethod: String
    @State private var notes: String
    @State private var splitMethod: ExpenseSplitMethod
    @State private var selectedUserIds: [String]
    @State private var exactAmounts: [String: String] = [:]
    @State private var manualItems: [FormItem]
    @State private var error: String?
    @State private var claimWarning: String?

    private static let logger = Logger(subsystem: "com.payd.SwiftExpenseTracker", category: "expenses")
    private static let topAnchor = "add-expense-top"

    init(request: AddExpenseRequest, state: LedgerState, visibleGroups: [LedgerGroup]) {
        let rules = AddExpenseRules(state: state)
        let prefill = request.prefill
        let initialGroupId = request.groupId.flatMap { id in state.groups.contains { $0.id == id } ? id : nil }
        let prefillItems = (prefill?.items ?? []).filter { !$0.name.isEmpty }

        _type = State(initialValue: prefill != nil || request.type != .income ? .expense : .income)
        _title = State(initialValue: prefill?.title ?? "")
        _amountText = State(initialValue: (prefill?.amountMinor ?? 0) > 0
            ? Currency.minorToMajorString(prefill?.amountMinor ?? 0) : "")
        _categoryId = State(initialValue: AddExpenseLogic.findCategoryId(state.categories, hint: prefill?.categoryName)
            ?? state.categories.first?.id ?? "")
        _payerId = State(initialValue: rules.defaultPayer(for: initialGroupId))
        _groupId = State(initialValue: initialGroupId)
        _paymentMethod = State(initialValue: (prefill?.paymentMethod).flatMap { $0.isEmpty ? nil : $0 } ?? "Card")
        _notes = State(initialValue: prefill?.notes ?? "")
        _splitMethod = State(initialValue: prefillItems.isEmpty ? .equal : .itemized)
        _selectedUserIds = State(initialValue: rules.defaultSelection(for: initialGroupId))
        _manualItems = State(initialValue: prefillItems.isEmpty
            ? [FormItem(id: "item-\(PaydJSON.epochMillis(Date()))", name: "Item 1", amountText: "")]
            : prefillItems.enumerated().map { idx, item in
                FormItem(id: "prefill-\(idx)", name: item.name, amountText: Currency.minorToMajorString(item.amountMinor))
            })
    }

    // MARK: - Derived values (AddExpenseModal.tsx:137-156)

    private var rules: AddExpenseRules { AddExpenseRules(state: store.state) }
    private var availableUsers: [User] { rules.members(for: groupId) }
    private var itemsSubtotal: Int { AddExpenseLogic.itemsSubtotalMinor(manualItems) }
    private var isItemizedExpense: Bool { splitMethod == .itemized && type == .expense }
    private var usingItemSubtotal: Bool {
        isItemizedExpense && itemsSubtotal > 0 && amountText.expensesTrimmed.isEmpty
    }
    private var effectiveTotal: Int { usingItemSubtotal ? itemsSubtotal : AddExpenseLogic.previewMinor(amountText) }

    private func splitInput(total: Int) -> SplitInput {
        SplitInput(type: type, totalMinor: total, payerId: payerId, splitMethod: splitMethod,
                   participantIds: selectedUserIds, exactAmounts: exactAmounts, items: manualItems,
                   nameOf: rules.nameOf)
    }

    /// Live preview for equal / itemized; exact is validated on save.
    private var livePreview: Result<[ShareAllocation], ParseError>? {
        guard type == .expense, splitMethod != .exact, effectiveTotal > 0 else { return nil }
        return AddExpenseLogic.computeSplits(splitInput(total: effectiveTotal))
    }

    // MARK: - Body

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    SheetHeader(title: type == .income ? "RECORD INCOME" : "ADD NEW EXPENSE") {
                        router.dismissSheet()
                    }
                    .id(Self.topAnchor)
                    if let error {
                        ErrorBanner(error)
                    }
                    typeToggle
                    if type == .expense {
                        lensButton
                    }
                    descriptionField
                    amountAndCategory
                    payerAndGroup
                    if type == .expense {
                        splitsSection
                    }
                    AccuracyNote()
                    submitRow(proxy: proxy)
                        .padding(.top, 8)
                }
                .padding(24)
            }
            .scrollDismissesKeyboard(.interactively)
        }
    }

    private var typeToggle: some View {
        SwitchPills(selection: $type, options: [
            (.expense, "Expense", nil), (.income, "Income", nil),
        ])
    }

    private var lensButton: some View {
        Button {
            router.present(.receiptScanner)
        } label: {
            HStack(spacing: 8) {
                Image(systemName: "camera")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(PaydTheme.brand400)
                    .accessibilityHidden(true)
                Text("Or scan paper receipt with Payd Lens")
                    .font(.payd(size: 14, bold: true))
                    .foregroundStyle(PaydTheme.brand300)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
            }
            .frame(maxWidth: .infinity, minHeight: 40)
            .padding(.horizontal, 12)
            .background(PaydTheme.brand500.opacity(0.15), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(PaydTheme.brand500.opacity(0.3)))
        }
        .buttonStyle(PressScaleButtonStyle())
    }

    private var descriptionField: some View {
        VStack(alignment: .leading, spacing: 4) {
            FieldLabel("Description")
            PaydTextField("e.g. Dinner with team, Grocery run, Salary", text: $title)
                .accessibilityLabel("Description")
        }
    }

    private var amountAndCategory: some View {
        HStack(alignment: .top, spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                FieldLabel("Amount")
                PaydAmountField(isItemizedExpense && itemsSubtotal > 0
                                    ? Currency.minorToMajorString(itemsSubtotal) : "0.00",
                                text: $amountText, prefix: Currency.ledgerCode)
                    .accessibilityLabel("Amount in AED")
            }
            VStack(alignment: .leading, spacing: 4) {
                FieldLabel("Category")
                PaydMenuPicker(selection: $categoryId,
                               options: store.state.categories.map { ($0.id, $0.name) })
                    .accessibilityLabel("Category")
            }
        }
    }

    private var payerAndGroup: some View {
        let currentUserId = store.state.currentUserId
        let visible = store.snapshot.visibleGroups
        let groupOptions: [(value: String?, label: String)] = [(nil, "Personal (No group)")]
            + store.state.groups
                .filter { g in g.id == groupId || visible.contains { $0.id == g.id } }
                .map { (Optional($0.id), $0.name) }
        return HStack(alignment: .top, spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                FieldLabel("Paid by")
                PaydMenuPicker(selection: $payerId, options: availableUsers.map {
                    ($0.id, $0.id == currentUserId ? "\($0.name) (You)" : $0.name)
                })
                .accessibilityLabel("Paid by")
            }
            VStack(alignment: .leading, spacing: 4) {
                FieldLabel("Ledger group")
                PaydMenuPicker(selection: Binding(get: { groupId }, set: { handleGroupChange($0) }),
                               options: groupOptions)
                    .accessibilityLabel("Ledger group")
            }
        }
    }

    // MARK: - Splits section (AddExpenseModal.tsx:423-701)

    private var splitsSection: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 8) {
                HStack(spacing: 6) {
                    Image(systemName: "person.2")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(PaydTheme.brand400)
                        .accessibilityHidden(true)
                    Text("SPLIT PARTICIPANTS (\(selectedUserIds.count))")
                        .paydHeadingFont(size: 11)
                        .foregroundStyle(PaydTheme.zinc400)
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                }
                Spacer(minLength: 4)
                SwitchPills(selection: $splitMethod,
                            options: [(.equal, "Equal", nil), (.itemized, "Itemize", nil), (.exact, "Exact", nil)],
                            fontSize: 11, headingFont: true, fillsWidth: false, trackPadding: 2,
                            trackRadius: 8, pillRadius: 6, pillHeight: 24, pillHorizontalPadding: 10, spacing: 0)
                    .fixedSize()
            }

            FlowLayout(spacing: 6, lineSpacing: 6) {
                ForEach(availableUsers) { user in
                    ParticipantChip(title: user.name, initials: PaydFormat.firstLetter(user.name), discSize: 16,
                                    isSelected: selectedUserIds.contains(user.id)) {
                        toggleUserSelection(user.id)
                    }
                }
            }

            if let groupId {
                Text("Only members of \(store.state.groups.first { $0.id == groupId }?.name ?? "this group") can be part of this split.")
                    .font(.payd(size: 10))
                    .foregroundStyle(PaydTheme.zinc500)
                    .fixedSize(horizontal: false, vertical: true)
            }

            if let claimWarning {
                AmberNotice(text: claimWarning) { self.claimWarning = nil }
            }

            if splitMethod == .itemized {
                itemizedSection
                    .padding(.top, 4)
            }
            if splitMethod == .exact {
                exactSection
                    .padding(.top, 4)
            }
            previewSection
        }
        .padding(.top, 8)
        .overlay(alignment: .top) { Rectangle().fill(PaydTheme.border).frame(height: 1) }
    }

    private var itemizedSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("LINE ITEMS (\(manualItems.count))")
                    .paydHeadingFont(size: 12)
                    .foregroundStyle(PaydTheme.zinc300)
                Spacer()
                Button {
                    handleAddManualItem()
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: "plus").font(.system(size: 12, weight: .bold))
                        Text("Add Item").font(.payd(size: 12, bold: true))
                    }
                    .foregroundStyle(PaydTheme.brand400)
                }
                .buttonStyle(PressScaleButtonStyle())
            }

            // `max-h-56 overflow-y-auto`: scroll only once the list is taller than 224 pt.
            ViewThatFits(in: .vertical) {
                itemList
                ScrollView { itemList }
            }
            .frame(maxHeight: 224)

            subtotalBox
        }
    }

    private var itemList: some View {
        VStack(spacing: 8) {
            ForEach(Array(manualItems.enumerated()), id: \.element.id) { idx, item in
                LineItemCard(item: item, index: idx, canRemove: manualItems.count > 1,
                             participants: selectedUserIds.compactMap { uid in store.state.users.first { $0.id == uid } },
                             onRename: { name in updateItem(item.id) { $0.with(name: name) } },
                             onPrice: { price in updateItem(item.id) { $0.with(amountText: price) } },
                             onToggleClaim: { uid in handleToggleManualItemUser(item.id, uid) },
                             onRemove: { handleRemoveManualItem(item.id) })
            }
        }
    }

    private var subtotalBox: some View {
        let total = effectiveTotal
        let subtotal = itemsSubtotal
        return VStack(alignment: .leading, spacing: 2) {
            HStack {
                Text("Items subtotal")
                Spacer()
                Text(Currency.format(subtotal, currency: Currency.ledgerCode))
                    .font(.payd(size: 11, bold: true)).foregroundStyle(PaydTheme.zinc200)
            }
            HStack {
                Text("Bill total\(usingItemSubtotal ? " (from items)" : "")")
                Spacer()
                Text(Currency.format(total, currency: Currency.ledgerCode))
                    .font(.payd(size: 11, bold: true)).foregroundStyle(PaydTheme.zinc200)
            }
            if subtotal == 0 {
                Text("No item prices yet, so the total is split equally.")
                    .foregroundStyle(PaydTheme.zinc500)
                    .padding(.top, 2)
            } else if total > 0 && total != subtotal {
                Text("\(Currency.format(abs(total - subtotal), currency: Currency.ledgerCode)) \(total > subtotal ? "extra (fees, delivery, tax or tip)" : "less (discount or promo)") is shared in proportion to each person's items.")
                    .foregroundStyle(PaydTheme.amber300)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 2)
            }
        }
        .font(.payd(size: 11))
        .foregroundStyle(PaydTheme.zinc400)
        .monospacedDigit()
        .padding(10)
        .background(PaydTheme.surface202025, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
    }

    private var exactSection: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Exact amount per participant")
                .paydHeadingFont(size: 12)
                .foregroundStyle(PaydTheme.zinc300)
            ForEach(selectedUserIds, id: \.self) { uid in
                let name = store.state.users.first { $0.id == uid }?.name
                HStack(spacing: 12) {
                    Text(name ?? "")
                        .font(.payd(size: 12))
                        .foregroundStyle(PaydTheme.zinc300)
                    Spacer()
                    CompactNumberField(placeholder: "0.00",
                                       text: Binding(get: { exactAmounts[uid] ?? "" },
                                                     set: { exactAmounts = exactAmounts.merging([uid: $0]) { _, new in new } }),
                                       unit: Currency.ledgerCode,
                                       accessibilityLabel: "Amount for \(name ?? "participant") in AED")
                        .frame(width: 128)
                }
            }
        }
    }

    @ViewBuilder private var previewSection: some View {
        switch livePreview {
        case let .success(splits)?:
            VStack(alignment: .leading, spacing: 4) {
                Text(splitMethod == .equal ? "Equal shares:" : "Each person pays:")
                    .foregroundStyle(PaydTheme.zinc400)
                ForEach(splits, id: \.userId) { split in
                    HStack {
                        Text("\(rules.nameOf(split.userId)):").foregroundStyle(PaydTheme.zinc300)
                        Spacer()
                        Text(Currency.format(split.shareMinor, currency: Currency.ledgerCode))
                            .font(.payd(size: 12, bold: true))
                            .monospacedDigit()
                            .foregroundStyle(.white)
                    }
                }
            }
            .font(.payd(size: 12))
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(PaydTheme.surface202025, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        case let .failure(failure)?:
            AmberNotice(text: failure.message)
        case nil:
            EmptyView()
        }
    }

    private func submitRow(proxy: ScrollViewProxy) -> some View {
        HStack(spacing: 12) {
            Button("Cancel") { router.dismissSheet() }
                .buttonStyle(PaydSecondaryButtonStyle(height: 46))
            Button(type == .income ? "Save Income" : "Save Expense") {
                handleSubmit()
                if error != nil {
                    withAnimation { proxy.scrollTo(Self.topAnchor, anchor: .top) }
                }
            }
            .buttonStyle(PaydPrimaryButtonStyle(height: 46))
        }
    }

    // MARK: - Actions (AddExpenseModal.tsx:158-260)

    /// Applies a new participant list and drops claims by anyone no longer participating.
    private func applyParticipants(_ next: [String]) {
        selectedUserIds = next
        exactAmounts = exactAmounts.filter { next.contains($0.key) }
        let pruned = AddExpenseLogic.pruneClaims(manualItems, participantIds: next)
        manualItems = pruned.items
        let orphaned = pruned.orphaned
        if !orphaned.isEmpty {
            let one = orphaned.count == 1
            claimWarning = "\(orphaned.map { "\"\($0)\"" }.joined(separator: ", ")) \(one ? "was" : "were") claimed only by someone you removed, so \(one ? "it is" : "they are") now shared by everyone. Tap names to re-assign."
        }
    }

    private func handleGroupChange(_ gid: String?) {
        groupId = gid
        error = nil
        let allowed = rules.members(for: gid).map(\.id)
        if !allowed.contains(payerId) { payerId = rules.defaultPayer(for: gid) }
        // A group resets to all of its members; "Personal" keeps the current picks (everyone is eligible).
        let kept = selectedUserIds.filter { allowed.contains($0) }
        applyParticipants(gid != nil ? allowed : (kept.isEmpty ? [store.state.currentUserId] : kept))
    }

    private func toggleUserSelection(_ userId: String) {
        if selectedUserIds.contains(userId) {
            if selectedUserIds.count == 1 { return } // keep at least 1
            applyParticipants(selectedUserIds.filter { $0 != userId })
        } else {
            applyParticipants(selectedUserIds + [userId])
        }
    }

    private func updateItem(_ itemId: String, _ change: (FormItem) -> FormItem) {
        manualItems = manualItems.map { $0.id == itemId ? change($0) : $0 }
    }

    private func handleToggleManualItemUser(_ itemId: String, _ userId: String) {
        updateItem(itemId) { item in
            // Removing the last claimant makes the item shared by everyone again.
            item.assignedUserIds.contains(userId)
                ? item.with(assignedUserIds: item.assignedUserIds.filter { $0 != userId })
                : item.with(assignedUserIds: item.assignedUserIds + [userId])
        }
    }

    private func handleAddManualItem() {
        let base = "item-\(PaydJSON.epochMillis(Date()))"
        let id = manualItems.contains { $0.id == base } ? "\(base)-\(manualItems.count)" : base
        manualItems = manualItems + [FormItem(id: id, name: "Item \(manualItems.count + 1)", amountText: "")]
    }

    private func handleRemoveManualItem(_ itemId: String) {
        guard manualItems.count > 1 else { return }
        manualItems = manualItems.filter { $0.id != itemId }
    }

    private func handleSubmit() {
        error = nil
        if title.expensesTrimmed.isEmpty {
            error = AddExpenseLogic.friendlyError("Please enter a description.")
            return
        }
        var total = effectiveTotal
        if !usingItemSubtotal {
            switch AddExpenseLogic.parseAmountInput(amountText) {
            case let .failure(failure):
                error = AddExpenseLogic.friendlyError(isItemizedExpense && amountText.expensesTrimmed.isEmpty
                    ? "Enter a total amount, or add prices to the items." : failure.message)
                return
            case let .success(value):
                total = value
            }
        }
        let splits: [ShareAllocation]
        switch AddExpenseLogic.computeSplits(splitInput(total: total)) {
        case let .failure(failure):
            error = AddExpenseLogic.friendlyError(failure.message)
            return
        case let .success(value):
            splits = value
        }
        let trimmedNotes = notes.expensesTrimmed
        do {
            try store.addTransaction(NewTransaction(
                type: type, title: title.expensesTrimmed, amountMinor: total, currency: Currency.ledgerCode,
                categoryId: categoryId.isEmpty ? nil : categoryId, payerId: payerId, groupId: groupId,
                paymentMethod: paymentMethod, notes: trimmedNotes.isEmpty ? nil : trimmedNotes, splits: splits))
            router.dismissSheet()
        } catch let failure as LedgerInvariantError {
            error = AddExpenseLogic.friendlyError(failure.message)
        } catch let failure {
            Self.logger.error("addTransaction failed: \(String(describing: failure), privacy: .public)")
            error = AddExpenseLogic.friendlyError(failure.localizedDescription)
        }
    }
}

/// Who may take part and the defaults (AddExpenseModal.tsx:82-93, 138).
private struct AddExpenseRules {
    let state: LedgerState

    /// The group's members, or everyone for a personal expense.
    func members(for groupId: String?) -> [User] {
        guard let groupId else { return state.users }
        let members = LedgerQueries.groupMembers(groupId, in: state)
        return members.isEmpty ? state.users : members
    }

    func defaultSelection(for groupId: String?) -> [String] {
        groupId != nil ? members(for: groupId).map(\.id) : [state.currentUserId]
    }

    func defaultPayer(for groupId: String?) -> String {
        let members = members(for: groupId)
        return members.contains { $0.id == state.currentUserId }
            ? state.currentUserId : members.first?.id ?? state.currentUserId
    }

    var nameOf: @Sendable (String) -> String {
        let names = Dictionary(state.users.map { ($0.id, $0.name) }, uniquingKeysWith: { first, _ in first })
        return { id in
            guard let name = names[id], !name.isEmpty else { return "Someone" }
            return name
        }
    }
}

/// One itemized line (AddExpenseModal.tsx:527-607): name, price, remove, tap-to-claim chips.
private struct LineItemCard: View {
    let item: FormItem
    let index: Int
    let canRemove: Bool
    let participants: [User]
    let onRename: (String) -> Void
    let onPrice: (String) -> Void
    let onToggleClaim: (String) -> Void
    let onRemove: () -> Void

    var body: some View {
        let count = item.assignedUserIds.count
        let fraction = count > 1 ? "¹/\(count)" : ""
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                CompactTextField(placeholder: "Item \(index + 1)",
                                 text: Binding(get: { item.name }, set: onRename))
                CompactNumberField(placeholder: "0.00", text: Binding(get: { item.amountText }, set: onPrice),
                                   unit: Currency.ledgerCode,
                                   accessibilityLabel: "Price of \(item.name.isEmpty ? "item" : item.name) in AED")
                    .frame(width: 112)
                if canRemove {
                    Button(action: onRemove) {
                        Image(systemName: "trash")
                            .font(.system(size: 13))
                            .foregroundStyle(PaydTheme.zinc400)
                            .frame(width: 28, height: 28)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Remove \(item.name.isEmpty ? "item" : item.name)")
                }
            }
            FlowLayout(spacing: 6, lineSpacing: 6) {
                Text(count == 0 ? "Shared by all · tap to claim:" : "Claimed:")
                    .font(.payd(size: 10))
                    .foregroundStyle(PaydTheme.zinc500)
                ForEach(participants) { user in
                    let isClaimed = item.assignedUserIds.contains(user.id)
                    Button {
                        onToggleClaim(user.id)
                    } label: {
                        Text(isClaimed && !fraction.isEmpty ? "\(user.name) (\(fraction))" : user.name)
                            .font(.payd(size: 10, bold: isClaimed))
                            .foregroundStyle(isClaimed ? .white : PaydTheme.zinc400)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 2)
                            .background(isClaimed ? PaydTheme.brand600 : PaydTheme.cardSubtle,
                                        in: RoundedRectangle(cornerRadius: 6, style: .continuous))
                            .overlay {
                                if !isClaimed {
                                    RoundedRectangle(cornerRadius: 6, style: .continuous)
                                        .strokeBorder(Color.white.opacity(0.06))
                                }
                            }
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(isClaimed ? .isSelected : [])
                }
            }
            .padding(.top, 2)
        }
        .padding(12)
        .background(PaydTheme.surface202025, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(Color.white.opacity(0.06)))
    }
}
