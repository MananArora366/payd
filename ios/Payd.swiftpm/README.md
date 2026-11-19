# Payd iOS — SwiftUI port of the Payd web app

A native SwiftUI copy of the Next.js app in `web/` (the source of truth). The binding port contract is
`docs/ios-port/SPEC.md`.

## Architecture

- **PaydCore** (`../PaydCore`): the engine. `LedgerState` mirrors the web's `payd_state_v3` localStorage blob
  and changes only through the pure `LedgerActions`; `LedgerQueries.snapshot` derives everything PaydContext
  memoises. Money is integer minor units (fils) everywhere.
- **LedgerStore** (`Store/`): the only holder of the state. Persists the blob to
  `Application Support/payd_state_v3.json` after every action. A missing file loads the web demo seed; an
  unreadable file is never overwritten (saving is disabled); a corrupt file is moved aside as
  `payd_state_v3.json.corrupt-<ms>`.
- **AppSettings** (`Store/`): `payd_ai_enabled` and the Payd server address (`payd_server_base_url`).
- **PaydAPI** (`Networking/`): calls the web's own routes (`/api/ai/interpret`, `/api/ai/query`,
  `/api/ai/receipt-scan`, `/api/careem/events`, `/api/mcp`) on the configured server. No API keys live in the
  app. With no server (or when it is unreachable) voice falls back to the on-device rules and Payd Lens to
  Apple Vision OCR.
- **Shell** (`Shell/`): `RootView` (navbar, tab content, bottom nav, voice overlay, Careem prompt), `AppRouter`
  (tab, focused group, the single sheet) and `PaydSheetContent` (one sheet per web modal).
- **UI** (`UI/`) and **Theme** (`Theme/`): shared components and the green brand tokens/fonts of the web.
- **Features** (`Features/<Feature>/`): Home, Groups, Settle, Expenses, Lens, VoiceProfile.

## Project structure

```
Payd.swiftpm/
├── ExpenseTrackerApp.swift   # @main: store, settings, router, fonts, payd://join deep link
├── Config/AdditionalInfo.plist
├── Resources/{Fonts,Brand}/
├── Theme/                    # PaydTheme colours/gradients, PaydFonts
├── Store/                    # LedgerStore, AppSettings
├── Networking/               # PaydAPI, APIModels
├── Shell/                    # RootView, Navbar, BottomNav, AppRouter, PaydSheet, PaydSheetContent
├── UI/                       # shared components (cards, buttons, fields, banners, avatars)
└── Features/                 # one directory per feature
```

## How to run

1. Open `ios/Payd.swiftpm` in Xcode (it depends on `../PaydCore` by path, which Swift Playgrounds does not support).
2. Select an iOS 17+ simulator and press **Cmd + R**.
3. Optional: set your Payd web server address in Profile → Payd server to use the server-side AI and Careem features.

Tests: `cd ios/PaydCore && swift test`.
