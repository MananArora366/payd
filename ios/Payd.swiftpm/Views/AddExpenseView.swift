import SwiftUI
import PaydCore

struct AddExpenseView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(LedgerStore.self) private var store

    @State private var title: String = ""
    @State private var amountText: String = ""
    @State private var selectedCategoryId: String = SeedIDs.food
    @State private var date: Date = Date()
    @State private var notes: String = ""

    // Integer minor units (fils); 0 when the text is not a valid amount
    private var amountMinor: Int {
        Currency.parseMajorToMinor(amountText, currency: store.currentCurrency)
    }

    private var isValid: Bool {
        !title.trimmingCharacters(in: .whitespaces).isEmpty && amountMinor > 0
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Expense Details") {
                    TextField("What did you spend on?", text: $title)
                        .autocorrectionDisabled()

                    HStack {
                        Text(Currency.symbol(for: store.currentCurrency))
                            .foregroundStyle(.secondary)
                            .fontWeight(.semibold)
                        TextField("0.00", text: $amountText)
                            .keyboardType(.decimalPad)
                            .font(.title3)
                            .fontWeight(.medium)
                    }
                }

                Section("Category") {
                    Picker("Category", selection: $selectedCategoryId) {
                        ForEach(store.state.categories) { category in
                            Label(category.name, systemImage: category.icon)
                                .tag(category.id)
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
        let trimmedNotes = notes.trimmingCharacters(in: .whitespacesAndNewlines)
        let saved = store.addPersonalExpense(
            title: title.trimmingCharacters(in: .whitespaces),
            amountMinor: amountMinor,
            categoryId: selectedCategoryId,
            occurredAt: date,
            notes: trimmedNotes.isEmpty ? nil : trimmedNotes
        )
        // On failure the store sets errorMessage; keep the sheet open so input isn't lost
        if saved { dismiss() }
    }
}
