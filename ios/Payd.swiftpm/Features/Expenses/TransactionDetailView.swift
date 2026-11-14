import SwiftUI
import PaydCore

/// Placeholder for the port of web/src/components/modals/TransactionDetailDrawer.tsx (SPEC §4). The feature agent replaces the body;
/// the type name and init signature are fixed.
struct TransactionDetailView: View {
    let transactionId: String

    init(transactionId: String) {
        self.transactionId = transactionId
    }

    var body: some View {
        Text("TransactionDetailView")
            .font(.payd(size: 14))
            .foregroundStyle(PaydTheme.zinc400)
            .frame(maxWidth: .infinity)
            .padding(24)
    }
}
