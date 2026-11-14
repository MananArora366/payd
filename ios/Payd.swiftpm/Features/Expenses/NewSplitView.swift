import OSLog
import PaydCore
import SwiftUI

/// Port of web/src/components/modals/NewSplitModal.tsx: a quick split with equal / exact / percentage /
/// shares methods, a live per-person preview, the remaining-to-assign line and a "you'll be owed" summary.
/// Validation and the transaction input come from `NewSplitLogic`.
struct NewSplitView: View {
    let defaultGroupId: String?

    @Environment(LedgerStore.self) private var store

    init(defaultGroupId: String?) {
        self.defaultGroupId = defaultGroupId
    }

    var body: some View {
        NewSplitForm(defaultGroupId: defaultGroupId, state: store.state)
    }
}

/// `METHODS` (NewSplitModal.tsx:23-28).
private let splitMethods: [(value: SplitMethod, label: String, accessibilityLabel: String?)] = [
    (.equal, "Equal", "Equal"), (.exact, "Exact", "Exact"), (.percentage, "%", "Percentage"), (.shares, "Shares", "Shares"),
]

private struct NewSplitForm: View {
    let defaultGroupId: String?

    @Environment(LedgerStore.self) private var store
    @Environment(AppRouter.self) private var router

    @State private var title = ""
    @State private var amountInput = ""
    @State private var categoryId = ""
    @State private var groupId: String?
    @State private var participantIds: [String]
    @State private var payerId: String
    @State private var method: SplitMethod = .equal
    /// Kept per method so switching back and forth doesn't mix amounts with percents.
    @State private var valuesByMethod: [SplitMethod: [String: String]] = [:]
    @State private var error: String?
    @State private var saving = false
    @FocusState private var titleFocused: Bool

    private static let logger = Logger(subsystem: "com.payd.SwiftExpenseTracker", category: "expenses")
    private static let topAnchor = "new-split-top"

    init(defaultGroupId: String?, state: LedgerState) {
        self.defaultGroupId = defaultGroupId
        let people = NewSplitPeople(state: state)
        let initialGroupId = defaultGroupId.flatMap { id in state.groups.contains { $0.id == id } ? id : nil }
        let initialParticipants = people.defaultParticipants(for: initialGroupId)
        _groupId = State(initialValue: initialGroupId)
        _participantIds = State(initialValue: initialParticipants)
        _payerId = State(initialValue: people.defaultPayer(for: initialParticipants))
    }

    // MARK: - Derived values (NewSplitModal.tsx:103-125, 154-174)

    private var people: NewSplitPeople { NewSplitPeople(state: store.state) }
    private var currentUserId: String { store.state.currentUserId }

    private var values: [String: String] {
        let raw = valuesByMethod[method] ?? [:]
        if method == .shares {
            return Dictionary(participantIds.map { ($0, raw[$0] ?? "1") }, uniquingKeysWith: { first, _ in first })
        }
        return Dictionary(participantIds.compactMap { uid in raw[uid].map { (uid, $0) } },
                          uniquingKeysWith: { first, _ in first })
    }

    private var draft: NewSplitDraft {
        NewSplitDraft(title: title, amountInput: amountInput, payerId: payerId, groupId: groupId,
                      participantIds: participantIds, method: method, values: values,
                      categoryId: categoryId.isEmpty ? nil : categoryId)
    }

    private enum Tone { case good, warn, muted }

    private func summary(_ preview: Shares) -> (text: String, tone: Tone)? {
        guard !preview.isEmpty else { return nil }
        let myShare = preview[currentUserId] ?? 0
        if payerId == currentUserId {
            let owed = preview.reduce(0) { $1.key == currentUserId ? $0 : $0 + $1.value }
            return owed > 0
                ? ("You'll be owed \(Currency.format(owed, currency: Currency.ledgerCode))", .good)
                : ("Only your own share, so nobody owes anything.", .muted)
        }
        if myShare > 0 {
            return ("You owe \(people.plainName(payerId)) \(Currency.format(myShare, currency: Currency.ledgerCode))", .warn)
        }
        return ("You're not part of this split.", .muted)
    }

