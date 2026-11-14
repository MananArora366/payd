import Foundation
import Testing
@testable import PaydCore

/// The persisted `payd_state_v3` blob (PaydContext.tsx:163,195-254) and the model coding rules (SPEC §1).
struct LedgerStateJSONTests {
    private let now = isoDate("2026-11-14T12:00:00.000Z")

    private func fixture() throws -> Data {
        let url = try #require(Bundle.module.url(forResource: "payd_state_v3", withExtension: "json", subdirectory: "Fixtures"))
        return try Data(contentsOf: url)
    }

    @Test("a web-produced blob decodes, re-encodes to the same JSON and decodes equal")
    func roundTrip() throws {
        let data = try fixture()
        let state = try LedgerState.decodeWebBlob(data, now: now)
        #expect(state.currentUserId == SeedIDs.prakarsh)
        #expect(state.transactions[1].isDeleted)
        #expect(state.transactions[1].paymentMethod == nil)
        #expect(state.groups[1].imageUrl == "https://example.com/flat.png")
        #expect(state.groups[0].description == "")
        #expect(state.categories[1].userId == SeedIDs.manan)
        #expect(state.auditLogs[0].before == nil)
        #expect(state.auditLogs[0].after?["nested"]?[1] == .number(Decimal(string: "2.5") ?? 0))

        let encoded = try PaydJSON.encoder.encode(state)
        let again = try LedgerState.decodeWebBlob(encoded, now: now)
        #expect(again == state)
        // Same keys, nulls and omissions as the web wrote them.
        let original = try PaydJSON.decoder.decode(JSONValue.self, from: data)
        let reencoded = try PaydJSON.decoder.decode(JSONValue.self, from: encoded)
        #expect(reencoded == original)
    }

    @Test("missing keys fall back to the seed (auditLogs to []), unknown currentUserId keeps Manan")
    func fallbacks() throws {
        let partial = #"{"currentUserId":"nobody","budgets":null}"#
        let state = try LedgerState.decodeWebBlob(Data(partial.utf8), now: now)
        let seed = SeedData.make(now: now)
        #expect(state == seed)
        #expect(state.auditLogs.isEmpty)
        #expect(LedgerQueries.currentUser(in: state).id == SeedIDs.manan)
    }

    @Test("dates: toISOString on encode, lenient on decode, garbage → epoch")
    func dates() throws {
        #expect(PaydJSON.isoString(isoDate("2026-11-14T09:05:03.007Z")) == "2026-11-14T09:05:03.007Z")
        #expect(PaydJSON.parseDate("2026-11-14T09:05:03Z") == isoDate("2026-11-14T09:05:03.000Z"))
        #expect(PaydJSON.parseDate("2026-11-14T13:05:03.000+04:00") == isoDate("2026-11-14T09:05:03.000Z"))
        #expect(PaydJSON.parseDate("2026-02-31") == nil)
        #expect(PaydJSON.parseDate("not-a-date") == nil)
        let json = #"{"id":"s","group_id":null,"sender_id":"a","recipient_id":"b","amount_minor":1,"currency":"AED","method":"Cash","reference":null,"status":"settled","settled_at":"garbage","created_at":"2026-11-14T09:05:03Z"}"#
        let decoded = try PaydJSON.decoder.decode(Settlement.self, from: Data(json.utf8))
        #expect(decoded.settledAt == PaydJSON.epoch)
    }

    @Test("nil optionals: null where the web writes null, omitted where it leaves undefined")
    func nullsVersusOmitted() throws {
        let t = Transaction(id: "t", type: .expense, title: "x", amountMinor: 1, payerId: "a", occurredAt: now)
        let text = String(decoding: try PaydJSON.encoder.encode(t), as: UTF8.self)
        #expect(text.contains(#""category_id":null"#) && text.contains(#""group_id":null"#) && text.contains(#""notes":null"#))
        #expect(!text.contains("deleted_at") && !text.contains("payment_method"))
        let g = Group(id: "g", name: "G", creatorId: "a", createdAt: now)
        let groupText = String(decoding: try PaydJSON.encoder.encode(g), as: UTF8.self)
        #expect(groupText.contains(#""description":null"#) && !groupText.contains("image_url"))
        let missingRequired = #"{"id":"t","type":"expense"}"#
        #expect(throws: (any Error).self) { try PaydJSON.decoder.decode(Transaction.self, from: Data(missingRequired.utf8)) }
    }

