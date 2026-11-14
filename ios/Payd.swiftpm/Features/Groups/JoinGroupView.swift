import PaydCore
import SwiftUI

/// Port of web/src/app/join/[token]/page.tsx, presented as a sheet for `/join/<token>` and `payd://join/<token>`.
struct JoinGroupView: View {
    let token: String

    init(token: String) {
        self.token = token
    }

    @Environment(LedgerStore.self) private var store
    @Environment(AppRouter.self) private var router
    @State private var joined = false
    @State private var error: String?
    @State private var redirectTask: Task<Void, Never>?

    /// router.push('/') delay after a successful join.
    private static let redirectDelay: Duration = .milliseconds(1500)

    private var inviteToken: String { GroupLogic.extractInviteToken(token) }

    var body: some View {
        let group = GroupLogic.resolveInviteGroup(inviteToken, groups: store.state.groups)
        ScrollView {
            VStack(spacing: 20) {
                if let group {
                    inviteContent(group)
                } else {
                    unavailableContent
                }
                footer
            }
            .multilineTextAlignment(.center)
            .padding(24)
            .frame(maxWidth: .infinity)
            .background(PaydTheme.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(Color.white.opacity(0.1)))
            .shadow(color: .black.opacity(0.5), radius: 25, y: 12)
            .padding(16)
            .frame(maxWidth: 448)
            .frame(maxWidth: .infinity)
        }
        .background(PaydTheme.canvas.ignoresSafeArea())
        .onDisappear { redirectTask?.cancel() }
    }

    // MARK: - Invalid token

    @ViewBuilder private var unavailableContent: some View {
        tile(systemName: "link", fill: PaydTheme.rose500.opacity(0.15), stroke: PaydTheme.rose500.opacity(0.3),
             tint: PaydTheme.rose400)
        VStack(spacing: 4) {
            pill("Invite unavailable", fill: PaydTheme.rose500.opacity(0.15), text: PaydTheme.rose300)
            Text("Invite not found or expired")
                .paydHeadingFont(size: 20)
                .foregroundStyle(.white)
                .padding(.top, 4)
                .accessibilityAddTraits(.isHeader)
            Text("This invite link doesn't match any group. Ask the group admin to send a fresh link.")
                .font(.payd(size: 12))
                .foregroundStyle(PaydTheme.zinc400)
                .fixedSize(horizontal: false, vertical: true)
        }
        Button(action: router.dismissSheet) {
            Text("Back to Payd")
                .font(.payd(size: 14, bold: true))
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity, minHeight: 44)
                .background(PaydTheme.cardSubtle, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    // MARK: - Valid invite

    @ViewBuilder private func inviteContent(_ group: LedgerGroup) -> some View {
        let currentUser = store.currentUser
        let alreadyMember = store.state.groupMembers.contains { $0.groupId == group.id && $0.userId == currentUser.id }
        let memberCount = store.groupMembers(group.id).count
        tile(systemName: "person.2", fill: PaydTheme.zinc700, stroke: .clear, tint: .white)
        VStack(spacing: 4) {
            pill("Group Invitation", fill: PaydTheme.brand500.opacity(0.2), text: PaydTheme.brand300)
            Text("Join \(group.name)")
                .paydHeadingFont(size: 20)
                .foregroundStyle(.white)
                .padding(.top, 4)
                .accessibilityAddTraits(.isHeader)
            if let description = group.description, !description.isEmpty {
                Text(description)
                    .font(.payd(size: 12))
                    .foregroundStyle(PaydTheme.zinc400)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Text("\(memberCount) member\(memberCount == 1 ? "" : "s") • AED ledger")
                .font(.payd(size: 11))
                .foregroundStyle(PaydTheme.zinc500)
        }
        if let error { ErrorBanner(error) }
        if joined {
            HStack(spacing: 8) {
                Image(systemName: "checkmark.circle").font(.system(size: 18, weight: .semibold))
                Text("Joined group! Redirecting to dashboard...").font(.payd(size: 12, bold: true))
            }
            .foregroundStyle(PaydTheme.emerald400)
            .frame(maxWidth: .infinity)
            .padding(16)
            .background(PaydTheme.emerald500.opacity(0.1), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous)
                .strokeBorder(PaydTheme.emerald500.opacity(0.3)))
        } else if alreadyMember {
            VStack(spacing: 12) {
                note(Text("You're already a member of ") + Text(group.name).bold().foregroundStyle(Color.white) + Text("."),
                     color: PaydTheme.zinc300)
                primaryButton("Open Payd", action: openPayd)
            }
        } else {
            VStack(spacing: 12) {
                note(Text("Joining as ") + Text(currentUser.name).bold().foregroundStyle(Color.white)
                     + Text(" (\(currentUser.email))"), color: PaydTheme.zinc400)
                primaryButton("Accept & Join Group", action: handleJoin)
            }
        }
    }

    private var footer: some View {
        HStack(spacing: 6) {
            Image(systemName: "checkmark.shield")
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(PaydTheme.emerald500)
                .accessibilityHidden(true)
            Text("Payd Voice-First Shared Expense Ledger")
                .font(.payd(size: 11))
                .foregroundStyle(PaydTheme.zinc500)
        }
        .padding(.top, 8)
    }

    // MARK: - Pieces

    private func tile(systemName: String, fill: Color, stroke: Color, tint: Color) -> some View {
        Image(systemName: systemName)
            .font(.system(size: 28, weight: .semibold))
            .foregroundStyle(tint)
            .frame(width: 64, height: 64)
            .background(fill, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(stroke))
            .accessibilityHidden(true)
    }

    private func pill(_ text: String, fill: Color, text color: Color) -> some View {
        Text(text.uppercased())
            .paydHeadingFont(size: 10)
            .tracking(0.5)
            .foregroundStyle(color)
            .padding(.horizontal, 10)
            .padding(.vertical, 2)
            .background(fill, in: Capsule())
    }

    private func note(_ text: Text, color: Color) -> some View {
        text
            .font(.payd(size: 12))
            .foregroundStyle(color)
            .frame(maxWidth: .infinity)
            .padding(12)
            .background(PaydTheme.canvas, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(Color.white.opacity(0.1)))
    }

    private func primaryButton(_ title: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 8) {
                Text(title).font(.payd(size: 14, bold: true))
                Image(systemName: "arrow.right").font(.system(size: 14, weight: .semibold))
            }
            .foregroundStyle(PaydTheme.zinc950)
            .frame(maxWidth: .infinity, minHeight: 44)
            .background(PaydTheme.brand400, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            .contentShape(Rectangle())
        }
        .buttonStyle(PressScaleButtonStyle())
    }

    // MARK: - Actions

    private func openPayd() {
        router.dismissSheet()
        router.navigate(.home)
    }

    private func handleJoin() {
        error = nil
        guard store.joinGroupByToken(inviteToken).success else {
            error = "Invite not found or expired. Ask the group admin for a new link."
            return
        }
        joined = true
        redirectTask?.cancel()
        redirectTask = Task {
            try? await Task.sleep(for: Self.redirectDelay)
            guard !Task.isCancelled else { return }
            openPayd()
        }
    }
}
