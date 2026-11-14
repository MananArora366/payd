import SwiftUI
import PaydCore

/// Placeholder for the port of web/src/components/modals/CreateGroupModal.tsx (SPEC §4). The feature agent replaces the body;
/// the type name and init signature are fixed.
struct CreateGroupView: View {
    init() {}

    var body: some View {
        Text("CreateGroupView")
            .font(.payd(size: 14))
            .foregroundStyle(PaydTheme.zinc400)
            .frame(maxWidth: .infinity)
            .padding(24)
    }
}
