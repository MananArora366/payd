import Foundation
import Testing
@testable import PaydCore

/// Port of web/src/components/modals/lensMirror.test.ts.
struct LensMirrorPortTests {
    @Test("mirrors user-facing cameras and laptop webcams")
    func mirrors() {
        #expect(LensMirror.shouldMirrorPreview(facingMode: "user", label: "Front Camera"))
        #expect(LensMirror.shouldMirrorPreview(facingMode: nil, label: "FaceTime HD Camera (Built-in)"))
        #expect(LensMirror.shouldMirrorPreview(facingMode: nil, label: "Logitech C920 USB Webcam"))
        #expect(LensMirror.shouldMirrorPreview(facingMode: nil, label: nil))
    }

    @Test("does not mirror rear cameras")
    func rear() {
        #expect(!LensMirror.shouldMirrorPreview(facingMode: "environment", label: "Back Camera"))
        #expect(!LensMirror.shouldMirrorPreview(facingMode: nil, label: "Back Ultra Wide Camera"))
        #expect(!LensMirror.shouldMirrorPreview(facingMode: nil, label: "camera2 0, facing back"))
        #expect(!LensMirror.shouldMirrorPreview(facingMode: nil, label: "Rear Camera"))
    }
}

/// Port of web/src/components/profile/profileForm.test.ts.
struct ProfileFormPortTests {
    @Test("accepts a trimmed name and positive budget")
    func accepts() {
        let r = ProfileForm.validate(name: "  Manan  ", budgetText: "5,000.50")
        #expect(r.nameError == nil && r.budgetError == nil)
        #expect(r.budgetMinor == 500050)
    }

    @Test("rejects empty / whitespace names")
    func emptyName() {
        #expect(ProfileForm.validate(name: "   ", budgetText: "100").nameError == "Please enter a display name.")
        #expect(ProfileForm.validate(name: String(repeating: "x", count: 61), budgetText: "100").nameError
            == "Display name must be 60 characters or fewer.")
    }

    @Test("rejects blank, zero, negative and malformed budgets", arguments: ["", "0", "-5", "1e3", "abc", "1.2.3"])
    func budgets(_ budget: String) {
        #expect(ProfileForm.validate(name: "A", budgetText: budget).budgetError != nil)
    }

    @Test("budget messages are verbatim")
    func messages() {
        #expect(ProfileForm.validate(name: "A", budgetText: " ").budgetError == "Please enter a monthly budget.")
        #expect(ProfileForm.validate(name: "A", budgetText: "0").budgetError == "Your monthly budget must be more than AED 0.")
    }
}