    @Test("seed matches the web demo exactly")
    func seed() throws {
        let seed = SeedData.make(now: now)
        #expect(seed.users.map(\.name) == ["Manan Arora", "Prakarsh Thakur", "Veer Nanwani", "Aisha Rahman", "Omar Haddad", "Zara Kapoor"])
        #expect(seed.users.map(\.email) == ["manan@payd.app", "prakarsh@payd.app", "veer@payd.app", "aisha@payd.app", "omar@payd.app", "zara@payd.app"])
        #expect(seed.categories.count == 12 && seed.categories.last?.icon == "MoreHorizontal")
        #expect(seed.groupMembers.count == 8 && seed.transactions.count == 6 && seed.splits.count == 16)
        #expect(seed.splits.map(\.id) == (1...16).map { "sp\($0)" })
        #expect(seed.settlements.count == 2 && seed.recurringBills.count == 3 && seed.budgets.count == 2)
        #expect(seed.users[0].createdAt == now.addingTimeInterval(-30 * 86400))
        #expect(seed.transactions[2].occurredAt == now.addingTimeInterval(-4 * 3600))
        #expect(seed.settlements[1].settledAt == now.addingTimeInterval(-36 * 3600))
        #expect(seed.recurringBills[2].lastPostedAt == nil)
        #expect(SeedData.initialsAvatar("Manan Arora") == "data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22120%22%20height%3D%22120%22%3E%3Crect%20width%3D%22120%22%20height%3D%22120%22%20fill%3D%22%23bbf7d0%22%2F%3E%3Ctext%20x%3D%2250%25%22%20y%3D%2250%25%22%20dy%3D%22.35em%22%20text-anchor%3D%22middle%22%20font-family%3D%22DM%20Sans%2C%20sans-serif%22%20font-size%3D%2248%22%20font-weight%3D%22600%22%20fill%3D%22%2314532d%22%3EMA%3C%2Ftext%3E%3C%2Fsvg%3E")
    }
}

/// Every PaydContext action (PaydContext.tsx:294-575) as a pure function.
struct LedgerActionsWebTests {
    private let now = isoDate("2026-11-14T12:00:00.000Z")
    private var seed: LedgerState { SeedData.make(now: now) }
    private var context: ActionContext { ActionContext(now: now, randomSuffix: "ab12c") }
    private var millis: Int { PaydJSON.epochMillis(now) }

    @Test("addTransaction: ids, defaults, prepend/append and the audit entry")
    func addTransaction() throws {
        let input = NewTransaction(type: .expense, title: "Taxi", amountMinor: 3000, currency: "USD", categoryId: "",
                                   payerId: SeedIDs.manan, groupId: "", paymentMethod: "", notes: "",
                                   splits: [ShareAllocation(userId: SeedIDs.manan, shareMinor: 1000),
                                            ShareAllocation(userId: SeedIDs.veer, shareMinor: 2000)])
        let (state, txn) = try LedgerActions.addTransaction(input, to: seed, context: context)
        #expect(txn.id == "t-\(millis)-ab12c")
        #expect(txn.currency == "AED" && txn.categoryId == nil && txn.groupId == nil && txn.notes == nil)
        #expect(txn.paymentMethod == "Card" && txn.occurredAt == now && txn.createdBy == SeedIDs.manan)
        #expect(state.transactions.first == txn)
        #expect(state.splits.suffix(2).map(\.id) == ["sp-\(txn.id)-0", "sp-\(txn.id)-1"])
        let audit = try #require(state.auditLogs.first)
        #expect(audit.id == "al-\(millis)" && audit.action == .insert && audit.recordType == .transaction)
        #expect(audit.after?["transaction"]?["id"]?.stringValue == txn.id)
        #expect(audit.after?["splits"]?[1]?["share_minor"]?.intValue == 2000)
        #expect(audit.before == nil)
    }

