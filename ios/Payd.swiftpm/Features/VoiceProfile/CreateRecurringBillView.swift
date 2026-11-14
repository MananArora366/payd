import OSLog
import PaydCore
import SwiftUI

/// Port of web/src/components/modals/CreateRecurringBillModal.tsx (presented as a sheet).
struct CreateRecurringBillView: View {
    let defaultGroupId: String?

    @Environment(LedgerStore.self) private var store
    @Environment(AppRouter.self) private var router

    @State private var didLoad = false
    @State private var title = ""
    @State private var amountStr = ""
    @State private var frequency: RecurringFrequency = .monthly
    @State private var dueDay = 1
    @State private var categoryId = ""
    @State private var payerId = ""
    /// "" = Personal (no group), like the web `<select value={groupId || ''}>`.
    @State private var groupId = ""
    @State private var selectedUserIds: [String] = []
    @State private var error: String?

    private static let logger = Logger(subsystem: "com.payd.SwiftExpenseTracker", category: "recurring")

    init(defaultGroupId: String?) {
        self.defaultGroupId = defaultGroupId
    }

    // MARK: - Derived (CreateRecurringBillModal.tsx:27-85)

    private var groups: [LedgerGroup] { store.snapshot.visibleGroups }
    private var currentUser: User { store.currentUser }

    /// Group selected: only its members. Personal: everyone.
    private func eligible(for gid: String) -> [User] {
        gid.isEmpty ? store.state.users : store.groupMembers(gid)
    }

    private var eligibleUsers: [User] { eligible(for: groupId) }
    private var participantIds: [String] {
        let eligibleIds = Set(eligibleUsers.map(\.id))
        return selectedUserIds.filter { eligibleIds.contains($0) }
    }

    private var amountCheck: Result<Int, ParseError> { GroupLogic.parseAmountInput(amountStr) }
    private var totalMinor: Int { (try? amountCheck.get()) ?? 0 }

    private var defaultCategoryId: String {
        let categories = store.state.categories
        let byName = { (needles: [String]) in
            categories.first { category in needles.contains { category.name.lowercased().contains($0) } }?.id
        }
        return byName(["subscription"]) ?? byName(["utilit", "bill"]) ?? categories.first?.id ?? ""
    }

    private var initialGroupId: String {
        if let defaultGroupId, groups.contains(where: { $0.id == defaultGroupId }) { return defaultGroupId }
        return groups.first?.id ?? ""
    }

    private var periodWord: String {
        switch frequency {
        case .monthly: "month"
        case .weekly: "week"
        case .yearly: "year"
        }
    }

    private var dueDayLabel: String {
        switch frequency {
        case .weekly: "Due Day of Week"
        case .yearly: "Due Day (of month, yearly)"
        case .monthly: "Due Day of Month"
        }
    }

    // MARK: - Body

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                header

                if let error {
                    VoiceProfileNotice(text: error, tint: PaydTheme.rose500, textColor: PaydTheme.rose500)
                        .accessibilityAddTraits(.isStaticText)
                }

