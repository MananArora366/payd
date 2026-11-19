import Foundation

/// Port of `shouldMirrorPreview` (web/src/components/modals/LensCameraViewer.tsx:25-29).
public enum LensMirror {
    private static let rearLabel = JSRegex("\\b(back|rear|environment)\\b", "i")

    /// Front cameras and webcams are mirrored like FaceTime; rear cameras are not.
    public static func shouldMirrorPreview(facingMode: String?, label: String?) -> Bool {
        if facingMode == "environment" { return false }
        if facingMode == "user" { return true }
        return !rearLabel.test(label ?? "")
    }
}