    @Test("addTransaction: only the split-sum check, with the web message")
    func addTransactionSum() {
        let input = NewTransaction(type: .expense, title: "x", amountMinor: 100, payerId: SeedIDs.manan,
                                   splits: [ShareAllocation(userId: SeedIDs.manan, shareMinor: 99)])
        #expect(throws: LedgerInvariantError("Split sum (99) does not equal transaction amount (100)")) {
            try LedgerActions.addTransaction(input, to: seed, context: context)
        }
    }

    @Test("soft delete / restore: audit entries, no-ops, restore omits deleted_at")
    func softDeleteRestore() throws {
        let id = seed.transactions[0].id
        let deleted = LedgerActions.softDeleteTransaction(id, in: seed, context: context)
        #expect(deleted.auditLogs.first?.action == .softDelete)
        #expect(deleted.auditLogs.first?.before?["deleted_at"] == nil)
        #expect(deleted.auditLogs.first?.after?["deleted_at"]?.stringValue == PaydJSON.isoString(now))
        #expect(LedgerActions.softDeleteTransaction(id, in: deleted, context: context) == deleted)
        #expect(LedgerActions.softDeleteTransaction("missing", in: seed, context: context) == seed)
        let restored = LedgerActions.restoreTransaction(id, in: deleted, context: context)
        #expect(restored.transactions.first { $0.id == id }?.isDeleted == false)
        let audit = try #require(restored.auditLogs.first)
        #expect(audit.action == .restore)
        #expect(audit.after?["deleted_at"] == nil)
        #expect(audit.before?["deleted_at"] != nil)
        #expect(LedgerActions.restoreTransaction(id, in: seed, context: context) == seed)
    }

    @Test("recordSettlement: validation reason, defaults and audit")
    func recordSettlement() throws {
        let input = NewSettlement(groupId: SeedIDs.flatmates, senderId: SeedIDs.prakarsh, recipientId: SeedIDs.manan,
                                  amountMinor: 24000, method: "", reference: "")
        let (state, s) = try LedgerActions.recordSettlement(input, in: seed, context: context)
        #expect(s.id == "s-\(millis)-ab12c" && s.method == "Cash" && s.reference == nil && s.status == .settled)
        #expect(s.settledAt == now && s.createdAt == now && s.currency == "AED")
        #expect(state.settlements.first == s)
        #expect(state.auditLogs.first?.recordType == .settlement)
        let over = NewSettlement(groupId: SeedIDs.flatmates, senderId: SeedIDs.prakarsh, recipientId: SeedIDs.manan,
                                 amountMinor: 24001, method: "Cash")
        #expect(throws: LedgerInvariantError(
            "That's more than the AED 240.00 Prakarsh Thakur owes you. Lower the amount or record the extra as an advance payment.")) {
            try LedgerActions.recordSettlement(over, in: seed, context: context)
        }
    }

    @Test("validateSettlement: group, membership and people checks")
    func validateSettlement() {
        let snapshot = LedgerQueries.snapshot(of: seed, now: now)
        func reason(_ sender: String, _ recipient: String, _ group: String?, _ amount: Int = 100) -> String? {
            LedgerQueries.validateSettlement(SettlementValidationInput(senderId: sender, recipientId: recipient, amountMinor: amount,
                                                                       groupId: group), in: seed, snapshot: snapshot).reason
        }
        #expect(reason(SeedIDs.prakarsh, SeedIDs.manan, "gone") == "That group doesn't exist any more.")
        #expect(reason(SeedIDs.aisha, SeedIDs.manan, SeedIDs.flatmates) == "Both people need to be members of Dubai Flatmates to settle in it.")
        #expect(reason("ghost", SeedIDs.manan, nil) == "Choose who is paying.")
        #expect(reason(SeedIDs.manan, "ghost", nil) == "Choose who is being paid.")
        #expect(reason(SeedIDs.manan, SeedIDs.veer, nil)
            == "You don't currently owe Veer Nanwani anything here. Record it as an advance payment if you still want to log it.")
        #expect(reason(SeedIDs.prakarsh, SeedIDs.manan, SeedIDs.flatmates) == nil)
    }

    @Test("createGroup: AED, creator admin, deduped members, prepended, no audit")
    func createGroup() {
        let (state, group) = LedgerActions.createGroup(name: "Ski", description: "", memberIds: [SeedIDs.aisha, SeedIDs.manan, SeedIDs.aisha],
                                                       currency: "USD", in: seed, context: context)
        #expect(group.id == "g-\(millis)" && group.currency == "AED" && group.description == "" && group.creatorId == SeedIDs.manan)
        #expect(state.groups.first == group)
        let members = state.groupMembers.suffix(2)
        #expect(members.map(\.userId) == [SeedIDs.manan, SeedIDs.aisha])
        #expect(members.map(\.role) == [.admin, .member])
        #expect(state.auditLogs.isEmpty)
    }

    @Test("joinGroupByToken: empty, invalid, demo tokens, URLs, already a member")
    func joinGroup() {
        let asAisha = LedgerActions.switchUser(to: SeedIDs.aisha, in: seed)
        #expect(LedgerActions.joinGroupByToken("  ", in: asAisha, context: context).1.error == "Paste an invite link or code first.")
        #expect(LedgerActions.joinGroupByToken("nope", in: asAisha, context: context).1.error == "That invite link is invalid or has expired.")
        let (joined, result) = LedgerActions.joinGroupByToken("https://payd.app/join/DUBAI-MARINA-2026?x=1", in: asAisha, context: context)
        #expect(result == JoinGroupResult(success: true, group: seed.groups[0], alreadyMember: false, message: "Joined Dubai Flatmates!"))
        #expect(joined.groupMembers.last == GroupMember(groupId: SeedIDs.flatmates, userId: SeedIDs.aisha, role: .member, joinedAt: now))
        let (_, again) = LedgerActions.joinGroupByToken("hatta-camp-2026", in: joined, context: context)
        #expect(again.alreadyMember && again.success && again.message == "You're already a member of Hatta Road Trip.")
    }

    @Test("updateBudget: replaces in place (nil category == nil) or appends a monthly budget")
    func updateBudget() {
        let replaced = LedgerActions.updateBudget(limitMinor: 700000, categoryId: nil, in: seed, context: context)
        #expect(replaced.budgets[0].limitMinor == 700000 && replaced.budgets.count == 2)
        let blank = LedgerActions.updateBudget(limitMinor: 1, categoryId: "", in: seed, context: context)
        #expect(blank.budgets[0].limitMinor == 1)
        let asVeer = LedgerActions.switchUser(to: SeedIDs.veer, in: seed)
        let appended = LedgerActions.updateBudget(limitMinor: 9, categoryId: nil, in: asVeer, context: context)
        #expect(appended.budgets.last == Budget(id: "b-\(millis)", userId: SeedIDs.veer, categoryId: nil, limitMinor: 9,
                                                period: .monthly, createdAt: now))
    }

    @Test("updateUserProfile / switchUser / reset")
    func profileAndUsers() {
        let renamed = LedgerActions.updateUserProfile(UserProfileUpdate(name: "Manan A."), in: seed)
        #expect(LedgerQueries.currentUser(in: renamed).name == "Manan A.")
        #expect(LedgerQueries.currentUser(in: renamed).defaultCurrency == "AED")
        #expect(LedgerActions.switchUser(to: "ghost", in: seed) == seed)
        #expect(LedgerActions.switchUser(to: SeedIDs.zara, in: seed).currentUserId == SeedIDs.zara)
        #expect(LedgerActions.resetToDemoData(context: context) == seed)
    }

    @Test("recurring bills: add, delete, trigger titles/notes/payment and missing bill")
    func recurring() throws {
        let bill = NewRecurringBill(title: "Gym", amountMinor: 1000, categoryId: nil, payerId: SeedIDs.manan, groupId: nil,
                                    frequency: .yearly, dueDay: 5, notes: nil,
                                    splits: [ShareAllocation(userId: SeedIDs.manan, shareMinor: 1000)])
        let (added, created) = LedgerActions.addRecurringBill(bill, to: seed, context: context)
        #expect(created.id == "rec-\(millis)" && created.createdAt == now && added.recurringBills.first == created)
        let (posted, txn) = try LedgerActions.triggerRecurringBillSplit(created.id, in: added, context: context)
        #expect(txn.title == "Gym (Annual Split)")
        #expect(txn.paymentMethod == "Auto-Debit / Card")
        #expect(txn.notes == "Recurring subscription automatically triggered on \(PaydFormat.aeDate(now))")
        #expect(posted.recurringBills.first?.lastPostedAt == now)
        #expect(LedgerActions.deleteRecurringBill(created.id, in: added) == seed)
        #expect(throws: LedgerInvariantError("Recurring bill template not found")) {
            try LedgerActions.triggerRecurringBillSplit("missing", in: seed, context: context)
        }
        let (_, weekly) = try LedgerActions.triggerRecurringBillSplit(seed.recurringBills[1].id, in: seed, context: context)
        #expect(weekly.notes == "DEWA Premise #20049182" && weekly.title.hasSuffix("(Monthly Split)"))
    }

    @Test("live context: 5 lowercase base-36 characters and whole milliseconds")
    func liveContext() {
        let live = ActionContext.live()
        #expect(live.randomSuffix.count == 5)
        #expect(live.randomSuffix.allSatisfy { $0.isNumber || ("a"..."z").contains(String($0)) })
        #expect(PaydJSON.date(epochMillis: live.epochMillis) == live.now)
    }
}

