# Payd iOS — Native Swift & SwiftUI Expense Tracker

A lightweight, native iOS expense tracking app built with modern Swift and SwiftUI.

## Architecture & Features

- **PaydCore Ledger**: All state lives in a `LedgerState` from the local `../PaydCore` package and changes only through its pure `LedgerActions`. `LedgerStore` (`@Observable`) persists it as JSON (`payd_state_v1.json` in Application Support, same shape as the web app). First launch loads the demo seed.
- **Financial Precision**: Money is integer minor units (fils), parsed and formatted by `PaydCore.Currency`, so there are no floats.
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
├── ExpenseTrackerApp.swift   # Main app entry point; injects LedgerStore
├── Store/
│   └── LedgerStore.swift      # Observable wrapper over PaydCore + JSON persistence
├── Models/
│   └── CategoryStyle.swift    # Tint colours for PaydCore categories
└── Views/
    ├── ContentView.swift      # Primary view with search, filter chips, and list
    ├── SummaryCardView.swift  # Dashboard KPI card
    ├── ExpenseRowView.swift   # Single transaction list row
    └── AddExpenseView.swift   # Add expense modal sheet
```

## How to Run in Xcode

1. Open `ios/Payd.swiftpm` in **Xcode 16+** (it depends on `../PaydCore` by path, which Swift Playgrounds does not support).
2. Select any iOS Simulator and hit **Cmd + R**.