                VStack(alignment: .leading, spacing: 16) {
                    field("Subscription Title") {
                        VoiceProfileInput(placeholder: "e.g. Du 5G Wi-Fi, DEWA Bill, Netflix 4K", text: $title,
                                          focusColor: PaydTheme.brand500, accessibilityLabel: "Subscription Title")
                    }

                    HStack(alignment: .top, spacing: 12) {
                        field("Amount (AED)") {
                            VoiceProfileInput(placeholder: "0.00", text: $amountStr, kind: .decimal,
                                              focusColor: PaydTheme.brand500, bold: true, accessibilityLabel: "Amount (AED)")
                        }
                        field("Frequency") {
                            VoiceProfileSelect(selection: Binding(get: { frequency }, set: { next in
                                frequency = next
                                dueDay = RecurringPeriod.clampDueDay(dueDay, next)
                            }), options: [(.monthly, "Monthly"), (.weekly, "Weekly"), (.yearly, "Yearly")],
                            accessibilityLabel: "Frequency")
                        }
                    }

                    HStack(alignment: .top, spacing: 12) {
                        field(dueDayLabel) { dueDayControl }
                        field("Who Pays Front-Line?") {
                            VoiceProfileSelect(selection: $payerId, options: eligibleUsers.map { user in
                                (value: user.id, label: "\(user.name) \(user.id == currentUser.id ? "(You)" : "")")
                            }, accessibilityLabel: "Who Pays Front-Line?")
                        }
                    }

                    HStack(alignment: .top, spacing: 12) {
                        field("Assign to Group") {
                            VoiceProfileSelect(selection: Binding(get: { groupId }, set: applyGroup),
                                               options: [(value: "", label: "Personal (No group)")]
                                                   + groups.map { (value: $0.id, label: $0.name) },
                                               accessibilityLabel: "Assign to Group")
                        }
                        field("Category") {
                            VoiceProfileSelect(selection: $categoryId,
                                               options: store.state.categories.map { (value: $0.id, label: $0.name) },
                                               accessibilityLabel: "Category")
                        }
                    }

                    participantsSection

                    HStack(spacing: 6) {
                        Image(systemName: "checkmark.shield")
                            .font(.system(size: 13, weight: .semibold))
                            .accessibilityHidden(true)
                        Text("Posting this will log an immutable transaction into the ledger automatically")
                            .font(.payd(size: 11))
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .foregroundStyle(PaydTheme.emerald400)

                    HStack(spacing: 12) {
                        Button("Cancel") { router.dismissSheet() }
                            .buttonStyle(VoiceProfileButtonStyle(text: PaydTheme.slate300, stroke: PaydTheme.slate200,
                                                                 bold: false))
                        Button("Create Subscription", action: submit)
                            .buttonStyle(VoiceProfileButtonStyle(fill: PaydTheme.brand400, text: PaydTheme.zinc950))
                    }
                    .padding(.top, 8)
                }
            }
            .padding(24)
        }
        .scrollDismissesKeyboard(.interactively)
        .foregroundStyle(.white)
        .onAppear(perform: load)
    }

    private var header: some View {
        VStack(spacing: 0) {
            HStack(spacing: 8) {
                IconTile(systemName: "repeat", tint: PaydTheme.brand400, size: 36, iconSize: 18, cornerRadius: 12)
                VStack(alignment: .leading, spacing: 2) {
                    Text("New shared subscription")
                        .paydHeadingFont(size: 14)
                        .foregroundStyle(.white)
                        .accessibilityAddTraits(.isHeader)
                    Text("Automate recurring Wi-Fi, rent, DEWA, or Netflix")
                        .font(.payd(size: 12))
                        .foregroundStyle(PaydTheme.zinc400)
                }
                Spacer()
                Button {
                    router.dismissSheet()
                } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundStyle(PaydTheme.slate400)
                        .padding(4)
                        .contentShape(Circle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Close")
            }
            .padding(.bottom, 12)
            Rectangle().fill(PaydTheme.border).frame(height: 1)
        }
    }

    @ViewBuilder private var dueDayControl: some View {
        if frequency == .weekly {
            VoiceProfileSelect(selection: Binding(get: { RecurringPeriod.clampDueDay(dueDay, .weekly) },
                                                  set: { dueDay = $0 }),
                               options: RecurringPeriod.weekdayNames.enumerated().map { (value: $0.offset + 1, label: $0.element) },
                               accessibilityLabel: dueDayLabel)
        } else {
            VoiceProfileInput(placeholder: "", text: Binding(get: { String(dueDay) }, set: { typed in
                dueDay = RecurringPeriod.clampDueDay(Self.parseIntOrOne(typed), frequency)
            }), kind: .integer, focusColor: PaydTheme.brand500, accessibilityLabel: dueDayLabel)
        }
    }

    private var participantsSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                Image(systemName: "person.2")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(PaydTheme.brand500)
                    .accessibilityHidden(true)
                Text("Split Subscriptions Between (\(participantIds.count))")
                    .font(.payd(size: 12))
                    .foregroundStyle(PaydTheme.zinc400)
            }

            VoiceProfileFlowLayout(spacing: 6) {
                ForEach(eligibleUsers) { user in
                    let isSelected = participantIds.contains(user.id)
                    Button {
                        toggleUserSelection(user.id)
                    } label: {
                        HStack(spacing: 6) {
                            AvatarView(user: user, size: 16)
                            Text(user.name)
                                .font(.payd(size: 12))
                                .lineLimit(1)
                        }
                        .foregroundStyle(isSelected ? .white : PaydTheme.slate400)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 6)
                        .background(isSelected ? PaydTheme.brand600 : PaydTheme.slate800, in: Capsule())
                    }
                    .buttonStyle(PressScaleButtonStyle())
                    .accessibilityAddTraits(isSelected ? .isSelected : [])
                }
            }

            if totalMinor > 0 && !participantIds.isEmpty {
                let count = participantIds.count
                VStack(alignment: .leading, spacing: 4) {
                    Text("Equal Share per member:")
                        .font(.payd(size: 12))
                        .foregroundStyle(PaydTheme.slate400)
                    Text("\(totalMinor % count != 0 ? "≈ " : "")\(Currency.format(PaydMath.roundedDiv(totalMinor, count), currency: "AED")) / \(periodWord)")
                        .font(.payd(size: 14, bold: true))
                        .foregroundStyle(.white)
                        .monospacedDigit()
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(12)
                .background(PaydTheme.slate850, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            }
        }
        .padding(.top, 8)
        .overlay(alignment: .top) { Rectangle().fill(PaydTheme.slate800).frame(height: 1) }
    }

    private func field<Content: View>(_ label: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label)
                .font(.payd(size: 12))
                .foregroundStyle(PaydTheme.zinc400)
            content()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: - Actions

    /// Reset on open (CreateRecurringBillModal.tsx:60-73).
    private func load() {
        guard !didLoad else { return }
        didLoad = true
        categoryId = defaultCategoryId
        payerId = currentUser.id
        applyGroup(initialGroupId)
    }

    private func applyGroup(_ gid: String) {
        groupId = gid
        let members = eligible(for: gid)
        selectedUserIds = members.map(\.id)
        if !members.contains(where: { $0.id == payerId }) {
            payerId = members.contains(where: { $0.id == currentUser.id }) ? currentUser.id : (members.first?.id ?? currentUser.id)
        }
    }

    private func toggleUserSelection(_ userId: String) {
        if selectedUserIds.contains(userId) {
            if participantIds.count == 1 { return }
            selectedUserIds = selectedUserIds.filter { $0 != userId }
        } else {
            selectedUserIds = selectedUserIds + [userId]
        }
    }

    private func submit() {
        error = nil
        if title.voiceProfileTrimmed.isEmpty {
            error = "Please enter a subscription or bill title."
            return
        }
        let total: Int
        switch amountCheck {
        case let .failure(parseError):
            error = parseError.message
            return
        case let .success(value):
            total = value
        }
        let participants = participantIds
        if participants.isEmpty {
            error = "Pick at least one person to split with."
            return
        }
        if !eligibleUsers.contains(where: { $0.id == payerId }) {
            error = "The payer must be a member of the selected group."
            return
        }
        do {
            let shares = try Splits.equal(total, among: participants)
            store.addRecurringBill(NewRecurringBill(
                title: title.voiceProfileTrimmed, amountMinor: total, currency: "AED",
                categoryId: categoryId.isEmpty ? nil : categoryId, payerId: payerId,
                groupId: groupId.isEmpty ? nil : groupId, frequency: frequency,
                dueDay: RecurringPeriod.clampDueDay(dueDay, frequency), notes: nil, autoPost: false,
                lastPostedAt: nil, splits: shares.map { ShareAllocation(userId: $0.key, shareMinor: $0.value) }))
            router.dismissSheet()
        } catch {
            Self.logger.error("Recurring bill rejected: \(error.message, privacy: .public)")
            self.error = "We couldn't save this recurring bill. Please check the details and try again."
        }
    }

    /// `parseInt(value, 10) || 1`: leading digits, 1 when there are none or they are 0.
    private static func parseIntOrOne(_ text: String) -> Int {
        let trimmed = text.voiceProfileTrimmed
        let digits = trimmed.prefix { $0.isASCII && $0.isNumber }
        guard !digits.isEmpty else { return 1 }
        guard let value = Int(digits) else { return Int.max } // too large: clamps to the maximum day
        return value == 0 ? 1 : value
    }
}
