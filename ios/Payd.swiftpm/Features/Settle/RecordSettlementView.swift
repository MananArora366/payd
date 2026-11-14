import SwiftUI
import PaydCore

/// Placeholder for the port of web/src/components/modals/RecordSettlementModal.tsx (SPEC §4). The feature agent replaces the body;
/// the type name and init signature are fixed.
struct RecordSettlementView: View {
    let request: SettlementRequest

    init(request: SettlementRequest) {
        self.request = request
    }

    var body: some View {
        Text("RecordSettlementView")
            .font(.payd(size: 14))
            .foregroundStyle(PaydTheme.zinc400)
            .frame(maxWidth: .infinity)
            .padding(24)
    }
}
