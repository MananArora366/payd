import Foundation
import SwiftData
import SwiftUI

public enum ExpenseCategory: String, Codable, CaseIterable, Identifiable {
    case food = "Food & Dining"
    case transport = "Transportation"
    case shopping = "Shopping"
    case bills = "Bills & Utilities"
    case entertainment = "Entertainment"
    case healthcare = "Healthcare"
    case other = "Other"

    public var id: String { rawValue }

    public var icon: String {
        switch self {
        case .food: return "fork.knife"
        case .transport: return "car.fill"
        case .shopping: return "cart.fill"
        case .bills: return "bolt.fill"
        case .entertainment: return "tv.fill"
        case .healthcare: return "heart.fill"
        case .other: return "ellipsis.circle.fill"
        }
    }

    public var color: Color {
        switch self {
        case .food: return .orange
        case .transport: return .blue
        case .shopping: return .purple
        case .bills: return .red
        case .entertainment: return .green
        case .healthcare: return .pink
        case .other: return .gray
        }
    }
}

@Model
public final class Expense {
    public var id: UUID
    public var title: String
    public var amount: Decimal
    public var date: Date
    public var categoryRaw: String
    public var notes: String

    public var category: ExpenseCategory {
        get { ExpenseCategory(rawValue: categoryRaw) ?? .other }
        set { categoryRaw = newValue.rawValue }
    }

    public init(
        title: String,
        amount: Decimal,
        category: ExpenseCategory = .other,
        date: Date = Date(),
        notes: String = ""
    ) {
        self.id = UUID()
        self.title = title
        self.amount = amount
        self.categoryRaw = category.rawValue
        self.date = date
        self.notes = notes
    }
}
