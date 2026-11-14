import SwiftUI
import PaydCore

/// Placeholder for the port of web/src/components/modals/CareemPayModal.tsx (SPEC §4). The feature agent replaces the body;
/// the type name and init signature are fixed.
struct CareemPayView: View {
    let request: CareemPayRequest

    init(request: CareemPayRequest) {
        self.request = request
    }

    var body: some View {
        Text("CareemPayView")
            .font(.payd(size: 14))
            .foregroundStyle(PaydTheme.zinc400)
            .frame(maxWidth: .infinity)
            .padding(24)
    }
}
