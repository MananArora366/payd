import Foundation

/// Port of web/src/components/profile/profileForm.ts.
public enum ProfileForm {
    /// Field errors (nil when valid) and the parsed budget in fils.
    public static func validate(name: String, budgetText: String) -> (nameError: String?, budgetError: String?, budgetMinor: Int) {
        let trimmed = name.jsTrimmed
        var nameError: String?
        if trimmed.isEmpty { nameError = "Please enter a display name." }
        else if trimmed.jsLength > 60 { nameError = "Display name must be 60 characters or fewer." }

        var budgetError: String?
        var budgetMinor = 0
        switch Currency.tryParseMajorToMinor(budgetText, currency: Currency.ledgerCode) {
        case let .failure(error):
            budgetError = budgetText.jsTrimmed.isEmpty ? "Please enter a monthly budget." : error.message
        case let .success(value):
            if value <= 0 { budgetError = "Your monthly budget must be more than AED 0." } else { budgetMinor = value }
        }
        return (nameError, budgetError, budgetMinor)
    }
}