    private var canSave: Bool {
        !title.expensesTrimmed.isEmpty && !amountInput.expensesTrimmed.isEmpty && !saving
    }

    // MARK: - Body

    var body: some View {
        let preview = NewSplitLogic.preview(draft)
        let remaining = method == .exact || method == .percentage ? NewSplitLogic.remaining(draft) : nil
        ScrollViewReader { proxy in
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    SheetHeader(title: "New split") { router.dismissSheet() }
                        .id(Self.topAnchor)
                    if let error {
                        ErrorBanner(error)
                    }
                    titleField
                    amountAndCategory
                    groupAndPayer
                    participantsSection(preview: preview, remaining: remaining)
                    if let summary = summary(preview) {
                        summaryBox(summary)
                    }
                    AccuracyNote()
                    submitRow(proxy: proxy)
                        .padding(.top, 8)
                }
                .padding(24)
            }
            .scrollDismissesKeyboard(.interactively)
        }
        .task {
            // Focus the title once the sheet has finished presenting (web requestAnimationFrame).
            try? await Task.sleep(for: .milliseconds(350))
            if !Task.isCancelled { titleFocused = true }
        }
    }

    private var titleField: some View {
        VStack(alignment: .leading, spacing: 4) {
            FieldLabel("What was it for?")
            FocusableTextField(placeholder: "e.g. Dinner at Zuma, Taxi to the airport",
                               text: Binding(get: { title }, set: { title = $0; error = nil }),
                               isFocused: $titleFocused)
                .accessibilityLabel("What was it for?")
        }
    }

    private var amountAndCategory: some View {
        HStack(alignment: .top, spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                FieldLabel("Amount")
                PaydAmountField(text: Binding(get: { amountInput }, set: { amountInput = $0; error = nil }),
                                prefix: Currency.ledgerCode)
                    .accessibilityLabel("Amount in \(Currency.ledgerCode)")
            }
            VStack(alignment: .leading, spacing: 4) {
                FieldLabel("Category (optional)")
                PaydMenuPicker(selection: $categoryId,
                               options: [("", "No category")] + store.state.categories.map { ($0.id, $0.name) })
                    .accessibilityLabel("Category (optional)")
            }
        }
    }

    private var groupAndPayer: some View {
        let visible = store.snapshot.visibleGroups
        let groupOptions: [(value: String?, label: String)] = [(nil, "No group / friends")]
            + store.state.groups
                .filter { g in visible.contains { $0.id == g.id } || g.id == defaultGroupId }
                .map { (Optional($0.id), $0.name) }
        return HStack(alignment: .top, spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                FieldLabel("Split with")
                PaydMenuPicker(selection: Binding(get: { groupId }, set: { handleGroupChange($0) }),
                               options: groupOptions)
                    .accessibilityLabel("Split with")
            }
            VStack(alignment: .leading, spacing: 4) {
                FieldLabel("Paid by")
                PaydMenuPicker(selection: Binding(get: { payerId }, set: { payerId = $0; error = nil }),
                               options: participantIds.map { uid in
                                   (uid, uid == currentUserId ? "\(people.plainName(uid)) (You)" : people.plainName(uid))
                               })
                    .accessibilityLabel("Paid by")
            }
        }
    }

    // MARK: - Participants, method and per-person rows (NewSplitModal.tsx:351-484)

    private func participantsSection(preview: Shares, remaining: Remaining?) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 6) {
                Image(systemName: "person.2")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(PaydTheme.brand400)
                    .accessibilityHidden(true)
                Text("PEOPLE IN THIS SPLIT (\(participantIds.count))")
                    .paydHeadingFont(size: 11)
                    .foregroundStyle(PaydTheme.zinc400)
            }

            FlowLayout(spacing: 6, lineSpacing: 6) {
                ForEach(people.people(for: groupId)) { user in
                    let isSelected = participantIds.contains(user.id)
                    let isLast = isSelected && participantIds.count == 1
                    ParticipantChip(title: user.id == currentUserId ? "\(user.name) (You)" : user.name,
                                    initials: PaydFormat.initialsFirstLast(user.name), discSize: 20,
                                    isSelected: isSelected,
                                    accessibilityHint: isLast ? "At least one person must be in the split" : nil) {
                        toggleParticipant(user.id)
                    }
                }
            }

            if let groupId {
                Text("Only members of \(store.state.groups.first { $0.id == groupId }?.name ?? "this group") can be part of this split.")
                    .font(.payd(size: 10))
                    .foregroundStyle(PaydTheme.zinc500)
                    .fixedSize(horizontal: false, vertical: true)
            }

            VStack(alignment: .leading, spacing: 4) {
                FieldLabel("Split method")
                SwitchPills(selection: Binding(get: { method }, set: { method = $0; error = nil }),
                            options: splitMethods, fontSize: 12, headingFont: true, trackPadding: 4,
                            trackRadius: 12, pillRadius: 8, pillHeight: 30, pillHorizontalPadding: 4, spacing: 4)
            }

            perPersonRows(preview: preview, remaining: remaining)
        }
        .padding(.top, 8)
        .overlay(alignment: .top) { Rectangle().fill(PaydTheme.border).frame(height: 1) }
    }

    private func perPersonRows(preview: Shares, remaining: Remaining?) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            ForEach(participantIds, id: \.self) { uid in
                personRow(uid, share: preview[uid])
            }
            if let remaining {
                Text(NewSplitLogic.formatRemaining(remaining))
                    .font(.payd(size: 11, bold: true))
                    .foregroundStyle(remainingTone(remaining))
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.top, 6)
                    .overlay(alignment: .top) { Rectangle().fill(Color.white.opacity(0.06)).frame(height: 1) }
                    .padding(.top, 4)
            }
        }
        .font(.payd(size: 12))
        .padding(12)
        .background(PaydTheme.surface202025, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
    }

    private func personRow(_ uid: String, share: Int?) -> some View {
        let name = people.plainName(uid)
        return HStack(spacing: 12) {
            HStack(spacing: 8) {
                Text(PaydFormat.initialsFirstLast(name))
                    .font(.payd(size: 9, bold: true))
                    .foregroundStyle(PaydTheme.brand200)
                    .frame(width: 20, height: 20)
                    .background(PaydTheme.brand400.opacity(0.2), in: Circle())
                    .accessibilityHidden(true)
                Text(uid == currentUserId ? "\(name) (You)" : name)
                    .foregroundStyle(PaydTheme.zinc300)
                    .lineLimit(1)
                    .truncationMode(.tail)
            }
            Spacer(minLength: 0)
            HStack(spacing: 8) {
                if method != .equal {
                    CompactNumberField(placeholder: method == .exact ? "0.00" : method == .percentage ? "0" : "1",
                                       text: Binding(get: { values[uid] ?? "" }, set: { setValue(uid, $0) }),
                                       unit: method == .exact ? Currency.ledgerCode : method == .percentage ? "%" : "x",
                                       allowComma: method == .exact,
                                       accessibilityLabel: method == .exact ? "Amount for \(name) in \(Currency.ledgerCode)"
                                           : method == .percentage ? "Percent for \(name)" : "Shares for \(name)")
                        .frame(width: 96)
                        .id("\(method.rawValue)-\(uid)")
                }
                Text(share.map { Currency.format($0, currency: Currency.ledgerCode) } ?? "-")
                    .font(.payd(size: 12, bold: true))
                    .monospacedDigit()
                    .foregroundStyle(.white)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
                    .frame(width: 96, alignment: .trailing)
            }
        }
    }

    private func remainingTone(_ remaining: Remaining) -> Color {
        let value: Int
        switch remaining {
        case let .amount(minor): value = minor
        case let .percent(scaled): value = scaled
        }
        if value == 0 { return ExpensesPalette.income }
        return value > 0 ? PaydTheme.amber300 : PaydTheme.rose400
    }

    private func summaryBox(_ summary: (text: String, tone: Tone)) -> some View {
        let (fill, stroke, text): (Color, Color, Color) = switch summary.tone {
        case .good: (PaydTheme.brand500.opacity(0.1), PaydTheme.brand500.opacity(0.3), PaydTheme.brand300)
        case .warn: (PaydTheme.amber500.opacity(0.1), PaydTheme.amber500.opacity(0.3), PaydTheme.amber300)
        case .muted: (PaydTheme.surface202025, Color.white.opacity(0.06), PaydTheme.zinc400)
        }
        return Text(summary.text)
            .font(.payd(size: 14, bold: true))
            .foregroundStyle(text)
            .frame(maxWidth: .infinity, alignment: .leading)
            .fixedSize(horizontal: false, vertical: true)
            .padding(12)
            .background(fill, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(stroke))
    }

    private func submitRow(proxy: ScrollViewProxy) -> some View {
        HStack(spacing: 12) {
            Button("Cancel") { router.dismissSheet() }
                .buttonStyle(PaydSecondaryButtonStyle(height: 46))
            Button("Create split") {
                handleSubmit()
                if error != nil {
                    withAnimation { proxy.scrollTo(Self.topAnchor, anchor: .top) }
                }
            }
            .buttonStyle(PaydPrimaryButtonStyle(height: 46))
            .disabled(!canSave)
        }
    }

    // MARK: - Actions (NewSplitModal.tsx:127-194)

    private func applyParticipants(_ next: [String]) {
        participantIds = next
        error = nil
        if !next.contains(payerId) { payerId = people.defaultPayer(for: next) }
    }

    private func handleGroupChange(_ gid: String?) {
        groupId = gid
        applyParticipants(people.defaultParticipants(for: gid))
    }

    private func toggleParticipant(_ uid: String) {
        if participantIds.contains(uid) {
            if participantIds.count == 1 { return } // keep at least one person
            applyParticipants(participantIds.filter { $0 != uid })
        } else {
            // Keep the chip order stable (same order as the people list).
            let next = Set(participantIds + [uid])
            applyParticipants(people.people(for: groupId).map(\.id).filter { next.contains($0) })
        }
    }

    private func setValue(_ uid: String, _ value: String) {
        error = nil
        let current = valuesByMethod[method] ?? [:]
        valuesByMethod = valuesByMethod.merging([method: current.merging([uid: value]) { _, new in new }]) { _, new in new }
    }

    private func handleSubmit() {
        guard canSave else { return }
        error = nil
        let result = NewSplitLogic.build(draft, nameOf: people.plainName)
        let input: NewTransaction
        switch result {
        case let .failure(failure):
            error = failure.message
            return
        case let .success(value):
            input = value
        }
        saving = true
        do {
            try store.addTransaction(input)
            router.dismissSheet()
        } catch let failure as LedgerInvariantError {
            error = AddExpenseLogic.friendlyError(failure.message)
            saving = false
        } catch let failure {
            Self.logger.error("addTransaction failed: \(String(describing: failure), privacy: .public)")
            error = AddExpenseLogic.friendlyError(failure.localizedDescription)
            saving = false
        }
    }
}

/// Who can take part (NewSplitModal.tsx:76-86, 104).
private struct NewSplitPeople {
    let state: LedgerState

    private var currentUser: User { LedgerQueries.currentUser(in: state) }

    /// The group's members, or all known people (current user first) without a group.
    func people(for groupId: String?) -> [User] {
        guard let groupId else {
            return [currentUser] + state.users.filter { $0.id != state.currentUserId }
        }
        let members = LedgerQueries.groupMembers(groupId, in: state)
        return members.isEmpty ? [currentUser] : members
    }

    func defaultParticipants(for groupId: String?) -> [String] {
        groupId != nil ? people(for: groupId).map(\.id) : [state.currentUserId]
    }

    func defaultPayer(for ids: [String]) -> String {
        ids.contains(state.currentUserId) ? state.currentUserId : ids.first ?? state.currentUserId
    }

    func plainName(_ uid: String) -> String {
        if let name = state.users.first(where: { $0.id == uid })?.name, !name.isEmpty { return name }
        return uid == state.currentUserId ? currentUser.name : "Someone"
    }
}
