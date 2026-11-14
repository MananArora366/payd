import Foundation
import PaydCore
import UIKit

/// The photo staged for scanning (web `imagePreview` data URL + `imageMime`).
struct LensImage {
    let data: Data
    let mimeType: String
    let preview: UIImage

    var dataURL: String { "data:\(mimeType);base64,\(data.base64EncodedString())" }
}

enum LensSplitMode: Hashable {
    case equal, itemized
}

/// Every piece of ReceiptScannerModal.tsx state (lines 68-91), as an immutable value. Each handler of the
/// web component is a pure function returning the next session.
struct LensSession {
    private(set) var isScanning = false
    private(set) var image: LensImage?
    private(set) var scanFailed = false
    private(set) var isSaved = false
    private(set) var isSaving = false
    private(set) var isReadyToScan = false
    private(set) var receipt: ReceiptScanResult?
    private(set) var error: String?
    private(set) var isEditingReceipt = false
    private(set) var payerId: String
    private(set) var selectedGroup: String?
    private(set) var selectedUserIds: [String]
    private(set) var splitMode: LensSplitMode = .itemized
    private(set) var itemAssignments: [Int: [String]] = [:]
    private(set) var copiedBreakdown = false

    static let maxUploadBytes = 8 * 1024 * 1024

    /// Fresh state on open (ReceiptScannerModal.tsx:122-140).
    static func fresh(state: LedgerState) -> LensSession {
        LensSession(payerId: state.currentUserId, selectedGroup: nil, selectedUserIds: [])
            .applyingGroup(defaultGroupId(state: state), state: state)
    }

    /// First group containing the current user, else the first group, else personal (102-105).
    static func defaultGroupId(state: LedgerState) -> String? {
        state.groups.first { group in
            LedgerQueries.groupMembers(group.id, in: state).contains { $0.id == state.currentUserId }
        }?.id ?? state.groups.first?.id
    }

    /// A group offers only its members; "Personal" offers everyone (96-100).
    static func participantPool(groupId: String?, state: LedgerState) -> [User] {
        groupId.map { LedgerQueries.groupMembers($0, in: state) } ?? state.users
    }

    // MARK: - Group & people (107-120, 293-322)

    func applyingGroup(_ groupId: String?, state: LedgerState) -> LensSession {
        let ids = Self.participantPool(groupId: groupId, state: state).map(\.id)
        var next = self
        next.selectedGroup = groupId
        next.selectedUserIds = ids
        next.payerId = ids.contains(state.currentUserId) ? state.currentUserId : ids.first ?? state.currentUserId
        next.itemAssignments = itemAssignments.mapValues { _ in ids }
        return next
    }

    func withPayer(_ id: String) -> LensSession {
        var next = self
        next.payerId = id
        return next
    }

    func togglingUser(_ userId: String) -> LensSession {
        var next = self
        if selectedUserIds.contains(userId) {
            if selectedUserIds.count == 1 { return self }
            next.selectedUserIds = selectedUserIds.filter { $0 != userId }
            next.itemAssignments = itemAssignments.mapValues { $0.filter { $0 != userId } }
        } else {
            next.selectedUserIds = selectedUserIds + [userId]
        }
        return next
    }

    func togglingItemUser(_ index: Int, _ userId: String) -> LensSession {
        let current = itemAssignments[index] ?? []
        var next = self
        if current.contains(userId) {
            if current.count == 1 { return self }
            next.itemAssignments[index] = current.filter { $0 != userId }
        } else {
            next.itemAssignments[index] = current + [userId]
        }
        return next
    }

    func withSplitMode(_ mode: LensSplitMode) -> LensSession {
        var next = self
        next.splitMode = mode
        return next
    }

    func togglingEditing() -> LensSession {
        var next = self
        next.isEditingReceipt.toggle()
        return next
    }

    /// "Split All Equally" (869-876).
    func assigningAllToEveryone() -> LensSession {
        guard let receipt else { return self }
        var next = self
        next.itemAssignments = Dictionary(uniqueKeysWithValues: receipt.lineItems.indices.map { ($0, selectedUserIds) })
        return next
    }

