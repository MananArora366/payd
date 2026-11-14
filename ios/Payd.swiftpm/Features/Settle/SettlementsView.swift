import SwiftUI
import PaydCore

/// Placeholder for the port of web/src/components/settlements/SettlementsView.tsx (SPEC §4). The feature agent replaces the body;
/// the type name and init signature are fixed.
struct SettlementsView: View {
    init() {}

    var body: some View {
        Text("SettlementsView")
            .font(.payd(size: 14))
            .foregroundStyle(PaydTheme.zinc400)
            .frame(maxWidth: .infinity)
            .padding(24)
    }
}
