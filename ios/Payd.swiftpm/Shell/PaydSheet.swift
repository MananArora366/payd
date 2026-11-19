import PaydCore

/// The web tab ids (web/src/app/page.tsx `activeTab`).
enum PaydTab: String, Hashable, CaseIterable {
    case home, groups, settlements, transactions, profile
}

/// AddExpenseModal open parameters (page.tsx `handleOpenAddExpense` / Careem prefill).
struct AddExpenseRequest: Hashable {
    var type: TransactionType = .expense
    var groupId: String? = nil
    var prefill: AddExpensePrefill? = nil
}

/// RecordSettlementModal defaults (page.tsx `settlementParams`).
struct SettlementRequest: Hashable {
    var senderId: String? = nil
    var recipientId: String? = nil
    var amountMinor: Int? = nil
    var groupId: String? = nil
}

/// CareemPayModal props (page.tsx `careemPayParams`).
struct CareemPayRequest: Hashable {
    var senderId: String? = nil
    var recipientId: String? = nil
    var amountMinor: Int = 0
    var groupId: String? = nil
    var reference: String = "Group settlement"
}

/// One case per web modal (page.tsx:206-265) plus the modals the web keeps local to a component.
enum PaydSheet: Identifiable, Hashable {
    case addExpense(AddExpenseRequest)               // AddExpenseModal
    case newSplit(defaultGroupId: String?)           // NewSplitModal
    case recordSettlement(SettlementRequest)         // RecordSettlementModal
    case careemPay(CareemPayRequest)                 // CareemPayModal
    case createGroup                                 // CreateGroupModal
    case transactionDetail(transactionId: String)    // TransactionDetailDrawer
    case receiptScanner                              // ReceiptScannerModal
    case roulette(defaultGroupId: String?)           // FairPayerRouletteModal
    case createRecurringBill(defaultGroupId: String?) // CreateRecurringBillModal
    case joinInvite(token: String)                   // web route /join/[token]

    /// Stable for a given case and parameters.
    var id: String { String(describing: self) }
}
