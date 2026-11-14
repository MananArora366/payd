import SwiftUI
import PaydCore

struct ContentView: View {
    @Environment(LedgerStore.self) private var store

    @State private var showingAddSheet = false
    @State private var showingCameraSheet = false
    @State private var selectedFilterCategoryId: String? = nil
    @State private var searchText = ""

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

    private var errorAlertBinding: Binding<Bool> {
        Binding(get: { store.errorMessage != nil }, set: { if !$0 { store.errorMessage = nil } })
    }

    var body: some View {
        NavigationStack {
            List {
                // Section 1: Dashboard Summary Card
                Section {
                    SummaryCardView(
                        totalSpentMinor: LedgerQueries.personalSpend(for: store.currentUserId, in: store.state).totalSpentMinor,
                        expenseCount: activity.count,
                        owed: LedgerQueries.owedSummary(for: store.currentUserId, in: store.state),
                        currency: store.currentCurrency
                    )
                    .listRowInsets(EdgeInsets(top: 8, leading: 16, bottom: 8, trailing: 16))
                    .listRowBackground(Color.clear)
                }

                // Section 2: Category Filter Pills
                Section {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            FilterChip(
                                title: "All",
                                isSelected: selectedFilterCategoryId == nil
                            ) {
                                selectedFilterCategoryId = nil
                            }

                            ForEach(store.state.categories) { category in
                                FilterChip(
                                    title: category.name,
                                    icon: category.icon,
                                    isSelected: selectedFilterCategoryId == category.id
                                ) {
                                    if selectedFilterCategoryId == category.id {
                                        selectedFilterCategoryId = nil
                                    } else {
                                        selectedFilterCategoryId = category.id
                                    }
                                }
                            }
                        }
                        .padding(.horizontal, 4)
                        .padding(.vertical, 4)
                    }
                    .listRowInsets(EdgeInsets(top: 0, leading: 16, bottom: 0, trailing: 16))
                    .listRowBackground(Color.clear)
                }

                // Section 3: Expense List
                Section("Recent Transactions") {
                    if filteredTransactions.isEmpty {
                        ContentUnavailableView(
                            searchText.isEmpty ? "No Expenses Yet" : "No Matching Expenses",
                            systemImage: searchText.isEmpty ? "tray.fill" : "magnifyingglass",
                            description: Text(searchText.isEmpty ? "Tap the plus button to record your first expense." : "Try a different search term or clear the filter.")
                        )
                        .listRowBackground(Color.clear)
                        .padding(.vertical, 30)
                    } else {
                        ForEach(filteredTransactions) { txn in
                            ExpenseRowView(
                                transaction: txn,
                                category: LedgerQueries.category(txn.categoryId, in: store.state)
                            )
                        }
                        .onDelete(perform: deleteExpenses)
                    }
                }
            }
            .listStyle(.insetGrouped)
            .navigationTitle("Payd iOS")
            .searchable(text: $searchText, prompt: "Search expenses...")
            .toolbar {
                ToolbarItemGroup(placement: .primaryAction) {
                    Button {
                        showingCameraSheet = true
                    } label: {
                        Image(systemName: "camera.viewfinder")
                            .font(.system(size: 20, weight: .bold))
                            .foregroundStyle(.tint)
                    }

                    Button {
                        showingAddSheet = true
                    } label: {
                        Image(systemName: "plus.circle.fill")
                            .font(.system(size: 22))
                    }
                }
            }
            .sheet(isPresented: $showingAddSheet) {
                AddExpenseView()
            }
            .sheet(isPresented: $showingCameraSheet) {
                CameraScannerView()
            }
            .alert("Something went wrong", isPresented: errorAlertBinding) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(store.errorMessage ?? "")
            }
        }
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

// Subview for Category Filter Chips
struct FilterChip: View {
    let title: String
    var icon: String? = nil
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 6) {
                if let icon = icon {
                    Image(systemName: icon)
                        .font(.caption)
                }
                Text(title)
                    .font(.caption)
                    .fontWeight(.medium)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(isSelected ? Color.accentColor : Color(.secondarySystemFill))
            .foregroundStyle(isSelected ? .white : .primary)
            .clipShape(Capsule())
        }
        .buttonStyle(.plain)
    }
}
