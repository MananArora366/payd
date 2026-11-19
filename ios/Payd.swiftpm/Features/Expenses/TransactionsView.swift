import PaydCore
import SwiftUI

/// Port of web/src/components/transactions/TransactionsView.tsx: the Activity tab. Lists every expense
/// and income entry newest first, with search, type/category/group filters, an "Include Deleted"
/// toggle remembered for the session, and an active-volume summary. Tapping a row opens the detail sheet.
struct TransactionsView: View {
    @Environment(LedgerStore.self) private var store
    @Environment(AppRouter.self) private var router

    @State private var search = ""
    @State private var selectedType = "all"
    @State private var selectedCategoryId = "all"
    @State private var selectedGroupId = "all"
    /// Web `sessionStorage['payd:activity:showDeleted']`.
    @SceneStorage("payd:activity:showDeleted") private var showDeleted = false

    init() {}

    var body: some View {
        let state = store.state
        let rows = filtered(state)
        VStack(alignment: .leading, spacing: 24) {
            header
            filterBar(state, rows: rows)
            list(state, rows: rows)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: - Filtering (TransactionsView.tsx:64-83)

    private func filtered(_ state: LedgerState) -> [LedgerTransaction] {
        let query = search.lowercased()
        let hasQuery = !search.expensesTrimmed.isEmpty
        return SpendMath.sortedByDateDesc(state.transactions).filter { t in
            if !showDeleted && t.deletedAt != nil { return false }
            if selectedType != "all" && t.type.rawValue != selectedType { return false }
            if selectedCategoryId != "all" && t.categoryId != selectedCategoryId { return false }
            if selectedGroupId != "all" {
                if selectedGroupId == "personal" && t.groupId != nil { return false }
                if selectedGroupId != "personal" && t.groupId != selectedGroupId { return false }
            }
            if hasQuery {
                let payer = state.users.first { $0.id == t.payerId }?.name.lowercased() ?? ""
                let category = state.categories.first { $0.id == t.categoryId }?.name.lowercased() ?? ""
                let notes = (t.notes ?? "").lowercased()
                if !t.title.lowercased().contains(query) && !payer.contains(query)
                    && !category.contains(query) && !notes.contains(query) {
                    return false
                }
            }
            return true
        }
    }

    // MARK: - Header

    private var header: some View {
        VStack(alignment: .leading, spacing: 16) {
            ScreenTitle("Expense activity",
                        subtitle: "Every expense and income entry in one place. Settlements live in the Settle tab")
            Button {
                router.present(.addExpense(AddExpenseRequest(type: .expense)))
            } label: {
                HStack(spacing: 8) {
                    Image(systemName: "plus")
                        .font(.system(size: 14, weight: .heavy))
                        .accessibilityHidden(true)
                    Text("+ Add Expense")
                        .font(.payd(size: 14, bold: true))
                }
                .foregroundStyle(PaydTheme.zinc950)
                .padding(.horizontal, 16)
                .padding(.vertical, 10)
                .background(PaydTheme.brand400, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            }
            .buttonStyle(PressScaleButtonStyle())
        }
    }

    // MARK: - Filter controls

    private func filterBar(_ state: LedgerState, rows: [LedgerTransaction]) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            searchField
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8)], spacing: 8) {
                FilterSelect(selection: $selectedType, options: [
                    ("all", "All Types"), ("expense", "Expenses"), ("income", "Income"),
                ], accessibilityLabel: "Filter by type")
                FilterSelect(selection: $selectedCategoryId,
                             options: [("all", "All Categories")] + state.categories.map { ($0.id, $0.name) },
                             accessibilityLabel: "Filter by category")
                FilterSelect(selection: $selectedGroupId,
                             options: [("all", "All Groups"), ("personal", "Personal Only")]
                                + state.groups.map { ($0.id, $0.name) },
                             accessibilityLabel: "Filter by group")
                includeDeletedToggle
            }
            summary(rows)
                .padding(.top, 4)
        }
        .paydCard(padding: 16)
    }

    private var searchField: some View {
        HStack(spacing: 10) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 14))
                .foregroundStyle(PaydTheme.zinc400)
                .accessibilityHidden(true)
            TextField("", text: $search,
                      prompt: Text("Search by title, notes, payer, or category...").foregroundStyle(PaydTheme.zinc600))
                .font(.payd(size: 12))
                .foregroundStyle(.white)
                .tint(PaydTheme.brand400)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .submitLabel(.search)
                .accessibilityLabel("Search transactions")
            if !search.isEmpty {
                Button {
                    search = ""
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundStyle(PaydTheme.zinc500)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Clear search")
            }
        }
        .padding(.leading, 14)
        .padding(.trailing, 12)
        .frame(minHeight: 36)
        .background(PaydTheme.canvas, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(Color.white.opacity(0.1)))
    }

    private var includeDeletedToggle: some View {
        Button {
            showDeleted.toggle()
        } label: {
            HStack(spacing: 8) {
                Image(systemName: showDeleted ? "checkmark.square.fill" : "square")
                    .font(.system(size: 14))
                    .foregroundStyle(showDeleted ? PaydTheme.brand600 : PaydTheme.zinc500)
                    .accessibilityHidden(true)
                Text("Include Deleted")
                    .font(.payd(size: 11))
                    .foregroundStyle(PaydTheme.zinc400)
                    .lineLimit(1)
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 12)
            .frame(maxWidth: .infinity, minHeight: 34)
            .background(PaydTheme.canvas, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(Color.white.opacity(0.1)))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Include Deleted")
        .accessibilityAddTraits(showDeleted ? .isSelected : [])
    }

    /// TransactionsView.tsx:181-195.
    private func summary(_ rows: [LedgerTransaction]) -> some View {
        let volume = SpendMath.volumeByType(rows)
        let currency = store.currentUser.defaultCurrency
        let lead = "Showing \(rows.count) \(rows.count == 1 ? "entry" : "entries") • Active volume: "
        let spent = selectedType != "income"
            ? Text("\(Currency.format(volume.expenseMinor, currency: currency)) spent")
                .font(.payd(size: 11, bold: true)).foregroundStyle(Color.white)
            : Text("")
        let separator = selectedType == "all" && volume.incomeMinor > 0 ? " · " : ""
        let showIncome = selectedType != "expense" && (selectedType == "income" || volume.incomeMinor > 0)
        let income = showIncome
            ? Text("+\(Currency.format(volume.incomeMinor, currency: currency)) income")
                .font(.payd(size: 11, bold: true)).foregroundStyle(ExpensesPalette.income)
            : Text("")
        return Text("\(lead)\(spent)\(separator)\(income)")
            .font(.payd(size: 11))
            .foregroundStyle(PaydTheme.zinc400)
            .frame(maxWidth: .infinity, alignment: .leading)
            .fixedSize(horizontal: false, vertical: true)
    }

    // MARK: - List

    @ViewBuilder
    private func list(_ state: LedgerState, rows: [LedgerTransaction]) -> some View {
        if rows.isEmpty {
            VStack(spacing: 0) {
                Image(systemName: "line.3.horizontal.decrease")
                    .font(.system(size: 28))
                    .foregroundStyle(PaydTheme.zinc500)
                    .opacity(0.5)
                    .padding(.bottom, 8)
                    .accessibilityHidden(true)
                Text("No matching transactions")
                    .paydHeadingFont(size: 14)
                    .foregroundStyle(.white)
                Text("Try clearing search filters or add a new transaction.")
                    .font(.payd(size: 12))
                    .foregroundStyle(PaydTheme.zinc400)
                    .multilineTextAlignment(.center)
                    .padding(.top, 4)
            }
            .frame(maxWidth: .infinity)
            .paydCard(padding: 48)
        } else {
            LazyVStack(spacing: 8) {
                ForEach(rows) { t in
                    ActivityRow(transaction: t, state: state) {
                        router.present(.transactionDetail(transactionId: t.id))
                    }
                }
            }
        }
    }
}

