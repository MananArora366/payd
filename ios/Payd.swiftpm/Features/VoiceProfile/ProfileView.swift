import SwiftUI
import PaydCore

/// Placeholder for the port of web/src/components/profile/ProfileView.tsx (SPEC §4). The feature agent replaces the body;
/// the type name and init signature are fixed.
struct ProfileView: View {
    init() {}

    var body: some View {
        Text("ProfileView")
            .font(.payd(size: 14))
            .foregroundStyle(PaydTheme.zinc400)
            .frame(maxWidth: .infinity)
            .padding(24)
    }
}
