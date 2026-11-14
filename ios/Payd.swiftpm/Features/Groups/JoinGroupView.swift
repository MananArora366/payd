import SwiftUI
import PaydCore

/// Placeholder for the port of web/src/app/join/[token]/page.tsx (SPEC §4). The feature agent replaces the body;
/// the type name and init signature are fixed.
struct JoinGroupView: View {
    let token: String

    init(token: String) {
        self.token = token
    }

    var body: some View {
        Text("JoinGroupView")
            .font(.payd(size: 14))
            .foregroundStyle(PaydTheme.zinc400)
            .frame(maxWidth: .infinity)
            .padding(24)
    }
}
