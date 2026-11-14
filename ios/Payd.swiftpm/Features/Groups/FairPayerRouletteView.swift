import SwiftUI
import PaydCore

/// Placeholder for the port of web/src/components/modals/FairPayerRouletteModal.tsx (SPEC §4). The feature agent replaces the body;
/// the type name and init signature are fixed.
struct FairPayerRouletteView: View {
    let defaultGroupId: String?

    init(defaultGroupId: String?) {
        self.defaultGroupId = defaultGroupId
    }

    var body: some View {
        Text("FairPayerRouletteView")
            .font(.payd(size: 14))
            .foregroundStyle(PaydTheme.zinc400)
            .frame(maxWidth: .infinity)
            .padding(24)
    }
}
