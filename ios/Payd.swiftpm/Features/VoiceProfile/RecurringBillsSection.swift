import SwiftUI
import PaydCore

/// Placeholder for the port of web/src/components/recurring/RecurringBillsSection.tsx (SPEC §4). The feature agent replaces the body;
/// the type name and init signature are fixed.
struct RecurringBillsSection: View {
    let groupId: String?

    init(groupId: String?) {
        self.groupId = groupId
    }

    var body: some View {
        Text("RecurringBillsSection")
            .font(.payd(size: 14))
            .foregroundStyle(PaydTheme.zinc400)
            .frame(maxWidth: .infinity)
            .padding(24)
    }
}
