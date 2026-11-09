import SwiftUI
import SwiftData

struct ContentView: View {
    @Environment(\.modelContext) private var modelContext
    @Query(sort: \Expense.date, order: .reverse) private var expenses: [Expense]

    @State private var showingAddSheet = false
    @State private var showingCameraSheet = false
    @State private var selectedFilterCategory: ExpenseCategory? = nil
    @State private var searchText = ""

    // Filtered expenses based on search and category filter
    private var filteredExpenses: [Expense] {
        expenses.filter { expense in
            let matchesCategory = selectedFilterCategory == nil || expense.category == selectedFilterCategory
            let matchesSearch = searchText.isEmpty ||
                expense.title.localizedCaseInsensitiveContains(searchText) ||
                expense.categoryRaw.localizedCaseInsensitiveContains(searchText)
            return matchesCategory && matchesSearch
        }
    }

    // Total spending calculation
    private var totalSpending: Decimal {
        expenses.reduce(Decimal.zero) { $0 + $1.amount }
    }

    var body: some View {
        NavigationStack {
            List {
                // Section 1: Dashboard Summary Card
                Section {
                    SummaryCardView(
                        totalAmount: totalSpending,
                        expenseCount: expenses.count
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
                                isSelected: selectedFilterCategory == nil
                            ) {
                                selectedFilterCategory = nil
                            }

                            ForEach(ExpenseCategory.allCases) { category in
                                FilterChip(
                                    title: category.rawValue,
                                    icon: category.icon,
                                    isSelected: selectedFilterCategory == category
                                ) {
                                    if selectedFilterCategory == category {
                                        selectedFilterCategory = nil
                                    } else {
                                        selectedFilterCategory = category
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
                    if filteredExpenses.isEmpty {
                        ContentUnavailableView(
                            searchText.isEmpty ? "No Expenses Yet" : "No Matching Expenses",
                            systemImage: searchText.isEmpty ? "tray.fill" : "magnifyingglass",
                            description: Text(searchText.isEmpty ? "Tap the plus button to record your first expense." : "Try a different search term or clear the filter.")
                        )
                        .listRowBackground(Color.clear)
                        .padding(.vertical, 30)
                    } else {
                        ForEach(filteredExpenses) { expense in
                            ExpenseRowView(expense: expense)
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
        }
    }

    private func deleteExpenses(at offsets: IndexSet) {
        withAnimation {
            for index in offsets {
                let expense = filteredExpenses[index]
                modelContext.delete(expense)
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
