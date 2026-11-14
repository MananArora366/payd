import SwiftUI
import PaydCore

struct ContentView: View {
    @Environment(LedgerStore.self) private var store

    @State private var showingAddSheet = false
    @State private var showingCameraSheet = false
    @State private var selectedFilterCategoryId: String? = nil
    @State private var searchText = ""
    @State private var isSearching = false
    @FocusState private var searchFocused: Bool

    // Active transactions involving the current user, newest first
    private var activity: [LedgerTransaction] {
        LedgerQueries.activity(for: store.currentUserId, in: store.state)
    }

    // Filtered transactions based on search and category filter
    private var filteredTransactions: [LedgerTransaction] {
        activity.filter { txn in
            let matchesCategory = selectedFilterCategoryId == nil || txn.categoryId == selectedFilterCategoryId
            let categoryName = LedgerQueries.category(txn.categoryId, in: store.state)?.name ?? ""
            let matchesSearch = searchText.isEmpty ||
                txn.title.localizedCaseInsensitiveContains(searchText) ||
                categoryName.localizedCaseInsensitiveContains(searchText)
            return matchesCategory && matchesSearch
        }
    }


    var body: some View {
        NavigationStack {
            List {
                // In the toolbar the system glass bubble truncates the wordmark, so it heads the page
                PaydWordmark()
                    .padding(.horizontal, 4)
                    .paydListRow(bottom: 12)

                if isSearching {
                    searchField
                        .paydListRow(bottom: 12)
                }

                // Violet "Total Net Balance" hero
                SummaryCardView(
                    netMinor: Balances.net(transactions: store.state.transactions, splits: store.state.splits,
                                           settlements: store.state.settlements)[store.currentUserId] ?? 0,
                    owed: LedgerQueries.owedSummary(for: store.currentUserId, in: store.state),
                    totalSpentMinor: LedgerQueries.personalSpend(for: store.currentUserId, in: store.state).totalSpentMinor,
                    groupCount: LedgerQueries.groups(for: store.currentUserId, in: store.state).count,
                    currency: store.currentCurrency,
                    onAddExpense: { showingAddSheet = true },
                    onScanReceipt: { showingCameraSheet = true }
                )
                .paydListRow(top: 8, bottom: 20)

                // Category filter pills
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        FilterChip(title: "All", isSelected: selectedFilterCategoryId == nil) {
                            selectedFilterCategoryId = nil
                        }
                        ForEach(store.state.categories) { category in
                            FilterChip(
                                title: category.name,
                                icon: category.icon,
                                isSelected: selectedFilterCategoryId == category.id
                            ) {
                                selectedFilterCategoryId = selectedFilterCategoryId == category.id ? nil : category.id
                            }
                        }
                    }
                }
                .paydListRow(bottom: 16)

                HStack {
                    PaydSectionLabel(title: "Recent Expenses")
                    Spacer()
                    Text("\(filteredTransactions.count) shown")
                        .font(.payd(.caption).weight(.bold))
                        .foregroundStyle(PaydTheme.violetLight)
                }
                .padding(.horizontal, 4)
                .paydListRow(bottom: 10)

                if filteredTransactions.isEmpty {
                    ContentUnavailableView(
                        searchText.isEmpty ? "No expenses recorded yet" : "No matching expenses",
                        systemImage: searchText.isEmpty ? "receipt" : "magnifyingglass",
                        description: Text(searchText.isEmpty ? "Tap Add Expense to start." : "Try a different search term or clear the filter.")
                    )
                    .foregroundStyle(PaydTheme.textSecondary)
                    .padding(.vertical, 24)
                    .paydCard(cornerRadius: 24)
                    .paydListRow()
                } else {
                    ForEach(filteredTransactions) { txn in
                        ExpenseRowView(transaction: txn, state: store.state)
                            .paydListRow(bottom: 10)
                    }
                    .onDelete(perform: deleteExpenses)
                }
            }
            .listStyle(.plain)
            .scrollContentBackground(.hidden)
            .background(PaydTheme.canvas)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItemGroup(placement: .topBarTrailing) {
                    Button {
                        withAnimation(.snappy) { isSearching.toggle() }
                        searchFocused = isSearching
                        if !isSearching { searchText = "" }
                    } label: {
                        Image(systemName: "magnifyingglass")
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundStyle(isSearching ? PaydTheme.violetLight : PaydTheme.textSecondary)
                    }
                    .accessibilityLabel(isSearching ? "Close search" : "Search expenses")

                    Button {
                        showingCameraSheet = true
                    } label: {
                        Image(systemName: "camera")
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundStyle(PaydTheme.textSecondary)
                    }
                    .accessibilityLabel("Scan receipt")

                    Button {
                        showingAddSheet = true
                    } label: {
                        Image(systemName: "plus")
                            .font(.system(size: 16, weight: .bold))
                            .foregroundStyle(.white)
                            .frame(width: 34, height: 34)
                            .background(PaydTheme.violet, in: Circle())
                            .shadow(color: PaydTheme.violet.opacity(0.5), radius: 8)
                    }
                    .accessibilityLabel("Add expense")
                }
            }
            .sheet(isPresented: $showingAddSheet) {
                AddExpenseView()
            }
            .sheet(isPresented: $showingCameraSheet) {
                CameraScannerView()
            }
            // Sheets present their own alert; this one would be hidden underneath them
            .ledgerErrorAlert(store, isEnabled: !showingAddSheet && !showingCameraSheet)
        }
    }

    private var searchField: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass")
                .foregroundStyle(PaydTheme.textMuted)
            TextField("Search expenses...", text: $searchText)
                .font(.payd(.subheadline))
                .foregroundStyle(.white)
                .focused($searchFocused)
                .submitLabel(.search)
                .autocorrectionDisabled()
            if !searchText.isEmpty {
                Button {
                    searchText = ""
                } label: {
                    Image(systemName: "xmark.circle.fill").foregroundStyle(PaydTheme.textMuted)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Clear search")
            }
        }
        .padding(.horizontal, 14)
        .frame(height: 44)
        .background(PaydTheme.card, in: Capsule())
        .overlay(Capsule().strokeBorder(searchFocused ? PaydTheme.violet.opacity(0.6) : PaydTheme.border))
    }

    private func deleteExpenses(at offsets: IndexSet) {
        let ids = offsets.map { filteredTransactions[$0].id }
        withAnimation {
            for id in ids {
                store.softDelete(transactionId: id)
            }
        }
    }
}

// Dark capsule filter chip; violet when selected
struct FilterChip: View {
    let title: String
    var icon: String? = nil
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 6) {
                if let icon {
                    Image(systemName: icon)
                        .font(.payd(.caption))
                }
                Text(title)
                    .font(.payd(.caption).weight(.bold))
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 8)
            .background(isSelected ? PaydTheme.violet : PaydTheme.card, in: Capsule())
            .overlay(Capsule().strokeBorder(isSelected ? .clear : PaydTheme.border))
            .foregroundStyle(isSelected ? .white : PaydTheme.textSecondary)
        }
        .buttonStyle(.plain)
    }
}

private extension View {
    /// Full-width list row with no system chrome, so cards sit directly on the canvas.
    func paydListRow(top: CGFloat = 0, bottom: CGFloat = 0) -> some View {
        listRowInsets(EdgeInsets(top: top, leading: 16, bottom: bottom, trailing: 16))
            .listRowBackground(Color.clear)
            .listRowSeparator(.hidden)
    }
}
