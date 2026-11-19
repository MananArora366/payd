import SwiftUI

/// Maps each `PaydSheet` to its feature entry view with the shared sheet presentation.
struct PaydSheetContent: View {
    let sheet: PaydSheet
    @Environment(LedgerStore.self) private var store

    var body: some View {
        content
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
            .background(PaydTheme.card.ignoresSafeArea())
            .presentationDetents([.large])
            .presentationDragIndicator(.visible)
            .presentationBackground(PaydTheme.card)
            .preferredColorScheme(.dark)
            .tint(PaydTheme.brand400)
            .ledgerErrorAlert(store)
    }

    @ViewBuilder private var content: some View {
        switch sheet {
        case let .addExpense(request): AddExpenseView(request: request)
        case let .newSplit(defaultGroupId): NewSplitView(defaultGroupId: defaultGroupId)
        case let .recordSettlement(request): RecordSettlementView(request: request)
        case let .careemPay(request): CareemPayView(request: request)
        case .createGroup: CreateGroupView()
        case let .transactionDetail(transactionId): TransactionDetailView(transactionId: transactionId)
        case .receiptScanner: ReceiptScannerView()
        case let .roulette(defaultGroupId): FairPayerRouletteView(defaultGroupId: defaultGroupId)
        case let .createRecurringBill(defaultGroupId): CreateRecurringBillView(defaultGroupId: defaultGroupId)
        case let .joinInvite(token): JoinGroupView(token: token)
        }
    }
}
