import SwiftUI

extension View {
    /// Shows `store.errorMessage` and clears it on dismiss. Attach it to every presented
    /// sheet as well, because an alert on a view underneath a sheet is not shown.
    func ledgerErrorAlert(_ store: LedgerStore, isEnabled: Bool = true) -> some View {
        alert("Something went wrong", isPresented: Binding(
            get: { isEnabled && store.errorMessage != nil },
            set: { if !$0 { store.errorMessage = nil } }
        )) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(store.errorMessage ?? "")
        }
    }
}
