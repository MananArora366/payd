import PaydCore
import SwiftUI

/// Port of web/src/components/modals/FairPayerRouletteModal.tsx: pick a visible group, a bill amount and a mode,
/// spin a (debt-weighted) wheel and record the winner's bill as an equal split. State resets on every presentation.
struct FairPayerRouletteView: View {
    let defaultGroupId: String?

    init(defaultGroupId: String?) {
        self.defaultGroupId = defaultGroupId
    }

    @Environment(LedgerStore.self) private var store
    @Environment(AppRouter.self) private var router

    @State private var didSetUp = false
    @State private var selectedGroupId: String?
    @State private var amountStr = Self.defaultAmount
    @State private var selectedUserIds: [String] = []
    @State private var mode: GroupLogic.RouletteMode = .debtWeighted
    @State private var error: String?
    @State private var isSpinning = false
    @State private var currentRotation = 0.0
    @State private var winnerId: String?
    @State private var showCelebration = false
    @State private var spinTask: Task<Void, Never>?

    private static let defaultAmount = "45.00"
    private static let presets = ["25.00", "45.00", "80.00", "150.00"]
    private static let spinDuration = 4.0

    private var groups: [LedgerGroup] { store.snapshot.visibleGroups }
    private var groupMembers: [User] { selectedGroupId.map(store.groupMembers) ?? [] }
    private var participants: [User] { groupMembers.filter { selectedUserIds.contains($0.id) } }

    private var sliceWeights: [RouletteSlice] {
        let people = participants
        let balances = selectedGroupId.map(store.groupBalances) ?? Shares()
        let weights = GroupLogic.rouletteWeights(userIds: people.map(\.id), groupBalances: balances, mode: mode)
        return zip(people, weights).map { user, weight in
            RouletteSlice(userId: user.id, firstName: PaydFormat.firstName(user.name), weight: weight.weight)
        }
    }

