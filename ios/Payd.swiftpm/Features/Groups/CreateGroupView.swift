import PaydCore
import SwiftUI

/// Port of web/src/components/modals/CreateGroupModal.tsx. The form starts fresh on every presentation;
/// the creator is always a member. GroupsView auto-selects the new group once it appears.
struct CreateGroupView: View {
    init() {}

    @Environment(LedgerStore.self) private var store
    @Environment(AppRouter.self) private var router

    @State private var name = ""
    @State private var description = ""
    /// Members picked besides the creator, in tap order (web `selectedUserIds` minus the creator).
    @State private var addedUserIds: [String] = []
    @State private var error: String?

    private static let maxNameLength = 60

    private var selectedUserIds: [String] { ([store.currentUser.id] + addedUserIds).uniqued() }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                SheetHeader(title: "Create new group", onClose: router.dismissSheet)
                if let error { ErrorBanner(error) }
                field("Group name") {
                    PaydTextField("e.g. Dubai Villa, Supper Club", text: $name)
                        .submitLabel(.done)
                }
                field("Description") {
                    PaydTextField("e.g. Shared expenses, rent, groceries", text: $description)
                }
                VStack(alignment: .leading, spacing: 4) {
                    field("Ledger currency") {
                        PaydMenuPicker(selection: .constant("AED"), options: [(value: "AED", label: "AED (UAE Dirham)")],
                                       isDisabled: true)
                    }
                    Text("AED only for now (multi-currency coming soon)")
                        .font(.payd(size: 10))
                        .foregroundStyle(PaydTheme.zinc500)
                }
                membersList
                HStack(spacing: 12) {
                    Button("Cancel", action: router.dismissSheet)
                        .buttonStyle(PaydSecondaryButtonStyle(height: 44))
                    Button("Create Group", action: submit)
                        .buttonStyle(PaydPrimaryButtonStyle(height: 44))
                }
                .padding(.top, 8)
            }
            .padding(24)
        }
        .scrollDismissesKeyboard(.interactively)
    }

    private func field<Content: View>(_ label: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            FieldLabel(label)
            content()
        }
    }

    private var membersList: some View {
        let currentId = store.currentUser.id
        let selected = selectedUserIds
        return VStack(alignment: .leading, spacing: 8) {
            FieldLabel("ADD MEMBERS (\(selected.count))")
            ScrollView {
                VStack(spacing: 8) {
                    ForEach(store.state.users) { user in
                        memberRow(user, isSelected: selected.contains(user.id), isCreator: user.id == currentId)
                    }
                }
            }
            .frame(maxHeight: 192)
            .scrollBounceBehavior(.basedOnSize)
        }
    }

    private func memberRow(_ user: User, isSelected: Bool, isCreator: Bool) -> some View {
        Button {
            toggleUser(user.id)
        } label: {
            HStack(spacing: 10) {
                InitialsDisc(PaydFormat.firstLetter(user.name), size: 24, fontSize: 10)
                Text(isCreator ? "\(user.name) (Creator)" : user.name)
                    .font(.payd(size: 14))
                    .foregroundStyle(.white)
                Spacer(minLength: 8)
                if isSelected {
                    Image(systemName: "checkmark")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(PaydTheme.brand400)
                }
            }
            .padding(10)
            .background(isSelected ? PaydTheme.surface22222a : .clear,
                        in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous)
                .strokeBorder(isSelected ? PaydTheme.brand500 : Color.white.opacity(0.06)))
            .contentShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }

    private func toggleUser(_ userId: String) {
        if userId == store.currentUser.id { return } // Creator is always included
        if addedUserIds.contains(userId) {
            addedUserIds = addedUserIds.filter { $0 != userId }
        } else {
            addedUserIds = addedUserIds + [userId]
        }
    }

    private func submit() {
        error = nil
        let trimmedName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmedName.isEmpty {
            error = "Please provide a group name."
            return
        }
        // JS `.length` counts UTF-16 code units.
        if trimmedName.utf16.count > Self.maxNameLength {
            error = "Group name must be 60 characters or fewer."
            return
        }
        store.createGroup(name: trimmedName,
                          description: description.trimmingCharacters(in: .whitespacesAndNewlines),
                          memberIds: selectedUserIds)
        router.dismissSheet()
    }
}
