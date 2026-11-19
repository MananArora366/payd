import PaydCore
import SwiftUI

/// Port of web/src/components/groups/GroupsView.tsx: header, join-by-invite box, the visible group cards
/// (`useVisibleGroups` = `snapshot.visibleGroups`) and the selected group's detail.
struct GroupsView: View {
    init() {}

    @Environment(LedgerStore.self) private var store
    @Environment(AppRouter.self) private var router

    @State private var selectedGroupId: String?
    @State private var joinTokenInput = ""
    @State private var joinMessage: JoinMessage?
    @State private var scrollRequest = 0
    /// knownGroupIdsRef / userIdRef (GroupsView.tsx:88-103); nil until the first render.
    @State private var knownGroupIds: Set<String>?
    @State private var knownUserId: String?

    private static let detailAnchor = "groups-detail"

    struct JoinMessage: Equatable {
        enum Kind { case success, info, error }
        let kind: Kind
        let text: String
    }

    private struct VisibilityKey: Equatable {
        let userId: String
        let groupIds: [String]
    }

    private var visibleGroups: [LedgerGroup] { store.snapshot.visibleGroups }

    private var selectedGroup: LedgerGroup? {
        visibleGroups.first { $0.id == selectedGroupId } ?? visibleGroups.first
    }

    var body: some View {
        ScrollViewReader { proxy in
            VStack(alignment: .leading, spacing: 24) {
                header
                joinBox
                if visibleGroups.isEmpty { emptyCard }
                VStack(spacing: 12) {
                    ForEach(visibleGroups) { group in groupCard(group) }
                }
                if let group = selectedGroup {
                    GroupDetailSection(group: group)
                        .id(Self.detailAnchor)
                }
            }
            .onChange(of: scrollRequest) { _, request in
                guard request > 0 else { return }
                withAnimation(.easeInOut(duration: 0.3)) { proxy.scrollTo(Self.detailAnchor, anchor: .top) }
            }
        }
        .onAppear(perform: handleAppear)
        .onChange(of: router.focusGroupRequest) { _, _ in followFocus() }
        .onChange(of: VisibilityKey(userId: store.currentUser.id, groupIds: visibleGroups.map(\.id))) { _, key in
            autoSelectAdded(key)
        }
    }

    // MARK: - Sections

    private var header: some View {
        VStack(alignment: .leading, spacing: 16) {
            ScreenTitle("Active ledgers", subtitle: "Fewest payments to settle up, so everyone's square")
            Button {
                router.present(.createGroup)
            } label: {
                HStack(spacing: 8) {
                    Image(systemName: "plus")
                        .font(.system(size: 14, weight: .heavy))
                    Text("+ New Group")
                        .font(.payd(size: 14, bold: true))
                }
                .foregroundStyle(PaydTheme.zinc950)
                .padding(.horizontal, 16)
                .padding(.vertical, 10)
                .background(PaydTheme.brand400, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            }
            .buttonStyle(PressScaleButtonStyle())
        }
    }

    private var joinBox: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                Image(systemName: "link")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(PaydTheme.brand400)
                    .accessibilityHidden(true)
                Text("Join Ledger:")
                    .paydHeadingFont(size: 12)
                    .foregroundStyle(PaydTheme.zinc400)
            }
            .padding(.leading, 4)
            GroupsJoinTokenField(text: $joinTokenInput, onSubmit: handleJoinByToken)
                .onChange(of: joinTokenInput) { _, _ in
                    if joinMessage?.kind == .error { joinMessage = nil }
                }
            Button(action: handleJoinByToken) {
                Text("Join")
                    .paydHeadingFont(size: 12)
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity, minHeight: 32)
                    .background(PaydTheme.cardSubtle, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                    .contentShape(Rectangle())
            }
            .buttonStyle(PressScaleButtonStyle())
            if let joinMessage {
                Text(joinMessage.text)
                    .font(.payd(size: 12))
                    .foregroundStyle(color(of: joinMessage.kind))
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityAddTraits(.isStaticText)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .paydCard(padding: 16)
        .shadow(color: .black.opacity(0.05), radius: 1, y: 1)
    }

    private var emptyCard: some View {
        Text("You're not in any groups yet. Create one or paste an invite link above to join.")
            .font(.payd(size: 12))
            .foregroundStyle(PaydTheme.zinc400)
            .multilineTextAlignment(.center)
            .frame(maxWidth: .infinity)
            .paydCard(padding: 32)
    }