/// One activity row (TransactionsView.tsx:215-282).
private struct ActivityRow: View {
    let transaction: LedgerTransaction
    let state: LedgerState
    let onSelect: () -> Void

    var body: some View {
        let t = transaction
        let category = state.categories.first { $0.id == t.categoryId }
        let payer = state.users.first { $0.id == t.payerId }
        let group = state.groups.first { $0.id == t.groupId }
        let isIncome = t.type == .income
        let isDeleted = t.deletedAt != nil
        let payerLabel = payer?.id == state.currentUserId ? "You" : (payer?.name ?? "")

        Button(action: onSelect) {
            HStack(spacing: 12) {
                Text(PaydFormat.categoryEmojiActivity(category?.name))
                    .font(.system(size: 18))
                    .frame(width: 40, height: 40)
                    .background(PaydTheme.brand500.opacity(0.1), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                    .accessibilityHidden(true)

                VStack(alignment: .leading, spacing: 4) {
                    HStack(spacing: 8) {
                        Text(t.title)
                            .font(.payd(size: 14, bold: true))
                            .foregroundStyle(.white)
                            .multilineTextAlignment(.leading)
                            .fixedSize(horizontal: false, vertical: true)
                        if isDeleted {
                            Text("REVERSED")
                                .paydHeadingFont(size: 10)
                                .foregroundStyle(PaydTheme.rose400)
                                .padding(.horizontal, 6)
                                .padding(.vertical, 2)
                                .background(PaydTheme.rose500.opacity(0.2), in: RoundedRectangle(cornerRadius: 4))
                                .accessibilityLabel("Reversed")
                        }
                        if let group {
                            Text(group.name)
                                .paydHeadingFont(size: 10)
                                .foregroundStyle(PaydTheme.brand300)
                                .lineLimit(1)
                                .padding(.horizontal, 8)
                                .padding(.vertical, 2)
                                .background(PaydTheme.brand500.opacity(0.2), in: Capsule())
                        }
                    }
                    HStack(spacing: 8) {
                        Text(category?.name ?? "")
                        Text("•")
                        Text("\(isIncome ? "Received by" : "Paid by") \(payerLabel)")
                        Text("•")
                        Text(PaydFormat.shortDate(t.occurredAt))
                    }
                    .font(.payd(size: 11))
                    .foregroundStyle(PaydTheme.zinc400)
                    .lineLimit(1)
                    .minimumScaleFactor(0.85)
                }
                Spacer(minLength: 8)
                Text("\(isIncome ? "+" : "")\(Currency.format(t.amountMinor, currency: t.currency))")
                    .font(.payd(size: 14, bold: true))
                    .monospacedDigit()
                    .strikethrough(isDeleted)
                    .foregroundStyle(isDeleted ? PaydTheme.zinc500 : isIncome ? ExpensesPalette.income : .white)
            }
            .padding(16)
            .background(isDeleted ? PaydTheme.rose500.opacity(0.05) : PaydTheme.card,
                        in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous)
                .strokeBorder(isDeleted ? PaydTheme.rose500.opacity(0.2) : PaydTheme.border))
            .opacity(isDeleted ? 0.6 : 1)
            .contentShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        }
        .buttonStyle(PressScaleButtonStyle(scale: 0.98))
    }
}

/// Compact web `<select>` for the filter grid (`px-3 py-2 text-xs bg-[#09090b] border-white/10 rounded-xl text-zinc-300`).
private struct FilterSelect: View {
    @Binding var selection: String
    let options: [(value: String, label: String)]
    let accessibilityLabel: String

    var body: some View {
        Menu {
            Picker(accessibilityLabel, selection: $selection) {
                ForEach(options.indices, id: \.self) { index in
                    Text(options[index].label).tag(options[index].value)
                }
            }
        } label: {
            HStack(spacing: 4) {
                Text(options.first { $0.value == selection }?.label ?? "")
                    .font(.payd(size: 12))
                    .foregroundStyle(PaydTheme.zinc300)
                    .lineLimit(1)
                Spacer(minLength: 4)
                Image(systemName: "chevron.down")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundStyle(PaydTheme.zinc500)
            }
            .padding(.horizontal, 12)
            .frame(maxWidth: .infinity, minHeight: 34)
            .background(PaydTheme.canvas, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(Color.white.opacity(0.1)))
            .contentShape(Rectangle())
        }
        .accessibilityLabel(accessibilityLabel)
        .accessibilityValue(options.first { $0.value == selection }?.label ?? "")
    }
}
