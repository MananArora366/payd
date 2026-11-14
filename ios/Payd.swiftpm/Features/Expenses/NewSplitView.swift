import SwiftUI
import PaydCore

/// Placeholder for the port of web/src/components/modals/NewSplitModal.tsx (SPEC §4). The feature agent replaces the body;
/// the type name and init signature are fixed.
struct NewSplitView: View {
    let defaultGroupId: String?

    init(defaultGroupId: String?) {
        self.defaultGroupId = defaultGroupId
    }

    var body: some View {
        Text("NewSplitView")
            .font(.payd(size: 14))
            .foregroundStyle(PaydTheme.zinc400)
            .frame(maxWidth: .infinity)
            .padding(24)
    }
}