    private func groupCard(_ group: LedgerGroup) -> some View {
        let isSelected = selectedGroup?.id == group.id
        let members = store.groupMembers(group.id)
        let myBalance = store.groupBalances(group.id)[store.currentUser.id] ?? 0
        return Button {
            selectGroup(group.id)
        } label: {
            VStack(spacing: 0) {
                HStack(alignment: .top) {
                    HStack(spacing: 12) {
                        Text(PaydFormat.groupEmoji(group.name)).font(.system(size: 24))
                        VStack(alignment: .leading, spacing: 2) {
                            Text(group.name)
                                .paydHeadingFont(size: 14)
                                .foregroundStyle(.white)
                            Text(group.description ?? "")
                                .font(.payd(size: 12))
                                .foregroundStyle(PaydTheme.zinc400)
                                .lineLimit(1)
                        }
                    }
                    Spacer(minLength: 8)
                    Text("AED")
                        .paydHeadingFont(size: 10)
                        .foregroundStyle(PaydTheme.zinc300)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 2)
                        .background(PaydTheme.cardSubtle, in: Capsule())
                }
                Rectangle().fill(Color.white.opacity(0.06)).frame(height: 1).padding(.top, 16)
                HStack {
                    HStack(spacing: -6) {
                        ForEach(members) { member in
                            InitialsDisc(PaydFormat.firstLetter(member.name), size: 24, fontSize: 10)
                                .overlay(Circle().strokeBorder(PaydTheme.card, lineWidth: 2).padding(-2))
                        }
                    }
                    Spacer(minLength: 8)
                    VStack(alignment: .trailing, spacing: 0) {
                        Text("BALANCE")
                            .paydHeadingFont(size: 10)
                            .foregroundStyle(PaydTheme.zinc400)
                        Text(GroupsBalanceStyle.signed(myBalance))
                            .font(.payd(size: 12, bold: true))
                            .foregroundStyle(GroupsBalanceStyle.color(myBalance, zero: PaydTheme.zinc400))
                            .monospacedDigit()
                    }
                }
                .padding(.top, 12)
            }
            .padding(16)
            .background(isSelected ? PaydTheme.surface22222a : PaydTheme.card,
                        in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous)
                .strokeBorder(isSelected ? PaydTheme.brand500 : PaydTheme.border))
            .overlay {
                if isSelected {
                    RoundedRectangle(cornerRadius: 18, style: .continuous)
                        .strokeBorder(PaydTheme.brand500.opacity(0.3), lineWidth: 2)
                        .padding(-2)
                }
            }
            .shadow(color: .black.opacity(0.1), radius: 4, y: 2)
            .contentShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }

    private func color(of kind: JoinMessage.Kind) -> Color {
        switch kind {
        case .error: PaydTheme.rose400
        case .success: PaydTheme.emerald400
        case .info: PaydTheme.zinc300
        }
    }

    // MARK: - Selection (GroupsView.tsx:67-125)

    private func selectGroup(_ id: String) {
        selectedGroupId = id
        scrollRequest += 1
    }

    private func handleAppear() {
        let ids = visibleGroups.map(\.id)
        if knownGroupIds == nil {
            knownGroupIds = Set(ids)
            knownUserId = store.currentUser.id
        }
        if let focus = router.focusGroupId, ids.contains(focus) {
            selectGroup(focus)
        } else if selectedGroupId == nil {
            selectedGroupId = ids.first
        }
    }

    private func followFocus() {
        guard let focus = router.focusGroupId, visibleGroups.contains(where: { $0.id == focus }) else { return }
        selectGroup(focus)
    }

    private func autoSelectAdded(_ key: VisibilityKey) {
        if let previous = knownGroupIds, knownUserId == key.userId,
           let added = key.groupIds.first(where: { !previous.contains($0) }) {
            selectGroup(added)
        }
        knownGroupIds = Set(key.groupIds)
        knownUserId = key.userId
    }

    // MARK: - Join by invite (GroupsView.tsx:138-177)

    private func handleJoinByToken() {
        let token = GroupLogic.extractInviteToken(joinTokenInput)
        if token.isEmpty {
            joinMessage = JoinMessage(kind: .error, text: "Paste an invite link or token first.")
            return
        }
        let currentId = store.currentUser.id
        if let target = GroupLogic.resolveInviteGroup(token, groups: store.state.groups),
           store.state.groupMembers.contains(where: { $0.groupId == target.id && $0.userId == currentId }) {
            selectGroup(target.id)
            joinMessage = JoinMessage(kind: .info, text: "You're already a member of \(target.name).")
            joinTokenInput = ""
            return
        }
        let result = store.joinGroupByToken(token)
        if result.success, let group = result.group {
            selectGroup(group.id)
            joinMessage = result.alreadyMember
                ? JoinMessage(kind: .info, text: result.message ?? "You're already a member of \(group.name).")
                : JoinMessage(kind: .success, text: result.message ?? "Joined \(group.name)!")
            joinTokenInput = ""
        } else {
            joinMessage = JoinMessage(kind: .error, text: "Invite not found or expired. Check the link and try again.")
        }
    }
}

/// The join box input (`px-3.5 py-2 text-xs bg-[#09090b] border-white/10 rounded-xl focus:border-brand-500`).
private struct GroupsJoinTokenField: View {
    @Binding var text: String
    let onSubmit: () -> Void
    @FocusState private var isFocused: Bool

    var body: some View {
        TextField("", text: $text,
                  prompt: Text("Paste invite link or token (e.g. dubai-marina-2026)...").foregroundStyle(PaydTheme.zinc600))
            .focused($isFocused)
            .font(.payd(size: 12))
            .foregroundStyle(.white)
            .tint(PaydTheme.brand400)
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
            .keyboardType(.URL)
            .submitLabel(.join)
            .onSubmit(onSubmit)
            .padding(.horizontal, 14)
            .padding(.vertical, 8)
            .frame(minHeight: 36)
            .background(PaydTheme.canvas, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous)
                .strokeBorder(isFocused ? PaydTheme.brand500 : Color.white.opacity(0.1)))
            .accessibilityLabel("Invite link or token")
    }
}
