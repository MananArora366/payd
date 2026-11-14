import SwiftUI
import PaydCore

/// Placeholder for the port of web/src/components/groups/GroupsView.tsx (SPEC §4). The feature agent replaces the body;
/// the type name and init signature are fixed.
struct GroupsView: View {
    init() {}

    var body: some View {
        Text("GroupsView")
            .font(.payd(size: 14))
            .foregroundStyle(PaydTheme.zinc400)
            .frame(maxWidth: .infinity)
            .padding(24)
    }
}