/// Derived values (PaydContext.tsx:577-777) on the seed.
struct LedgerQueriesWebTests {
    private let now = isoDate("2026-11-14T12:00:00.000Z")
    private var seed: LedgerState { SeedData.make(now: now) }

    @Test("owed to me minus I owe equals the net balance (+1,500.00)")
    func owed() {
        let s = LedgerQueries.snapshot(of: seed, now: now)
        #expect(s.userNetBalance == 150000)
        #expect(s.userOwedToMe - s.userIOwe == 150000)
        #expect(s.userSpending.totalIncomeMinor == 1_500_000)
        #expect(s.visibleGroups.map(\.id) == [SeedIDs.flatmates, SeedIDs.hattaTrip])
        #expect(LedgerQueries.pairwiseDebt(from: SeedIDs.prakarsh, to: SeedIDs.manan, groupId: SeedIDs.flatmates, snapshot: s) == 24000)
        #expect(LedgerQueries.groupSimplifiedDebts(SeedIDs.flatmates, snapshot: s)
            .contains(SimplifiedDebt(fromUserId: SeedIDs.prakarsh, toUserId: SeedIDs.manan, amountMinor: 24000)))
        let amounts = LedgerQueries.groupSimplifiedDebts(SeedIDs.flatmates, snapshot: s).map(\.amountMinor)
        #expect(amounts == amounts.sorted(by: >))
    }

    @Test("reimbursement velocities use only real history")
    func velocities() throws {
        let v = LedgerQueries.snapshot(of: seed, now: now).reimbursementVelocities
        #expect(v.map(\.userId) == [SeedIDs.prakarsh, SeedIDs.veer, SeedIDs.aisha, SeedIDs.omar, SeedIDs.zara])
        let prakarsh = try #require(v.first { $0.userId == SeedIDs.prakarsh })
        #expect(prakarsh.avgLagDays == 0.5 && prakarsh.avgLagLabel == "0.5 days" && prakarsh.tier == .speedy)
        #expect(prakarsh.totalSettlementsCount == 1)
        let veer = try #require(v.first { $0.userId == SeedIDs.veer })
        #expect(veer.avgLagDays == 0 && veer.avgLagLabel == "0 days" && veer.tier == .speedy)
        let aisha = try #require(v.first { $0.userId == SeedIDs.aisha })
        #expect(aisha.avgLagDays == 9 && aisha.avgLagLabel == "9 days" && aisha.tier == .lagging && aisha.currentOwedMinor > 0)
        let omar = try #require(v.first { $0.userId == SeedIDs.omar })
        #expect(omar.avgLagDays == 6 && omar.tier == .average)
    }

    @Test("cash-flow exposure numbers")
    func exposure() {
        let e = LedgerQueries.snapshot(of: seed, now: now).cashFlowExposure
        #expect(e.totalFrontedMinor == 225_089)
        #expect(e.personalConsumptionMinor == 58_756)
        #expect(e.totalRecoveredMinor == 8_333)
        #expect(e.outstandingExposureMinor == 158_000)
        #expect(e.topLaggingUser?.userId == SeedIDs.aisha)
    }

    @Test("visibleGroups after switchUser, unknown users and monthly budget")
    func visibleGroups() {
        let asOmar = LedgerActions.switchUser(to: SeedIDs.omar, in: seed)
        #expect(LedgerQueries.snapshot(of: asOmar, now: now).visibleGroups.map(\.id) == [SeedIDs.flatmates])
        let asZara = LedgerActions.switchUser(to: SeedIDs.zara, in: seed)
        #expect(LedgerQueries.snapshot(of: asZara, now: now).visibleGroups.map(\.id) == [SeedIDs.hattaTrip])
        #expect(LedgerQueries.monthlyBudget(for: SeedIDs.manan, in: seed)?.limitMinor == 500000)
        #expect(LedgerQueries.monthlyBudget(for: SeedIDs.zara, in: seed) == nil)
        #expect(LedgerQueries.groupMembers(SeedIDs.hattaTrip, in: seed).map(\.id) == [SeedIDs.manan, SeedIDs.prakarsh, SeedIDs.aisha, SeedIDs.zara])
        #expect(LedgerQueries.groupBalances(SeedIDs.hattaTrip, in: seed).keys.count == 4)
    }

    @Test("voice contexts built from the ledger")
    func voiceContexts() {
        let snapshot = LedgerQueries.snapshot(of: seed, now: now)
        let interpret = InterpretContext.from(state: seed)
        #expect(interpret.currentUser == .init(id: SeedIDs.manan, name: "Manan Arora", currency: "AED"))
        #expect(interpret.categories.count == 12 && interpret.knownMembers.count == 6)
        let query = QueryDataContext.from(query: "How much did I spend?", state: seed, snapshot: snapshot)
        #expect(query.type == "monthly_spend")
        #expect(query.formattedNet == "AED 1,500.00")
        #expect(query.budgetMinor == 500000 && query.formattedBudget == "AED 5,000.00")
        #expect(query.people.allSatisfy { $0.netMinor > 0 })
        #expect(query.topCategories == [.init(name: "Shopping", spentMinor: 40000), .init(name: "Travel", spentMinor: 13222),
                                         .init(name: "Groceries", spentMinor: 8000), .init(name: "Food and dining", spentMinor: 5534)])
    }
}

