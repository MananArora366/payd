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

    init(draft: VoiceExpenseDraft? = nil) {
        _title = State(initialValue: draft?.title ?? "")
        _amountText = State(initialValue: draft?.amountMinor.map(Self.editableAmount) ?? "")
    }

    /// Minor units → "22.00" using the device's decimal separator, so it parses back exactly.
    private static func editableAmount(_ minor: Int) -> String {
        let decimals = Currency.config(for: Currency.defaultCode).decimals
        let factor = (0..<decimals).reduce(1) { acc, _ in acc * 10 }
        let fraction = String(minor % factor)
        let padded = String(repeating: "0", count: max(0, decimals - fraction.count)) + fraction
        let separator = Locale.current.decimalSeparator ?? "."
        return decimals > 0 ? "\(minor / factor)\(separator)\(padded)" : "\(minor / factor)"
    }

    // Integer minor units (fils); 0 when the text is not a valid amount
    private var amountMinor: Int {
        Currency.parseMajorToMinor(amountText, currency: store.currentCurrency,
                                   decimalSeparator: Locale.current.decimalSeparator ?? ".")
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
                            .font(.payd(.title3))
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
            .scrollContentBackground(.hidden)
            .background(PaydTheme.canvas)
            .navigationTitle("New Expense")
            .navigationBarTitleDisplayMode(.inline)
            .ledgerErrorAlert(store)
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