    /// "All to Payer" (882-889).
    func assigningAllToPayer() -> LensSession {
        guard let receipt else { return self }
        var next = self
        next.itemAssignments = Dictionary(uniqueKeysWithValues: receipt.lineItems.indices.map { ($0, [payerId]) })
        return next
    }

    func withCopied(_ copied: Bool) -> LensSession {
        var next = self
        next.copiedBreakdown = copied
        return next
    }

    // MARK: - Photo stages (154-291, 516-520, 606-609, 1052-1059)

    func showingError(_ message: String, scanFailed failed: Bool = false) -> LensSession {
        var next = self
        next.error = message
        next.scanFailed = failed
        return next
    }

    func clearingError() -> LensSession {
        var next = self
        next.error = nil
        next.scanFailed = false
        return next
    }

    /// A captured or uploaded photo is ready for the orientation check.
    func staging(_ image: LensImage) -> LensSession {
        var next = clearingError()
        next.image = image
        next.isReadyToScan = true
        next.receipt = nil
        next.isSaved = false
        return next
    }

    /// Rotate ±90° keeps the stage, replaces the photo (re-encoded JPEG).
    func replacingImage(_ image: LensImage) -> LensSession {
        var next = self
        next.image = image
        return next
    }

    /// "Retake".
    func retaking() -> LensSession {
        var next = self
        next.image = nil
        next.isReadyToScan = false
        return next
    }

    /// "Try another photo".
    func tryingAnotherPhoto() -> LensSession {
        var next = clearingError()
        next.image = nil
        next.isReadyToScan = false
        return next
    }

    func startingScan() -> LensSession {
        var next = clearingError()
        next.isScanning = true
        next.isReadyToScan = false
        return next
    }

    func finishingScan(_ receipt: ReceiptScanResult) -> LensSession {
        var next = self
        next.isScanning = false
        next.isSaved = false
        next.receipt = receipt.with(currency: "AED")
        next.itemAssignments = Dictionary(uniqueKeysWithValues: receipt.lineItems.indices.map { ($0, selectedUserIds) })
        return next
    }

    func failingScan(_ message: String) -> LensSession {
        var next = showingError(message, scanFailed: true)
        next.isScanning = false
        next.isReadyToScan = true
        return next
    }

    /// "No photo? Enter the bill manually" / "Enter manually" (154-162).
    func startingManualEntry(now: Date) -> LensSession {
        var next = clearingError()
        next.isReadyToScan = false
        next.isSaved = false
        next.receipt = Self.blankManualReceipt(now: now)
        next.itemAssignments = [:]
        next.isEditingReceipt = true
        return next
    }

    /// "Scan Another".
    func scanningAnother() -> LensSession {
        var next = self
        next.receipt = nil
        next.image = nil
        next.isReadyToScan = false
        next.isSaved = false
        next.isEditingReceipt = false
        next.itemAssignments = [:]
        next.error = nil
        return next
    }

    func savingFailed(_ message: String) -> LensSession {
        var next = self
        next.isSaving = false
        next.error = message
        return next
    }

    func saved() -> LensSession {
        var next = self
        next.isSaved = true
        next.isSaving = false
        return next
    }

    // MARK: - Receipt edits (164-175, 325-368, 652-711)

    func withMerchant(_ name: String) -> LensSession {
        guard let receipt else { return self }
        var next = self
        next.receipt = receipt.with(merchantName: name)
        return next
    }

    /// Keeps the printed VAT/charges; the subtotal absorbs the change (702-711).
    func withTotal(_ minor: Int) -> LensSession {
        guard let receipt else { return self }
        let total = max(0, minor)
        let vat = min(receipt.vatMinor, total)
        var next = self
        next.receipt = receipt.with(subtotalMinor: max(0, total - vat - (receipt.chargesMinor ?? 0)),
                                    vatMinor: vat, totalMinor: total)
        return next
    }