/// Foundations (SPEC §2.1-2.4).
struct FoundationTests {
    @Test("OrderedMap keeps first position, replaces values, removes")
    func orderedMap() {
        let map = OrderedMap([("b", 1), ("a", 2), ("b", 3)])
        #expect(map.keys == ["b", "a"] && map["b"] == 3)
        #expect(map.setting("c", 4).keys == ["b", "a", "c"])
        #expect(map.removing("b").keys == ["a"])
        #expect(map.mapValues { $0 * 10 }.values == [30, 20])
        #expect(OrderedMap([("a", 1), ("b", 2)]) != OrderedMap([("b", 2), ("a", 1)]))
    }

    @Test("stableSorted keeps ties in order; uniqued keeps first occurrence")
    func sorting() {
        let pairs = [(1, "a"), (0, "b"), (1, "c"), (0, "d")]
        #expect(pairs.stableSorted { $0.0 < $1.0 }.map(\.1) == ["b", "d", "a", "c"])
        #expect(["b", "a", "b", "c", "a"].uniqued() == ["b", "a", "c"])
    }

    @Test("PaydMath matches Math.round and JS number printing")
    func math() {
        #expect(PaydMath.roundedDiv(5, 2) == 3 && PaydMath.roundedDiv(-5, 2) == -2 && PaydMath.roundedDiv(7, 3) == 2)
        #expect(PaydMath.roundedPercent(1, of: 3) == 33 && PaydMath.roundedPercent(1, of: 2) == 50)
        #expect(PaydMath.oneDecimalPercentString(1, of: 3) == "33.3" && PaydMath.oneDecimalPercentString(1, of: 2) == "50")
        #expect(PaydMath.jsNumberString(Decimal(string: "120.50") ?? 0) == "120.5")
        #expect(PaydMath.jsNumberString(Decimal(120)) == "120")
        #expect(PaydMath.floorDiv(-7, 2) == -4)
    }

