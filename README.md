# Payd — Dual-Platform Expense Ledger & Tracker

Payd is a voice-first and camera-first personal and group expense ledger combining effortless AI input with deterministic financial mathematics.

Designed for Dubai and the GCC region: anchored to **AED (100 fils minor units)** with **UAE 5% VAT compliance** and **CBUAE non-custodial ledger architecture**.

---

## Workspace Structure

The project is categorized into two distinct platforms:

```
payd/
├── web/                       # Mobile-First Web Application (Next.js 15 PWA)
│   ├── src/
│   │   ├── app/               # Next.js App Router & API routes (/api/ai/...)
│   │   ├── components/        # UI Views, Modals, Voice Waveform, Payd Lens
│   │   └── lib/               # Deterministic /lib/ledger & Gemini AI
│   ├── supabase/              # PostgreSQL migrations & seed personas
│   ├── package.json
│   └── vitest.config.ts       # 31 Passing financial invariant tests
│
├── ios/                       # Native iOS Application (Swift & SwiftUI)
│   ├── Payd.swiftpm/          # Xcode-Native App Package
│   │   ├── Package.swift      # iOS 17+ SwiftData application manifest
│   │   ├── Models/            # SwiftData @Model and AED financial schema
│   │   └── Views/             # SwiftUI Views, SummaryCard, CameraScannerView
│   └── README.md              # Xcode setup guide
│
└── package.json               # Monorepo unified task runner
```

---

## 1. Web Application (`web/`)

- **Tech Stack**: Next.js 15, React 19, TypeScript, Supabase, Tailwind CSS, Gemini 2.0 Flash
- **Features**:
  - Voice-First input via Web Speech API with real-time waveform and single-question clarification.
  - **Payd Lens**: Gemini Vision camera receipt scanner extracting TRN, line items, and UAE 5% VAT.
  - Zero-Float financial engine (`amount_minor` fils) with deterministic split algorithms.
  - Greedy min-cash-flow peer-to-peer debt simplification.

### Quick Start (Web):
```bash
cd web
npm install
npm run dev
```
Runs at [http://localhost:3000](http://localhost:3000).

Run Tests:
```bash
cd web
npm test
```

---

## 2. Native iOS Application (`ios/`)

- **Tech Stack**: Swift 5.9+, SwiftUI, SwiftData, PhotosUI
- **Features**:
  - Offline-first local persistence with SwiftData (`@Model`, `@Query`).
  - **Payd Lens iOS**: Camera & photo library receipt scanning with instant UAE presets (*Al Safadi*, *Carrefour*, *Careem DineOut*).
  - AED currency formatting with strict Decimal financial precision.
  - Clean Apple Human Interface Guidelines (HIG) with SF Symbols and glass materials.

### Open & Run in Xcode:
```bash
open ios/Payd.swiftpm
```
In Xcode, select any simulator (e.g., iPhone 16 Pro) and press **`Cmd + R`** to run.

---

## Root Shortcuts:
From the root `/Users/user/Desktop/payd` directory:
- `npm run dev` — Starts the Web dev server
- `npm run build` — Builds the Web production bundle
- `npm test` — Runs the 31 financial invariant tests
- `npm run ios` — Opens the native iOS app directly in Xcode