    func withItemName(_ index: Int, _ name: String) -> LensSession {
        guard let receipt, receipt.lineItems.indices.contains(index) else { return self }
        var items = receipt.lineItems
        let old = items[index]
        items[index] = ReceiptItem(name: name, quantity: old.quantity, priceMinor: old.priceMinor)
        var next = self
        next.receipt = receipt.with(lineItems: items)
        return next
    }

    func withItemPrice(_ index: Int, _ minor: Int) -> LensSession {
        guard let receipt, receipt.lineItems.indices.contains(index) else { return self }
        var items = receipt.lineItems
        let old = items[index]
        items[index] = ReceiptItem(name: old.name, quantity: old.quantity, priceMinor: max(0, minor))
        var next = self
        next.receipt = Self.withItems(receipt, items)
        return next
    }

    /// Deletes an item and shifts the assignments after it down by one (340-352).
    func deletingItem(_ index: Int) -> LensSession {
        guard let receipt, receipt.lineItems.indices.contains(index) else { return self }
        let items = receipt.lineItems.enumerated().filter { $0.offset != index }.map(\.element)
        var assignments: [Int: [String]] = [:]
        for i in items.indices {
            let from = i < index ? i : i + 1
            assignments[i] = itemAssignments[from] ?? selectedUserIds
        }
        var next = self
        next.receipt = Self.withItems(receipt, items)
        next.itemAssignments = assignments
        return next
    }

    /// "Add Item": Custom Item, AED 10.00, everyone (354-368).
    func addingItem() -> LensSession {
        guard let receipt else { return self }
        let items = receipt.lineItems + [ReceiptItem(name: "Custom Item", quantity: 1, priceMinor: 1000)]
        var next = self
        next.receipt = Self.withItems(receipt, items)
        next.itemAssignments[items.count - 1] = selectedUserIds
        return next
    }

    /// total = items + VAT + charges; warnings cleared once the items are edited.
    static func withItems(_ receipt: ReceiptScanResult, _ items: [ReceiptItem]) -> ReceiptScanResult {
        let itemsSum = items.reduce(0) { $0 + $1.priceMinor }
        if itemsSum <= 0 { return receipt.with(lineItems: items) }
        return receipt.with(subtotalMinor: itemsSum, totalMinor: itemsSum + receipt.vatMinor + (receipt.chargesMinor ?? 0),
                            lineItems: items, warnings: .some([]))
    }

    static func blankManualReceipt(now: Date) -> ReceiptScanResult {
        ReceiptScanResult(merchantName: "", date: PaydFormat.isoDay(now), currency: "AED", trn: nil, subtotalMinor: 0,
                          vatMinor: 0, totalMinor: 0, category: "Food and dining", lineItems: [], chargesMinor: 0,
                          confidence: 1, warnings: [], notes: "Entered manually.", engine: "manual")
    }

    // MARK: - Derived (370-412)

    /// Equal split or Tap-to-Claim shares; empty when nothing can be split.
    var computedShares: Shares {
        guard let receipt, receipt.totalMinor > 0, !selectedUserIds.isEmpty else { return Shares() }
        do {
            if splitMode == .equal { return try Splits.equal(receipt.totalMinor, among: selectedUserIds) }
            // Only count assignments to people who are still participants.
            let assignments = itemAssignments.mapValues { $0.filter(selectedUserIds.contains) }
            return try ItemizedShares.calculate(totalMinor: receipt.totalMinor, lineItems: receipt.lineItems,
                                                assignments: assignments, participantIds: selectedUserIds)
        } catch {
            return Shares()
        }
    }

    var canSave: Bool {
        guard let receipt else { return false }
        return !isSaved && !isSaving && receipt.totalMinor > 0 && !computedShares.isEmpty
    }

    /// The WhatsApp / clipboard summary (400-412).
    func breakdownText(users: [User]) -> String {
        guard let receipt else { return "" }
        let payerName = users.first { $0.id == payerId }?.name.nonEmpty ?? "Payer"
        var text = "🧾 *\(receipt.merchantName)* (\(Currency.format(receipt.totalMinor, currency: "AED")))\n"
        if let trn = receipt.trn?.nonEmpty { text += "TRN: \(trn)\n" }
        text += "Paid by: \(payerName)\n\n*Split Breakdown:*\n"
        for (uid, share) in computedShares {
            let name = users.first { $0.id == uid }?.name.nonEmpty ?? "Member"
            text += "• \(name): \(Currency.format(share, currency: "AED"))\n"
        }
        text += "\nTracked with Payd Lens • Settle via Careem Pay! 💚"
        return text
    }