    @Test("PaydFormat dates and names")
    func format() throws {
        let utc = try #require(TimeZone(identifier: "UTC"))
        let date = isoDate("2026-11-14T09:05:00.000Z")
        #expect(PaydFormat.shortDate(date, timeZone: utc) == "Nov 14")
        #expect(PaydFormat.longDateTime(date, timeZone: utc) == "Nov 14, 2026, 09:05 AM")
        #expect(PaydFormat.monthName(date, timeZone: utc) == "November")
        #expect(PaydFormat.monthYear(date, timeZone: utc) == "November 2026")
        #expect(PaydFormat.aeDate(date, timeZone: utc) == "14/11/2026")
        #expect(PaydFormat.defaultDate(date, timeZone: utc) == "11/14/2026")
        #expect(PaydFormat.isoDay(date) == "2026-11-14")
        #expect(PaydFormat.plural(1, "member", "members") == "1 member" && PaydFormat.plural(3, "member", "members") == "3 members")
        #expect(PaydFormat.initialsNavbar("manan arora") == "ma")
        #expect(PaydFormat.initialsFirstLast("  veer  k nanwani ") == "VN" && PaydFormat.initialsFirstLast("zara") == "ZA")
        #expect(PaydFormat.initialsFirstLast("   ") == "?")
        #expect(PaydFormat.firstName("Aisha Rahman") == "Aisha" && PaydFormat.firstLetter("Omar") == "O")
        #expect(PaydFormat.categoryEmojiHome("Food and dining") == "🍣" && PaydFormat.categoryEmojiHome(nil) == "💳")
        #expect(PaydFormat.categoryEmojiHome("Taxi") == "🚗" && PaydFormat.categoryEmojiActivity("Taxi") == "💳")
        #expect(PaydFormat.titleCaseFirst("expense") == "Expense")
    }

    @Test("JSONValue lookups and literals")
    func jsonValue() throws {
        let value = try PaydJSON.decoder.decode(JSONValue.self, from: Data(#"{"a":[1,"x",true,null],"b":{"c":12}}"#.utf8))
        #expect(value["a"]?[0]?.intValue == 1 && value["a"]?[1]?.stringValue == "x" && value["a"]?[2]?.boolValue == true)
        #expect(value["a"]?[3] == .null && value["b"]?["c"] == 12 && value["missing"] == nil)
        #expect(try JSONValue(encoding: ShareAllocation(userId: "u", shareMinor: 5)) == ["user_id": "u", "share_minor": 5])
    }
}
