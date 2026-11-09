# Payd iOS — Native Swift & SwiftUI Expense Tracker

A lightweight, native iOS expense tracking app built with modern Swift and SwiftUI.

## Architecture & Features

- **SwiftData Storage**: Automatic offline persistence using `@Model` and `@Query` with zero manual Core Data setup.
- **Financial Precision**: Uses Swift `Decimal` for financial accuracy without floating-point math rounding issues.
- **Apple Human Interface Guidelines (HIG)**:
  - SF Symbols and category-specific tinting.
  - Ultra-thin material glass cards.
  - Native NavigationStack and Inset-Grouped list styling.
  - Dynamic Type & Light/Dark mode support.
- **Features**:
  - Live Dashboard card with formatted total spending and transaction count.
  - Category pill filters (Food, Transport, Shopping, Bills, Entertainment, Healthcare, Other).
  - Searchable transaction feed.
  - Add Expense modal with decimal keypad and validation.
  - Native swipe-to-delete with animated list updates.

## Project Structure

```
SwiftExpenseTracker/
├── ExpenseTrackerApp.swift   # Main app entry point with SwiftData model container
├── Models/
│   └── Expense.swift          # @Model definition and ExpenseCategory enum
└── Views/
    ├── ContentView.swift      # Primary view with search, filter chips, and list
    ├── SummaryCardView.swift  # Dashboard KPI card
    ├── ExpenseRowView.swift   # Single transaction list row
    └── AddExpenseView.swift   # Add expense modal sheet
```

## How to Run in Xcode

1. Open **Xcode** (15+ / 16+).
2. Choose **File > New > Project...**
3. Select **iOS > App** and click **Next**.
4. Set:
   - **Interface**: SwiftUI
   - **Storage**: SwiftData
5. Drag and drop these `.swift` files into your Xcode project.
6. Select any iOS Simulator (iPhone 15 / 16 / Pro) and hit **Cmd + R** to run!