    /// The ledger input for "Save Receipt to Ledger" (425-456).
    func saveInput(categories: [PaydCore.Category]) -> NewTransaction? {
        guard let receipt, canSave else { return nil }
        let wanted = receipt.category.lowercased()
        let category = categories.first { $0.name.lowercased() == wanted } ?? categories.first
        let title = receipt.merchantName.trimmingCharacters(in: .whitespacesAndNewlines)
        return NewTransaction(
            type: .expense,
            title: title.isEmpty ? "Receipt Expense" : title,
            amountMinor: receipt.totalMinor,
            currency: "AED",
            categoryId: category?.id,
            payerId: payerId,
            groupId: selectedGroup,
            paymentMethod: "Card",
            notes: "Payd Lens OCR • TRN: \(receipt.trn?.nonEmpty ?? "N/A") • 5% VAT: \(Currency.format(receipt.vatMinor, currency: "AED"))",
            occurredAt: receipt.date.flatMap(Self.localNoon),
            splits: computedShares.map { ShareAllocation(userId: $0.key, shareMinor: $0.value) }
        )
    }

    /// `new Date("YYYY-MM-DDT12:00:00")` (local time) when the date is `^\d{4}-\d{2}-\d{2}$`.
    static func localNoon(_ isoDay: String) -> Date? {
        let parts = isoDay.split(separator: "-", omittingEmptySubsequences: false)
        guard parts.count == 3, parts[0].count == 4, parts[1].count == 2, parts[2].count == 2,
              parts.allSatisfy({ $0.allSatisfy(\.isASCIIDigitCharacter) }),
              let year = Int(parts[0]), let month = Int(parts[1]), let day = Int(parts[2]),
              (1...12).contains(month), (1...31).contains(day) else { return nil }
        let components = DateComponents(year: year, month: month, day: day, hour: 12)
        let calendar = Calendar(identifier: .gregorian)
        guard let date = calendar.date(from: components),
              calendar.component(.day, from: date) == day else { return nil }
        return date
    }

    /// friendlySaveError (38-44).
    static func friendlySaveError(_ error: Error) -> String {
        let message = (error as? LedgerInvariantError)?.message ?? error.localizedDescription
        let lowered = message.lowercased()
        if ["invariant", "split sum", "participants"].contains(where: lowered.contains) {
            return "The split doesn't add up to the receipt total. Check the items and participants, then try again."
        }
        return "Couldn't save this receipt. Please check the amounts and try again."
    }
}

private extension String {
    /// JS `value || fallback` treats "" as missing.
    var nonEmpty: String? { isEmpty ? nil : self }
}

private extension Character {
    var isASCIIDigitCharacter: Bool { isASCII && isNumber }
}

private extension ReceiptScanResult {
    /// Copy with the given fields replaced (the web's `{ ...receipt, field }` spread).
    func with(merchantName: String? = nil, currency: String? = nil, subtotalMinor: Int? = nil, vatMinor: Int? = nil,
              totalMinor: Int? = nil, lineItems: [ReceiptItem]? = nil, warnings: [String]?? = nil) -> ReceiptScanResult {
        ReceiptScanResult(merchantName: merchantName ?? self.merchantName, date: date, currency: currency ?? self.currency,
                          trn: trn, subtotalMinor: subtotalMinor ?? self.subtotalMinor, vatMinor: vatMinor ?? self.vatMinor,
                          totalMinor: totalMinor ?? self.totalMinor, category: category,
                          lineItems: lineItems ?? self.lineItems, chargesMinor: chargesMinor, confidence: confidence,
                          warnings: warnings ?? self.warnings, notes: notes, engine: engine)
    }
}
