import OSLog
import PaydCore
import SwiftUI

/// Port of web/src/components/recurring/RecurringBillsSection.tsx (period guard: `RecurringPeriod`).
struct RecurringBillsSection: View {
    let groupId: String?

    @Environment(LedgerStore.self) private var store
    @Environment(AppRouter.self) private var router

    @State private var justPostedId: String?
    @State private var statusMessage: RecurringFlash?
    /// Bill awaiting "post again this period?" confirmation.
    @State private var confirmRepostId: String?
    /// Bill awaiting delete confirmation.
    @State private var confirmDeleteId: String?

    private static let logger = Logger(subsystem: "com.payd.SwiftExpenseTracker", category: "recurring")

    init(groupId: String?) {
        self.groupId = groupId
    }

    private var displayedBills: [RecurringBill] {
        guard let groupId, !groupId.isEmpty else { return store.state.recurringBills }
        return store.state.recurringBills.filter { $0.groupId == groupId }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            header

            if let statusMessage { flashBanner(statusMessage) }

            if displayedBills.isEmpty {
                emptyState
            } else {
                VStack(spacing: 12) {
                    ForEach(displayedBills) { bill in billCard(bill) }
                }
            }
        }
    }

    // MARK: - Header

    private var header: some View {
        HStack(spacing: 8) {
            IconTile(systemName: "repeat", tint: PaydTheme.brand400, size: 32, iconSize: 15, cornerRadius: 12)
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    Text("Shared subscriptions & recurring bills")
                        .paydHeadingFont(size: 12)
                        .foregroundStyle(.white)
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityAddTraits(.isHeader)
                    Text("\(displayedBills.count) ACTIVE")
                        .paydHeadingFont(size: 9)
                        .foregroundStyle(PaydTheme.brand300)
                        .lineLimit(1)
                        .fixedSize()
                        .padding(.horizontal, 8)
                        .padding(.vertical, 2)
                        .background(PaydTheme.brand500.opacity(0.2), in: Capsule())
                        .overlay(Capsule().strokeBorder(PaydTheme.brand500.opacity(0.3)))
                }
                Text("Automated monthly splits for Wi-Fi, rent, DEWA, and memberships")
                    .font(.payd(size: 11))
                    .foregroundStyle(PaydTheme.zinc400)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 8)
            Button {
                router.present(.createRecurringBill(defaultGroupId: groupId))
            } label: {
                HStack(spacing: 4) {
                    Image(systemName: "plus")
                        .font(.system(size: 12, weight: .heavy))
                    Text("+ Subscription")
                }
                .lineLimit(1)
                .fixedSize()
            }
            .buttonStyle(VoiceProfileButtonStyle(fill: PaydTheme.brand600, text: .white, verticalPadding: 6,
                                                 fullWidth: false))
        }
    }

    private func flashBanner(_ flash: RecurringFlash) -> some View {
        let isError = flash.kind == .error
        let tint = isError ? PaydTheme.rose500 : PaydTheme.emerald500
        return VoiceProfileNotice(text: flash.text, tint: tint, textColor: isError ? PaydTheme.rose400 : PaydTheme.emerald400,
                                  systemName: isError ? "exclamationmark.circle" : "checkmark", bold: true,
                                  cornerRadius: 16)
            .transition(.opacity)
            .accessibilityAddTraits(.isStaticText)
            .task(id: flash.id) {
                try? await Task.sleep(for: .seconds(3.5))
                guard !Task.isCancelled, statusMessage?.id == flash.id else { return }
                statusMessage = nil
            }
    }

    private var emptyState: some View {
        VStack(spacing: 4) {
            Text("No recurring subscriptions configured yet.")
                .font(.payd(size: 12))
                .foregroundStyle(PaydTheme.slate400)
            Text("Set up shared utilities, Wi-Fi, or streaming services to split with 1 click.")
                .font(.payd(size: 11))
                .foregroundStyle(PaydTheme.slate500)
        }
        .multilineTextAlignment(.center)
        .frame(maxWidth: .infinity)
        .padding(24)
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous)
            .strokeBorder(PaydTheme.slate800, style: StrokeStyle(lineWidth: 1, dash: [4, 3])))
    }

    // MARK: - Bill card

    private func billCard(_ bill: RecurringBill) -> some View {
        let now = Date()
        let payer = store.user(bill.payerId)
        let group = LedgerQueries.group(bill.groupId, in: store.state)
        let isPostedRecently = justPostedId == bill.id
        let postedThisPeriod = RecurringPeriod.isPostedInCurrentPeriod(bill, now: now)
        let periodLabel = RecurringPeriod.describePeriod(now, bill.frequency)

        return VStack(alignment: .leading, spacing: 12) {
            VStack(alignment: .leading, spacing: 0) {
                HStack(alignment: .top, spacing: 8) {
                    VStack(alignment: .leading, spacing: 2) {
                        HStack(spacing: 4) {
                            Image(systemName: "calendar")
                                .font(.system(size: 10, weight: .semibold))
                                .accessibilityHidden(true)
                            Text("\(RecurringPeriod.formatDueDay(bill.dueDay, bill.frequency)) • \(bill.frequency.rawValue)".uppercased())
                                .font(.payd(size: 10, bold: true))
                                .tracking(0.5)
                        }
                        .foregroundStyle(PaydTheme.brand400)
                        Text(bill.title)
                            .font(.payd(size: 14, bold: true))
                            .foregroundStyle(VoiceProfilePalette.slate100)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    Spacer(minLength: 8)
                    deleteControl(bill)
                }

                HStack(alignment: .firstTextBaseline, spacing: 4) {
                    Text(Currency.format(bill.amountMinor, currency: bill.currency))
                        .font(.payd(size: 18, bold: true))
                        .foregroundStyle(.white)
                        .monospacedDigit()
                    Text("/\(Self.perSuffix(bill.frequency))")
                        .font(.payd(size: 12))
                        .foregroundStyle(PaydTheme.slate400)
                }
                .padding(.top, 8)

                if let notes = bill.notes, !notes.isEmpty {
                    Text(notes)
                        .font(.payd(size: 11))
                        .foregroundStyle(PaydTheme.slate400)
                        .lineLimit(1)
                        .padding(.top, 4)
                }

                if postedThisPeriod && !isPostedRecently {
                    Text("Already posted for \(periodLabel)")
                        .font(.payd(size: 10))
                        .foregroundStyle(PaydTheme.emerald400)
                        .padding(.top, 4)
                }

                if confirmRepostId == bill.id {
                    repostConfirm(bill, periodLabel: periodLabel)
                        .padding(.top, 8)
                }
            }

            VStack(spacing: 8) {
                HStack {
                    Text("Paid by \(Self.firstName(payer?.name) ?? "Member")")
                    Spacer()
                    Text(group?.name ?? "Personal")
                        .lineLimit(1)
                }
                .font(.payd(size: 11))
                .foregroundStyle(PaydTheme.slate400)

                HStack {
                    HStack(spacing: -6) {
                        ForEach(bill.splits, id: \.userId) { split in
                            let user = store.user(split.userId)
                            AvatarView(user: user, size: 20)
                                .background(Circle().fill(PaydTheme.slate900).padding(-2))
                                .accessibilityLabel("\(user?.name ?? ""): \(Currency.format(split.shareMinor, currency: bill.currency))")
                        }
                    }
                    .padding(2)
                    .accessibilityElement(children: .combine)
                    Spacer()
                    postButton(bill, isPostedRecently: isPostedRecently)
                }
            }
            .padding(.top, 8)
            .overlay(alignment: .top) { Rectangle().fill(PaydTheme.slate800).frame(height: 1) }
        }
        .paydCard(padding: 16)
    }

    @ViewBuilder private func deleteControl(_ bill: RecurringBill) -> some View {
        if confirmDeleteId == bill.id {
            HStack(spacing: 4) {
                Text("Delete?")
                    .font(.payd(size: 10))
                    .foregroundStyle(PaydTheme.zinc400)
                smallButton("Yes", fill: PaydTheme.rose600, text: .white) { confirmDelete(bill) }
                smallButton("No", fill: PaydTheme.cardSubtle, text: PaydTheme.zinc300) { confirmDeleteId = nil }
            }
        } else {
            Button {
                confirmDeleteId = bill.id
            } label: {
                Image(systemName: "trash")
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(PaydTheme.zinc500)
                    .padding(4)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Delete \(bill.title)")
        }
    }

    private func repostConfirm(_ bill: RecurringBill, periodLabel: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("This bill was already posted for \(periodLabel). Post it again?")
                .font(.payd(size: 11))
                .foregroundStyle(PaydTheme.amber300)
                .fixedSize(horizontal: false, vertical: true)
            HStack(spacing: 8) {
                smallButton("Post again", fill: PaydTheme.amber500, text: .black, size: 11, horizontal: 10, vertical: 4) {
                    postBill(bill)
                }
                smallButton("Cancel", fill: PaydTheme.cardSubtle, text: PaydTheme.zinc300, size: 11, horizontal: 10,
                            vertical: 4) {
                    confirmRepostId = nil
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(10)
        .background(PaydTheme.amber500.opacity(0.1), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(PaydTheme.amber500.opacity(0.3)))
    }

    private func postButton(_ bill: RecurringBill, isPostedRecently: Bool) -> some View {
        Button {
            handlePostNow(bill)
        } label: {
            HStack(spacing: 6) {
                Image(systemName: isPostedRecently ? "checkmark" : "play.fill")
                    .font(.system(size: 11, weight: .bold))
                Text(isPostedRecently ? "Posted!" : "Post Split Now")
            }
            .font(.payd(size: 12, bold: true))
            .foregroundStyle(isPostedRecently ? .white : PaydTheme.slate200)
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
            .background(isPostedRecently ? PaydTheme.emerald500 : PaydTheme.slate800,
                        in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        }
        .buttonStyle(PressScaleButtonStyle())
        .disabled(isPostedRecently)
    }

    private func smallButton(_ title: String, fill: Color, text: Color, size: CGFloat = 10, horizontal: CGFloat = 8,
                             vertical: CGFloat = 2, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .font(.payd(size: size, bold: true))
                .foregroundStyle(text)
                .padding(.horizontal, horizontal)
                .padding(.vertical, vertical)
                .background(fill, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
        }
        .buttonStyle(PressScaleButtonStyle())
    }

    // MARK: - Actions (RecurringBillsSection.tsx:48-78)

    private func flash(_ kind: RecurringFlash.Kind, _ text: String) {
        withAnimation(.easeOut(duration: 0.15)) { statusMessage = RecurringFlash(kind: kind, text: text) }
    }

    private func postBill(_ bill: RecurringBill) {
        confirmRepostId = nil
        do {
            try store.triggerRecurringBillSplit(bill.id)
            justPostedId = bill.id
            flash(.success, "Split for \"\(bill.title)\" logged into ledger!")
            Task {
                try? await Task.sleep(for: .seconds(3))
                if justPostedId == bill.id { justPostedId = nil }
            }
        } catch {
            Self.logger.error("Recurring post failed: \(String(describing: error), privacy: .public)")
            flash(.error, "We couldn't post \"\(bill.title)\". Check its participants and amount, then try again.")
        }
    }

    private func handlePostNow(_ bill: RecurringBill) {
        // Guard: don't post the same bill twice in one billing period without confirmation
        if RecurringPeriod.isPostedInCurrentPeriod(bill, now: Date()) {
            confirmRepostId = bill.id
            return
        }
        postBill(bill)
    }

    private func confirmDelete(_ bill: RecurringBill) {
        confirmDeleteId = nil
        store.deleteRecurringBill(bill.id)
        flash(.success, "Deleted \"\(bill.title)\". Past posted splits stay in the ledger.")
    }

    private static func perSuffix(_ frequency: RecurringFrequency) -> String {
        switch frequency {
        case .monthly: "mo"
        case .weekly: "wk"
        case .yearly: "yr"
        }
    }

    /// `payer?.name?.split(' ')[0] || 'Member'`.
    private static func firstName(_ name: String?) -> String? {
        guard let name else { return nil }
        let first = String(name.split(separator: " ", omittingEmptySubsequences: false).first ?? "")
        return first.isEmpty ? nil : first
    }
}

/// One flash banner; each has its own identity so a later message isn't cleared by an earlier timer.
private struct RecurringFlash: Equatable {
    enum Kind { case success, error }
    let id = UUID()
    let kind: Kind
    let text: String
}
