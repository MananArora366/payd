import PaydCore
import SwiftUI
import UIKit

/// Sticky top bar (web/src/components/Navbar.tsx): wordmark → home, add expense, Payd Lens, profile toggle.
struct Navbar: View {
    @Environment(LedgerStore.self) private var store
    @Environment(AppRouter.self) private var router

    private var onProfile: Bool { router.tab == .profile }

    var body: some View {
        HStack {
            brandButton
            Spacer()
            HStack(spacing: 8) {
                addButton
                lensButton
                profileButton
            }
        }
        .padding(.horizontal, 16)
        .frame(height: 64)
        .frame(maxWidth: 1152)
        .frame(maxWidth: .infinity)
        .background {
            ZStack {
                Rectangle().fill(.ultraThinMaterial)
                PaydTheme.canvas.opacity(0.85)
            }
            .ignoresSafeArea(edges: .top)
        }
        .overlay(alignment: .bottom) {
            Rectangle().fill(PaydTheme.border).frame(height: 1)
        }
    }

    private var brandButton: some View {
        Button {
            router.navigate(.home)
        } label: {
            HStack(spacing: 8) {
                PaydLogoImage()
                    .frame(width: 32, height: 32)
                HStack(alignment: .lastTextBaseline, spacing: 4) {
                    Text("payd")
                        .font(.paydLogo(size: 24))
                        .tracking(PaydFonts.logoTracking)
                        .foregroundStyle(.white)
                    Circle()
                        .fill(PaydTheme.brandGradient)
                        .frame(width: 8, height: 8)
                        .padding(.bottom, 2)
                }
            }
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Payd home")
        .accessibilityAddTraits(.isButton)
    }

    private var addButton: some View {
        Button {
            router.present(.addExpense(AddExpenseRequest()))
        } label: {
            Image(systemName: "plus")
                .font(.system(size: 16, weight: .bold))
                .foregroundStyle(PaydTheme.zinc950)
                .frame(width: 36, height: 36)
                .background(PaydTheme.brand400, in: Circle())
        }
        .buttonStyle(PressScaleButtonStyle())
        .accessibilityLabel("Add expense")
    }

    private var lensButton: some View {
        Button {
            router.present(.receiptScanner)
        } label: {
            Image(systemName: "camera")
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(PaydTheme.brand400)
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .frame(minHeight: 32)
                .background(PaydTheme.card, in: Capsule())
                .overlay(Capsule().strokeBorder(Color.white.opacity(0.1)))
        }
        .buttonStyle(PressScaleButtonStyle())
        .accessibilityLabel("Scan receipt with Payd Lens")
    }

    private var profileButton: some View {
        Button {
            router.navigate(onProfile ? .home : .profile)
        } label: {
            InitialsDisc(PaydFormat.initialsNavbar(store.currentUser.name), size: 24, fontSize: 11)
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
                .background(PaydTheme.card, in: Capsule())
                .overlay(Capsule().strokeBorder(onProfile ? PaydTheme.brand500 : Color.white.opacity(0.1)))
                .background {
                    if onProfile {
                        Capsule().stroke(PaydTheme.brand500.opacity(0.4), lineWidth: 2).padding(-2)
                    }
                }
        }
        .buttonStyle(.plain)
        .accessibilityLabel(onProfile ? "Close profile and go home" : "Your profile")
        .accessibilityAddTraits(onProfile ? .isSelected : [])
    }
}

/// web/public/brand/payd-logo-96.png (bundled as Resources/Brand/payd-logo.png + @2x).
struct PaydLogoImage: View {
    var body: some View {
        if let image = UIImage(named: "payd-logo", in: .main, with: nil) {
            Image(uiImage: image).resizable().scaledToFit().accessibilityHidden(true)
        } else {
            Circle().fill(PaydTheme.brandGradient).accessibilityHidden(true)
        }
    }
}
