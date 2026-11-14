import SwiftUI
import PaydCore

/// Placeholder for the port of web/src/components/modals/AddExpenseModal.tsx (SPEC §4). The feature agent replaces the body;
/// the type name and init signature are fixed.
struct AddExpenseView: View {
    let request: AddExpenseRequest

    init(request: AddExpenseRequest) {
        self.request = request
    }

    var body: some View {
        Text("AddExpenseView")
            .font(.payd(size: 14))
            .foregroundStyle(PaydTheme.zinc400)
            .frame(maxWidth: .infinity)
            .padding(24)
    }
}
