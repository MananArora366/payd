import SwiftUI
import SwiftData

struct AddExpenseView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.modelContext) private var modelContext

    @State private var title: String = ""
    @State private var amountText: String = ""
    @State private var selectedCategory: ExpenseCategory = .food
    @State private var date: Date = Date()
    @State private var notes: String = ""

    private var isValid: Bool {
        guard !title.trimmingCharacters(in: .whitespaces).isEmpty else { return false }
        guard let amount = Decimal(string: amountText), amount > 0 else { return false }
        return true
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Expense Details") {
                    TextField("What did you spend on?", text: $title)
                        .autocorrectionDisabled()

                    HStack {
                        Text("AED")
                            .foregroundStyle(.secondary)
                            .fontWeight(.semibold)
                        TextField("0.00", text: $amountText)
                            .keyboardType(.decimalPad)
                            .font(.title3)
                            .fontWeight(.medium)
                    }
                }

                Section("Category") {
                    Picker("Category", selection: $selectedCategory) {
                        ForEach(ExpenseCategory.allCases) { category in
                            Label(category.rawValue, systemImage: category.icon)
                                .tag(category)
                        }
                    }
                    .pickerStyle(.menu)
                }

                Section("Date & Time") {
                    DatePicker("Date", selection: $date, displayedComponents: [.date, .hourAndMinute])
                }

                Section("Optional Notes") {
                    TextField("Add notes (optional)", text: $notes, axis: .vertical)
                        .lineLimit(2...4)
                }
            }
            .navigationTitle("New Expense")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        dismiss()
                    }
                }

                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        saveExpense()
                    }
                    .disabled(!isValid)
                    .fontWeight(.bold)
                }
            }
        }
    }

    private func saveExpense() {
        guard let amount = Decimal(string: amountText) else { return }
        
        let newExpense = Expense(
            title: title.trimmingCharacters(in: .whitespaces),
            amount: amount,
            category: selectedCategory,
            date: date,
            notes: notes
        )

        modelContext.insert(newExpense)
        dismiss()
    }
}