    private var amountCheck: Result<Int, ParseError> { GroupLogic.parseAmountInput(amountStr) }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                header
                groupPicker
                if let error { ErrorBanner(error) }
                amountAndMode
                wheelSection
                participantsSection
                actionButtons.padding(.top, 8)
            }
            .padding(24)
        }
        .scrollDismissesKeyboard(.interactively)
        .onAppear(perform: setUp)
        .onDisappear(perform: clearSpinTimer)
    }

    // MARK: - Sections

    private var header: some View {
        VStack(spacing: 0) {
            HStack(spacing: 8) {
                IconTile(systemName: "cup.and.saucer", tint: PaydTheme.amber400, size: 36, iconSize: 18)
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 6) {
                        Text("Fair payer roulette")
                            .paydHeadingFont(size: 16)
                            .foregroundStyle(.white)
                            .accessibilityAddTraits(.isHeader)
                        Text("Mini-game")
                            .paydHeadingFont(size: 9)
                            .foregroundStyle(PaydTheme.amber300)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 2)
                            .background(PaydTheme.amber500.opacity(0.2), in: Capsule())
                            .overlay(Capsule().strokeBorder(PaydTheme.amber500.opacity(0.3)))
                    }
                    Text("Who covers coffee or lunch today?")
                        .font(.payd(size: 11))
                        .foregroundStyle(PaydTheme.zinc400)
                }
                Spacer()
                Button(action: router.dismissSheet) {
                    Image(systemName: "xmark")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(PaydTheme.zinc400)
                        .frame(width: 32, height: 32)
                        .contentShape(Circle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Close")
            }
            .padding(.bottom, 8)
            Rectangle().fill(PaydTheme.border).frame(height: 1)
        }
    }

    @ViewBuilder private var groupPicker: some View {
        if groups.isEmpty {
            Text("Join or create a group to play Fair Payer Roulette.")
                .font(.payd(size: 12))
                .foregroundStyle(PaydTheme.zinc400)
                .multilineTextAlignment(.center)
                .frame(maxWidth: .infinity)
                .padding(12)
                .background(PaydTheme.canvas, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(Color.white.opacity(0.1)))
        } else {
            VStack(alignment: .leading, spacing: 4) {
                uppercaseLabel("Group", color: PaydTheme.zinc400)
                PaydMenuPicker(selection: Binding(get: { selectedGroupId ?? "" },
                                                  set: { selectGroup($0.isEmpty ? nil : $0) }),
                               options: groups.map { (value: $0.id, label: $0.name) },
                               isDisabled: isSpinning)
            }
        }
    }

    private var amountAndMode: some View {
        VStack(spacing: 10) {
            HStack {
                uppercaseLabel("Bill Amount", color: PaydTheme.slate400)
                Spacer(minLength: 8)
                HStack(spacing: 4) {
                    ForEach(Self.presets, id: \.self) { preset in presetButton(preset) }
                }
            }
            RouletteAmountField(text: $amountStr)
                .onChange(of: amountStr) { _, _ in error = nil }
            modeSwitcher
            if mode == .debtWeighted {
                Text("⚖️ Members who owe this group get +1 slice per AED \(GroupLogic.rouletteFilsPerExtraSlice / 100) owed (up to +\(GroupLogic.rouletteMaxExtraSlices)). Everyone else gets 1 slice.")
                    .font(.payd(size: 10))
                    .foregroundStyle(PaydTheme.amber400)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: .infinity)
                    .padding(8)
                    .background(PaydTheme.amber500.opacity(0.1), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            }
        }
    }

    private func presetButton(_ preset: String) -> some View {
        let isSelected = amountStr == preset
        return Button {
            amountStr = preset
            error = nil
        } label: {
            Text("AED \(preset.split(separator: ".").first.map(String.init) ?? preset)")
                .font(.payd(size: 10, bold: true))
                .foregroundStyle(isSelected ? .white : PaydTheme.slate500)
                .padding(.horizontal, 8)
                .padding(.vertical, 2)
                .background(isSelected ? PaydTheme.amber500 : PaydTheme.slate800,
                            in: RoundedRectangle(cornerRadius: 8, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }

    private var modeSwitcher: some View {
        HStack(spacing: 4) {
            modeButton(.debtWeighted, title: "Smart Debt-Weighted", systemName: "scalemass",
                       selectedColor: PaydTheme.amber400)
            modeButton(.equal, title: "Pure Chance", systemName: "dice", selectedColor: PaydTheme.slate200)
        }
        .padding(4)
        .background(PaydTheme.slate850, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
    }

    private func modeButton(_ value: GroupLogic.RouletteMode, title: String, systemName: String,
                            selectedColor: Color) -> some View {
        let isSelected = mode == value
        return Button {
            mode = value
        } label: {
            HStack(spacing: 6) {
                Image(systemName: systemName).font(.system(size: 12, weight: .semibold))
                Text(title).font(.payd(size: 12, bold: true)).lineLimit(1).minimumScaleFactor(0.8)
            }
            .foregroundStyle(isSelected ? selectedColor : PaydTheme.slate500)
            .frame(maxWidth: .infinity, minHeight: 30)
            .background(isSelected ? PaydTheme.slate900 : .clear,
                        in: RoundedRectangle(cornerRadius: 8, style: .continuous))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }

    private var wheelSection: some View {
        VStack(spacing: 12) {
            RouletteWheel(slices: sliceWeights, showsBoost: mode == .debtWeighted, rotation: currentRotation)
            if showCelebration, let winner = winnerId.flatMap(store.user) {
                winnerCard(winner)
                    .transition(.scale(scale: 0.95).combined(with: .opacity))
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 8)
    }

    private func winnerCard(_ winner: User) -> some View {
        let pays: String
        switch amountCheck {
        case let .success(value): pays = Currency.format(value, currency: "AED")
        case .failure: pays = "the bill"
        }
        return VStack(spacing: 2) {
            HStack(spacing: 6) {
                Image(systemName: "trophy").font(.system(size: 14, weight: .semibold))
                Text("WINNER COVERS THE BILL!").font(.payd(size: 12, bold: true)).tracking(0.6)
            }
            .foregroundStyle(PaydTheme.amber400)
            Text(winner.name)
                .font(.payd(size: 18, bold: true))
                .foregroundStyle(.white)
            Text("Pays \(pays) • Split equally among \(participants.count) friends")
                .font(.payd(size: 11))
                .foregroundStyle(PaydTheme.slate400)
        }
        .multilineTextAlignment(.center)
        .frame(maxWidth: .infinity)
        .padding(14)
        .background(PaydTheme.amber500.opacity(0.1), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(PaydTheme.amber500.opacity(0.4)))
    }

    private var participantsSection: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text("In the Wheel (\(participants.count))").font(.payd(size: 12))
                Spacer()
                Text("Tap to include/exclude").font(.payd(size: 10))
            }
            .foregroundStyle(PaydTheme.slate400)
            GroupsFlowLayout(spacing: 6) {
                if groupMembers.count < 2 {
                    Text("This group needs at least 2 members to spin.")
                        .font(.payd(size: 11))
                        .foregroundStyle(PaydTheme.zinc500)
                }
                ForEach(groupMembers) { user in participantChip(user) }
            }
        }
    }

    private func participantChip(_ user: User) -> some View {
        let inWheel = selectedUserIds.contains(user.id)
        return Button {
            toggleUser(user.id)
        } label: {
            HStack(spacing: 4) {
                AvatarView(user: user, size: 14)
                Text(PaydFormat.firstName(user.name)).font(.payd(size: 12, bold: inWheel))
            }
            .foregroundStyle(inWheel ? PaydTheme.zinc950 : PaydTheme.slate400)
            .padding(.horizontal, 10)
            .padding(.vertical, 4)
            .background(inWheel ? Color.white : PaydTheme.slate800, in: Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(inWheel ? .isSelected : [])
    }

    @ViewBuilder private var actionButtons: some View {
        if let winner = winnerId.flatMap(store.user), showCelebration {
            HStack(spacing: 8) {
                Button(action: handleSpin) {
                    Text("Re-spin")
                        .font(.payd(size: 12, bold: true))
                        .foregroundStyle(PaydTheme.slate300)
                        .padding(.horizontal, 16)
                        .frame(minHeight: 44)
                        .background(PaydTheme.slate800, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                }
                .buttonStyle(.plain)
                .disabled(isSpinning)
                Button(action: handleRecordTransaction) {
                    Text("Record \(PaydFormat.firstName(winner.name))'s Bill to Ledger")
                        .font(.payd(size: 12, bold: true))
                        .foregroundStyle(.white)
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                        .padding(.horizontal, 16)
                        .frame(maxWidth: .infinity, minHeight: 44)
                        .background(PaydTheme.emerald600, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                }
                .buttonStyle(.plain)
            }
        } else {
            let isDisabled = isSpinning || sliceWeights.count < 2
            Button(action: handleSpin) {
                HStack(spacing: 8) {
                    RouletteSpinIcon(isSpinning: isSpinning)
                    Text(isSpinning ? "Spinning..." : "Spin The Wheel!").font(.payd(size: 14, bold: true))
                }
                .foregroundStyle(PaydTheme.zinc950)
                .frame(maxWidth: .infinity, minHeight: 50)
                .background(PaydTheme.amber500, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                .opacity(isDisabled ? 0.5 : 1)
            }
            .buttonStyle(PressScaleButtonStyle(scale: 0.98))
            .disabled(isDisabled)
        }
    }

    private func uppercaseLabel(_ text: String, color: Color) -> some View {
        Text(text.uppercased())
            .font(.payd(size: 12, bold: true))
            .tracking(0.6)
            .foregroundStyle(color)
    }

    // MARK: - Logic (FairPayerRouletteModal.tsx:42-306)

    private func setUp() {
        guard !didSetUp else { return }
        didSetUp = true
        let initial = defaultGroupId.flatMap { id in groups.contains { $0.id == id } ? id : nil } ?? groups.first?.id
        selectGroup(initial)
        amountStr = Self.defaultAmount
        mode = .debtWeighted
    }

    private func clearSpinTimer() {
        spinTask?.cancel()
        spinTask = nil
    }

    private func resetRound() {
        clearSpinTimer()
        isSpinning = false
        winnerId = nil
        showCelebration = false
        error = nil
    }

    private func selectGroup(_ groupId: String?) {
        selectedGroupId = groupId
        selectedUserIds = groupId.map { store.groupMembers($0).map(\.id) } ?? []
        resetRound()
    }

    private func toggleUser(_ userId: String) {
        if isSpinning { return }
        if selectedUserIds.contains(userId) {
            if participants.count <= 2 {
                error = "Keep at least 2 people in the wheel."
                return
            }
            selectedUserIds = selectedUserIds.filter { $0 != userId }
        } else {
            selectedUserIds = selectedUserIds + [userId]
        }
        resetRound()
    }

    private func handleSpin() {
        let slices = sliceWeights
        if isSpinning || slices.count < 2 { return }
        if case let .failure(parseError) = amountCheck {
            error = parseError.message
            return
        }
        error = nil
        isSpinning = true
        winnerId = nil
        showCelebration = false

        let weights = slices.map(\.weight)
        let totalWeight = Double(weights.reduce(0, +))
        let selectedIndex = max(0, GroupLogic.pickWeightedIndex(weights, rand01: Double.random(in: 0..<1)))
        let angleBefore = weights.prefix(selectedIndex).reduce(0.0) { $0 + Double($1) / totalWeight * 360 }
        let selectedSpan = Double(weights[selectedIndex]) / totalWeight * 360
        let targetSliceMid = angleBefore + selectedSpan / 2
        // Pointer sits at 12 o'clock (270°): bring the slice midpoint there.
        let neededRotation = (270 - targetSliceMid + 360).truncatingRemainder(dividingBy: 360)
        let extraSpins = 360 * Double(6 + Int.random(in: 0..<3))
        let nextRotation = currentRotation + extraSpins + neededRotation
            - currentRotation.truncatingRemainder(dividingBy: 360)
        withAnimation(.timingCurve(0.15, 0.9, 0.2, 1, duration: Self.spinDuration)) {
            currentRotation = nextRotation
        }

        let winner = slices[selectedIndex].userId
        clearSpinTimer()
        spinTask = Task {
            try? await Task.sleep(for: .seconds(Self.spinDuration))
            guard !Task.isCancelled else { return }
            spinTask = nil
            isSpinning = false
            winnerId = winner
            withAnimation(.easeOut(duration: 0.2)) { showCelebration = true }
        }
    }

    private func handleRecordTransaction() {
        guard let winnerId, let groupId = selectedGroupId else { return }
        error = nil
        let amount: Int
        switch GroupLogic.parseAmountInput(amountStr) {
        case let .failure(parseError):
            error = parseError.message
            return
        case let .success(value):
            amount = value
        }
        let memberIds = Set(groupMembers.map(\.id))
        let splitIds = participants.map(\.id).filter { memberIds.contains($0) }
        if splitIds.count < 2 || !memberIds.contains(winnerId) {
            error = "Pick at least 2 group members and spin again."
            return
        }
        let firstName = store.user(winnerId).map { PaydFormat.firstName($0.name) } ?? ""
        let modeLabel = mode == .debtWeighted ? "Debt-Weighted Fairness" : "Pure Random"
        do {
            let shares = try Splits.equal(amount, among: splitIds)
            try store.addTransaction(NewTransaction(
                type: .expense,
                title: "Coffee & Treats Round (Covered by \(firstName.isEmpty ? "Winner" : firstName))",
                amountMinor: amount,
                currency: "AED",
                categoryId: SeedIDs.food, // Food and dining
                payerId: winnerId,
                groupId: groupId,
                paymentMethod: "Card / Apple Pay",
                notes: "Fair Payer Roulette round • \(modeLabel)",
                splits: shares.map { ShareAllocation(userId: $0.key, shareMinor: $0.value) }))
        } catch {
            self.error = "We couldn't record this round. Check the amount and try again."
            return
        }
        router.dismissSheet()
    }
}

/// `RotateCw` with `animate-spin` while the wheel turns.
private struct RouletteSpinIcon: View {
    let isSpinning: Bool
    @State private var angle = 0.0

    var body: some View {
        Image(systemName: "arrow.clockwise")
            .font(.system(size: 14, weight: .semibold))
            .rotationEffect(.degrees(angle))
            .onChange(of: isSpinning, initial: true) { _, spinning in
                if spinning {
                    withAnimation(.linear(duration: 1).repeatForever(autoreverses: false)) { angle = 360 }
                } else {
                    withAnimation(.default) { angle = 0 }
                }
            }
    }
}

/// Bill amount input (`text-center font-semibold rounded-2xl focus:ring-amber-500`, "AED" on the right).
/// Free text like the web (validated by `GroupLogic.parseAmountInput`), with the locale decimal-comma fix.
private struct RouletteAmountField: View {
    @Binding var text: String
    @FocusState private var isFocused: Bool

    var body: some View {
        TextField("", text: Binding(get: { text }, set: { typed in
            text = Currency.normalizeLocaleDecimalInput(typed, decimalSeparator: Locale.current.decimalSeparator ?? ".")
        }))
        .focused($isFocused)
        .keyboardType(.decimalPad)
        .multilineTextAlignment(.center)
        .font(.payd(size: 14, bold: true))
        .foregroundStyle(.white)
        .tint(PaydTheme.amber500)
        .monospacedDigit()
        .padding(.leading, 16)
        .padding(.trailing, 56)
        .frame(minHeight: 40)
        .background(PaydTheme.canvas, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous)
            .strokeBorder(isFocused ? PaydTheme.amber500 : Color.white.opacity(0.1), lineWidth: isFocused ? 2 : 1))
        .overlay(alignment: .trailing) {
            Text("AED")
                .font(.payd(size: 12, bold: true))
                .foregroundStyle(PaydTheme.slate400)
                .padding(.trailing, 16)
                .allowsHitTesting(false)
        }
        .accessibilityLabel("Bill amount in AED")
    }
}
