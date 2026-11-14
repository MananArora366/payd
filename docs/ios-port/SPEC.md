# Payd iOS ⇄ Web parity: port contract (SPEC)

Status: binding contract for the 10-agent port on branch `feature/ios-web-parity`.
Source of truth: `web/src/**` (Next.js). Target: `ios/PaydCore` (engine, Swift 6 tools, Swift Testing) and
`ios/Payd.swiftpm` (SwiftUI app, iOS 17+, Swift 5 language mode, AppleProductTypes, Xcode 27).

Agents and ownership:

| # | Agent | Owns |
|---|-------|------|
| 1 | ARCHITECT | this file |
| 2 | CORE | everything under `ios/PaydCore/` |
| 3 | SHELL | `ios/Payd.swiftpm/` except `Features/**` (but SHELL creates the `Features/**` stubs listed in §4, once) |
| 4 | HOME | `ios/Payd.swiftpm/Features/Home/` |
| 5 | GROUPS | `ios/Payd.swiftpm/Features/Groups/` |
| 6 | SETTLE | `ios/Payd.swiftpm/Features/Settle/` |
| 7 | EXPENSES | `ios/Payd.swiftpm/Features/Expenses/` |
| 8 | LENS | `ios/Payd.swiftpm/Features/Lens/` |
| 9 | VOICE-PROFILE | `ios/Payd.swiftpm/Features/VoiceProfile/` |
| 10 | (integration / review agent, if used) | read-only review; fixes only via the owning agent's files |

Recommended order: CORE and SHELL start together (SHELL codes against the signatures in §2 and does its
final build once CORE's API exists). The six feature agents start when CORE + SHELL have landed (stubs
compile). Feature agents never edit files outside their own directory. If a feature needs engine logic that
is not in §2, it is a CORE bug: do the logic privately inside the feature only if it is pure UI glue;
never duplicate ledger maths.

Verification (every agent, before finishing):
- `cd ios/PaydCore && swift test` — all green.
- `cd ios/Payd.swiftpm && xcodebuild -scheme SwiftExpenseTracker -destination 'platform=iOS Simulator,name=iPhone 17' -derivedDataPath <your unique /tmp path> build`
  → `BUILD SUCCEEDED`, zero warnings from our code. Do not install/run on a simulator or device unless told to.
- Never push. Never modify `web/`.

---------------------------------------------------------------------------------------------------

## 0. Global rules and conventions (all agents)

0.1 Money: integer minor units (`Int`, fils) everywhere. No `Double`/`Float`/`CGFloat` arithmetic on money.
Percentages that the web computes with floats are reproduced with the integer helpers in §2.3 (`PaydMath`).
Doubles are allowed only for non-money values (confidence, animation, geometry, lag days).

0.2 State: `LedgerState` is an immutable value; it changes only through the pure `LedgerActions` (§2.9).
`LedgerStore` (SHELL) is the only place that holds/replaces the state and persists it.

0.3 No force-unwraps (`!`, `try!`, `as!`) on anything derived from external data (JSON, files, network,
user input, OCR, speech). No `print()`; log with `os.Logger(subsystem: "com.payd.SwiftExpenseTracker", category: <area>)`
in the app and `Logger(subsystem: "com.payd.PaydCore", category: ...)` in core (only if needed; prefer
returning errors). Every error a user can cause or hit is shown to them in the UI (inline banner exactly
where the web shows it, otherwise the global alert).

0.4 Match the existing style: 4-space indent, `enum` namespaces for pure function groups, `public` API in
PaydCore, explicit `CodingKeys`, doc comments citing the web file they port.

0.5 Name clashes: in the app, `PaydCore.Transaction` and `PaydCore.Group` clash with SwiftUI. SHELL defines in
`ios/Payd.swiftpm/Shell/PaydCoreAliases.swift`:
```swift
typealias LedgerTransaction = PaydCore.Transaction
typealias LedgerGroup = PaydCore.Group
```
App code uses `LedgerTransaction` / `LedgerGroup`; the SwiftUI container is written `SwiftUI.Group`.

0.6 Ordering: JavaScript objects/Maps iterate in insertion order and `Array.prototype.sort` is stable.
Many visible orders depend on this (debt lists, preview rows, split rows, simplified transfers). Therefore:
- Any web `Record<string, number>` / `Map` that is iterated is ported as `OrderedMap` (§2.1), never a
  bare Swift `Dictionary` when order is observable.
- Every web `.sort(...)` is ported with `stableSorted(by:)` (§2.1) using the same comparator.
- `new Set(ids)` dedupe keeps first-occurrence order (`uniqued()` in §2.1).

0.7 Rounding: JS `Math.round(x)` = round half toward +∞. Use `PaydMath` helpers (§2.3); never `.rounded()` on
money.

0.8 Text matching: web regexes are ported with `NSRegularExpression` using the same pattern text (ICU ≈ JS).
Case-insensitive flags map to `.caseInsensitive`. `\p{L}` is supported. Port each regex literally; add a test
for each regex-driven function from the web tests.

0.9 Dates on screen (all fixed `en_US_POSIX` locale, current time zone), provided by `PaydFormat` (§2.4):
| Web | Swift helper | Example |
|-----|--------------|---------|
| `toLocaleDateString('en-US',{month:'short',day:'numeric'})` | `PaydFormat.shortDate(_:)` → `"MMM d"` | `Nov 14` |
| drawer `{month:'short',day:'numeric',year:'numeric',hour:'2-digit',minute:'2-digit'}` | `PaydFormat.longDateTime(_:)` → `"MMM d, yyyy, hh:mm a"` | `Nov 14, 2026, 09:05 AM` |
| `toLocaleDateString('en-US',{month:'long'})` | `PaydFormat.monthName(_:)` → `"MMMM"` | `November` |
| `toLocaleDateString('en-US',{month:'long',year:'numeric'})` | `PaydFormat.monthYear(_:)` → `"MMMM yyyy"` | `November 2026` |
| `toLocaleDateString('en-AE')` | `PaydFormat.aeDate(_:)` → `"dd/MM/yyyy"` | `14/11/2026` |
| `toLocaleDateString()` (Careem prompt > 24 h) | `PaydFormat.defaultDate(_:)` → `"M/d/yyyy"` | `11/14/2026` |

0.10 Layout: iPhone uses the web's base (mobile, `< sm`) Tailwind classes; ignore `sm:`/`md:`/`lg:` variants.
The `<html>` always has class `dark`, so whenever a class has a `dark:` variant use the dark one.
Hover styles are ignored; `active:scale-95` becomes a press-scale button style (§3.4). Web modals become
sheets (§3.6). Copy text, labels, placeholders, counts, pluralisation and error strings are copied
**verbatim** from the web file (including `·`, `•`, `→`, `&rarr;`→`→`, `&bull;`→`•`, curly quotes and emoji).
Toast/flash durations are the web's (`setTimeout` values).

0.11 Tailwind → points: spacing unit 4pt (`p-5` = 20, `gap-2.5` = 10, `h-16` = 64). Radii: `rounded-md` 6,
`rounded-lg` 8, `rounded-xl` 12, `rounded-2xl` 16, `rounded-full` capsule. Text sizes: `text-[9px]` 9,
`[10px]` 10, `[11px]` 11, `xs` 12, `sm` 14, `base` 16, `lg` 18, `xl` 20, `2xl` 24, `3xl` 30, `4xl` 36.
Opacity suffix `/20` = `.opacity(0.2)`; `white/8` = white 0.08.

---------------------------------------------------------------------------------------------------

## 1. DATA MODEL (CORE; `Sources/PaydCore/Models.swift`, `JSONValue.swift`, `PaydJSON.swift`)

Mirror of `web/src/types/database.ts` and the persisted blob in `web/src/lib/store/PaydContext.tsx:163,219-254`
(localStorage key `payd_state_v3`). One JSON blob must round-trip between the apps.

### 1.1 Coding rules
- `PaydJSON.encoder` / `PaydJSON.decoder`: **default key strategy** (no snake_case conversion; every type has
  explicit `CodingKeys`, because the top-level blob is camelCase while records are snake_case).
  `outputFormatting = [.sortedKeys]`.
- Dates are `Date`. Encode as ISO-8601 UTC with milliseconds, exactly like JS `toISOString()`:
  `yyyy-MM-dd'T'HH:mm:ss.SSS'Z'` (en_US_POSIX, GMT). Decode accepts with or without fractional seconds and with
  any offset. An unparseable date string decodes to `Date(timeIntervalSince1970: 0)` (web treats NaN dates as 0
  in sorting) — CORE provides this via a property wrapper or custom `init(from:)`; it must not throw.
- Optional encoding: the table column "nil →" says whether a `nil` optional is written as JSON `null` or the key
  is omitted. This matters: web code compares with `=== null` (e.g. `updateBudget`, PaydContext.tsx:506).
- Decoding: every optional accepts a missing key **or** `null`. Required keys missing → decode error.
- All model types: `public struct …: Codable, Sendable, Hashable` (+ `Identifiable` where they have `id`),
  `public let` properties, memberwise `public init` with the defaults shown, and `with…(_:)` copy helpers where
  an action needs a modified copy (CORE decides names; e.g. `Transaction.withDeletedAt(_:)`).

### 1.2 Enums (raw values = web strings)
```swift
public enum TransactionType: String, Codable, Sendable, CaseIterable { case expense, income, refund, transfer, adjustment }
public enum GroupRole: String, Codable, Sendable { case admin, member }
public enum SettlementStatus: String, Codable, Sendable { case outstanding, partiallySettled = "partially_settled", settled, disputed }
public enum SplitMethod: String, Codable, Sendable, CaseIterable { case equal, exact, percentage, shares }
public enum RecurringFrequency: String, Codable, Sendable, CaseIterable { case weekly, monthly, yearly }
public enum BudgetPeriod: String, Codable, Sendable { case weekly, monthly, yearly }
public enum AuditAction: String, Codable, Sendable { case insert, update, softDelete = "soft_delete", restore }
public enum AuditRecordType: String, Codable, Sendable { case transaction, settlement, group, split }
```

### 1.3 Records (Swift property → JSON key, type, nil handling)

`User`: `id`→`id` String · `name` String · `email` String · `defaultCurrency`→`default_currency` String ·
`avatarUrl`→`avatar_url` String? (nil → null) · `createdAt`→`created_at` Date.

`Group`: `id` · `name` · `description` String? (nil → null) · `imageUrl`→`image_url` String? (nil → omit) ·
`currency` String · `creatorId`→`creator_id` · `createdAt`→`created_at`.

`GroupMember`: `groupId`→`group_id` · `userId`→`user_id` · `role` GroupRole · `joinedAt`→`joined_at` Date.

`GroupInvite` (type only, unused by UI): `id`, `group_id`, `token`, `created_by`, `expires_at`, `created_at`.

`Category`: `id` · `name` · `icon` String (**Lucide icon name exactly as web**, e.g. `UtensilsCrossed`; the app maps
it to an SF Symbol, §3.5) · `userId`→`user_id` String? (nil → omit) · `createdAt`→`created_at` Date.

`Transaction`: `id` · `type` TransactionType · `title` · `amountMinor`→`amount_minor` Int · `currency` ·
`categoryId`→`category_id` String? (null) · `payerId`→`payer_id` · `groupId`→`group_id` String? (null) ·
`paymentMethod`→`payment_method` String? (nil → omit) · `notes` String? (null) · `occurredAt`→`occurred_at` Date ·
`deletedAt`→`deleted_at` Date? (**nil → omit**; web restore sets `undefined`) · `createdBy`→`created_by` ·
`createdAt`→`created_at`. Computed `isDeleted`.

`TransactionSplit`: `id` · `transactionId`→`transaction_id` · `userId`→`user_id` · `shareMinor`→`share_minor` Int ·
`createdAt`→`created_at`.

`Settlement`: `id` · `groupId`→`group_id` String? (null) · `senderId`→`sender_id` · `recipientId`→`recipient_id` ·
`amountMinor`→`amount_minor` · `currency` · `method` String · `reference` String? (null) · `status` SettlementStatus ·
`settledAt`→`settled_at` Date · `createdAt`→`created_at`.

`Budget`: `id` · `userId`→`user_id` · `categoryId`→`category_id` String? (null) · `limitMinor`→`limit_minor` ·
`period` BudgetPeriod · `createdAt`→`created_at` Date.

`ShareAllocation` (used in RecurringBill.splits and action inputs): `userId`→`user_id` · `shareMinor`→`share_minor`.

`RecurringBill`: `id` · `title` · `amountMinor`→`amount_minor` · `currency` · `categoryId`→`category_id` (null) ·
`payerId`→`payer_id` · `groupId`→`group_id` (null) · `frequency` · `dueDay`→`due_day` Int · `notes` (null) ·
`autoPost`→`auto_post` Bool · `lastPostedAt`→`last_posted_at` Date? (null) · `splits` [ShareAllocation] ·
`createdAt`→`created_at`.

`AuditLog`: `id` · `actorId`→`actor_id` String? (null) · `action` AuditAction · `recordType`→`record_type` ·
`recordId`→`record_id` · `before` JSONValue? (null) · `after` JSONValue? (null) · `createdAt`→`created_at`.

`Notification` is not persisted by the web; do not add it.

`JSONValue` (`JSONValue.swift`): `public enum JSONValue: Codable, Sendable, Hashable { case null, bool(Bool),
number(Decimal) /* integers stay exact */, string(String), array([JSONValue]), object(OrderedMap<String, JSONValue>) }`
with `init(encoding value: some Encodable) throws` (encode with PaydJSON, decode as JSONValue) and lookup helpers
`subscript(key: String) -> JSONValue?`, `subscript(index: Int) -> JSONValue?`, `stringValue`, `intValue`, `boolValue`.
Used for audit `before/after`, Careem `raw`, the MCP response, and the query `dataContext`.

### 1.4 Persisted state `LedgerState` (top-level keys are camelCase, exactly web)
```swift
public struct LedgerState: Codable, Sendable, Hashable {
    public let users: [User]                 // "users"
    public let currentUserId: String         // "currentUserId"
    public let categories: [Category]        // "categories"
    public let groups: [Group]               // "groups"
    public let groupMembers: [GroupMember]   // "groupMembers"
    public let transactions: [Transaction]   // "transactions"
    public let splits: [TransactionSplit]    // "splits"
    public let settlements: [Settlement]     // "settlements"
    public let budgets: [Budget]             // "budgets"
    public let auditLogs: [AuditLog]         // "auditLogs"
    public let recurringBills: [RecurringBill] // "recurringBills"
}
```
Decoding mirrors `PaydContext.tsx:195-212`: each key is optional in the blob; a missing key falls back to the
seed value for that key (`SeedData.make(now:)`), `auditLogs` to `[]`. `currentUserId` missing → seed Manan.
Provide `LedgerState.decodeWebBlob(_ data: Data, now: Date) throws -> LedgerState` that does this.
`currentUser` resolution (web keeps a separate object; PaydContext.tsx:199-202): `users.first(id == currentUserId)
?? users.first ?? SeedData.users(now)[0]` — exposed as `LedgerQueries.currentUser(in:)`.

Non-ledger settings (not in the blob; app `UserDefaults`, owned by SHELL `AppSettings`):
`payd_ai_enabled` (Bool, default true; web PaydContext.tsx:186,263-270), `payd_server_base_url` (String, default "").
The web theme toggle (`payd_theme`) has no UI on the web and the app is dark-only: not ported.

### 1.5 Seed data `SeedData.make(now: Date) -> LedgerState` (port of `web/src/lib/store/initialData.ts` exactly)
- All IDs, names, emails, amounts, notes, payment methods, roles and orders exactly as the web file.
  Users (in order): Manan Arora `1111…`, Prakarsh Thakur `2222…`, Veer Nanwani `3333…`, Aisha Rahman `4444…`,
  Omar Haddad `5555…`, Zara Kapoor `6666…`; emails `<first>@payd.app` lowercase; `default_currency` AED.
- Timestamps: `now − N·86400 s` / `now − N·3600 s` exactly as `Date.now() - N * 86400000` in the web; every
  `new Date().toISOString()` in the web is `now`. (Users 30/28/25/20/18/12 days; groups 25/10 days; txns 2d, 1d,
  4h, 3d, 6d, 9d; settlements 2d and 36h; recurring last_posted 25d/20d/null, created 60/60/40 days.)
- `avatar_url` = the web `initialsAvatar(name)` string byte-for-byte: initials = first char of each space-separated
  word, joined, first 2, uppercased; SVG text
  `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><rect width="120" height="120" fill="#bbf7d0"/><text x="50%" y="50%" dy=".35em" text-anchor="middle" font-family="DM Sans, sans-serif" font-size="48" font-weight="600" fill="#14532d">MA</text></svg>`
  then `"data:image/svg+xml;utf8," + encodeURIComponent(svg)` where encodeURIComponent leaves
  `A-Z a-z 0-9 - _ . ! ~ * ' ( )` unescaped and percent-encodes every other UTF-8 byte (uppercase hex).
  Provide `SeedData.initialsAvatar(_ name: String) -> String` (public; the app renders it as a native initials disc).
- Categories (12, in order, with Lucide icons): Food and dining/UtensilsCrossed, Groceries/ShoppingCart,
  Transportation/Car, Shopping/ShoppingBag, Entertainment/Film, Rent and accommodation/Home, Utilities and bills/Zap,
  Healthcare/HeartPulse, Education/GraduationCap, Travel/Plane, Subscriptions/Repeat, Other/MoreHorizontal; ids
  `c0000001-0000-0000-0000-000000000001` … `c0000012-…-000000000012`.
- Groups, members (8 rows in web order), 6 transactions, 16 splits (`sp1`…`sp16`), 2 settlements, 3 recurring
  bills, 2 budgets: exactly as `initialData.ts:76-334`. `auditLogs: []`. `currentUserId` = Manan.
- Replace `SeedIDs` with: `manan, prakarsh, veer, aisha, omar, zara, flatmates, hattaTrip` and the 12 category ids
  (`food, groceries, transportation, shopping, entertainment, rent, utilities, healthcare, education, travel,
  subscriptions, other`).
- Acceptance: seed net balance for Manan = +150000; owedToMe − iOwe = 150000; group-suggested Prakarsh→Manan
  24000 in Dubai Flatmates is a valid settlement (web balances.test.ts:201-224).

---------------------------------------------------------------------------------------------------

## 2. ENGINE (CORE agent, `ios/PaydCore`)

Port 1:1. Swift names below are binding (features call them). Where the web throws `LedgerInvariantError`,
Swift throws `LedgerInvariantError` (typed throws allowed in core). Functions that "never throw" on the web return
results.

### 2.1 Foundations (`Foundation+Payd.swift`, `OrderedMap.swift`)
```swift
public struct OrderedMap<Key: Hashable & Sendable, Value: Sendable>: Sendable, Sequence {
    public init(); public init(_ pairs: [(Key, Value)])        // later duplicates overwrite value, keep first position
    public var keys: [Key] { get }; public var values: [Value] { get }; public var count: Int { get }; public var isEmpty: Bool { get }
    public subscript(key: Key) -> Value? { get }
    public func setting(_ key: Key, _ value: Value) -> OrderedMap  // append if new, replace in place if present
    public func removing(_ key: Key) -> OrderedMap
    public func mapValues<T>(_ f: (Value) -> T) -> OrderedMap<Key, T>
    // Sequence element: (key: Key, value: Value), in insertion order
}
extension OrderedMap: Equatable where Value: Equatable {}; extension OrderedMap: Hashable where Value: Hashable {}
extension OrderedMap: Codable where Key == String, Value: Codable {}   // JSON object, key order preserved
public typealias Shares = OrderedMap<String, Int>                   // userId -> minor units
public typealias PairwiseDebtMap = OrderedMap<String, OrderedMap<String, Int>> // debtor -> creditor -> amount (>0)

extension Sequence { public func stableSorted(by areInIncreasingOrder: (Element, Element) -> Bool) -> [Element] }
extension Sequence where Element: Hashable { public func uniqued() -> [Element] }   // first-occurrence order
```
`stableSorted` must be stable regardless of stdlib behaviour (sort enumerated, tie-break on offset).
To port a JS comparator `(a,b) => x` use `stableSorted { cmp($0,$1) < 0 }`.

### 2.2 Errors (`LedgerInvariantError.swift`)
```swift
public struct LedgerInvariantError: Error, Sendable, Equatable, CustomStringConvertible {
    public let reason: String                       // plain text, e.g. "Cannot split with zero participants"
    public var message: String { "Ledger Invariant Violation: \(reason)" }   // == web err.message
    public var description: String { message }
    public init(_ reason: String)
}
```
Replaces the old `LedgerError` enum. Reason strings are copied from the web throw sites.

### 2.3 Integer maths (`PaydMath.swift`)
```swift
public enum PaydMath {
    public static func floorDiv(_ a: Int, _ b: Int) -> Int                  // b > 0
    public static func roundedDiv(_ n: Int, _ d: Int) -> Int                // == Math.round(n / d), d > 0: floorDiv(2n + d, 2d)
    public static func roundedPercent(_ n: Int, of d: Int) -> Int           // == Math.round(n / d * 100): floorDiv(200n + d, 2d)
    public static func oneDecimalPercentString(_ n: Int, of d: Int) -> String // == String(Math.round(n/d*1000)/10): "33.3", "50"
    public static func jsNumberString(_ value: Decimal) -> String          // JS Number#toString for finite decimals: "120", "120.5"
}
```

### 2.4 Formatting (`PaydFormat.swift`)
```swift
public enum PaydFormat {
    public static func shortDate(_ d: Date, timeZone: TimeZone = .current) -> String   // see §0.9
    public static func longDateTime(_ d: Date, timeZone: TimeZone = .current) -> String
    public static func monthName(_ d: Date, timeZone: TimeZone = .current) -> String
    public static func monthYear(_ d: Date, timeZone: TimeZone = .current) -> String
    public static func aeDate(_ d: Date, timeZone: TimeZone = .current) -> String
    public static func defaultDate(_ d: Date, timeZone: TimeZone = .current) -> String
    public static func isoDay(_ d: Date) -> String          // new Date().toISOString().split('T')[0] (UTC)
    public static func plural(_ n: Int, _ one: String, _ many: String) -> String       // "3 members" (HomeView.tsx:20)
    public static func initialsNavbar(_ name: String) -> String   // name.split(' ').map(n=>n[0]).join('').slice(0,2) (no uppercasing)
    public static func initialsFirstLast(_ name: String) -> String // NewSplitModal.tsx:40-45 (uppercased)
    public static func firstLetter(_ name: String) -> String       // name.slice(0,1)
    public static func firstName(_ name: String) -> String         // name.split(' ')[0]
    public static func categoryEmojiHome(_ categoryName: String?) -> String      // HomeView.tsx:80-90
    public static func categoryEmojiActivity(_ categoryName: String?) -> String  // TransactionsView.tsx:52-62 (slightly different list!)
    public static func groupEmoji(_ groupName: String) -> String   // lib/icons.tsx:72-83
    public static func titleCaseFirst(_ s: String) -> String       // t.charAt(0).toUpperCase() + t.slice(1)
}
```

### 2.5 Currency (`Currency.swift`, port of `lib/ledger/currency.ts` — replaces the old lax parser)
```swift
public struct CurrencyConfig: Sendable, Hashable { code, symbol, name: String; decimals: Int }
public enum Currency {
    public static let defaultCode = "AED"
    public static let ledgerCode = "AED"                       // LEDGER_CURRENCY in addExpenseLogic/profileForm
    public static let supported: [String: CurrencyConfig]      // same 8 entries as web
    public static let maxMajorAmount = 1_000_000_000_000       // MAX_MAJOR_AMOUNT
    public static func config(for code: String = defaultCode) -> CurrencyConfig
    public static func symbol(for code: String = defaultCode) -> String
    public static func format(_ amountMinor: Int, currency: String = defaultCode) -> String        // formatMinorUnits
    public static func tryParseMajorToMinor(_ text: String, currency: String = defaultCode) -> Result<Int, ParseError>
    public static func parseMajorToMinor(_ text: String, currency: String = defaultCode) -> Int     // 0 on any failure
    public static func minorToMajorString(_ minor: Int) -> String      // (m/100).toFixed(2) with integers: "1234.50", "-5.00"
    public static func minorToMajorPlainString(_ minor: Int) -> String // (m/100).toString(): "5000", "5000.5", "0.05"
    public static func filsToAedString(_ minor: Int) -> String         // careemPayLink.ts:14-18
    public static func normalizeLocaleDecimalInput(_ text: String, decimalSeparator: String) -> String
}
public struct ParseError: Error, Sendable, Equatable { public let message: String }  // the web's exact error text
```
- `format`: `"AED 1,234.50"`, `"-AED 5.00"`, `"$5.00"`; symbol length > 1 → space; never "-0".
- `tryParseMajorToMinor`: exact port of currency.ts:96-176 (sign, code/symbol prefix/suffix case-insensitive,
  exponent/multiple dots/misplaced sign/grouping errors with the exact messages, half-up rounding on the third
  decimal digit, 13-digit length guard, cap `AED 1,000,000,000,000`). Overflow-safe (`Int`, check before
  multiplying). The `number` overload of the web is not needed (UI always passes strings).
- `normalizeLocaleDecimalInput` keeps the old app's locale fix: when the device decimal separator is `","`,
  a single `","` typed as the decimal key becomes `"."`; used only by `PaydAmountField` (§3.4) on keystroke.
- Tests: port `__tests__/currency.test.ts` (all cases except the JS-number-input ones) and the currency parts
  of `ledger.test.ts`.

### 2.6 Splits (`Splits.swift`, port of `lib/ledger/splits.ts`)
Weights (percentages, share counts) are **fixed-point integers scaled by 1_000_000** (`WEIGHT_SCALE`), parsed from
the user's decimal text (max 6 decimals), so no Double ever enters a split.
```swift
public enum Splits {
    public static let weightScale = 1_000_000
    public static let percentageSumToleranceScaled = 150_000      // 0.15 %
    public static func equal(_ totalMinor: Int, among userIds: [String]) throws(LedgerInvariantError) -> Shares
    public static func exact(_ totalMinor: Int, allocations: Shares) throws(LedgerInvariantError) -> Shares
    public static func percentage(_ totalMinor: Int, scaledPercentages: Shares) throws(LedgerInvariantError) -> Shares
    public static func shares(_ totalMinor: Int, scaledWeights: Shares) throws(LedgerInvariantError) -> Shares
    public static func parseScaledWeight(_ text: String) -> Int?   // "33.33" -> 33_330_000; nil if not ^\d+(\.\d*)?$|^\.\d+$ or > 6 decimals
}
```
- `equal`: dedupe, sort ids ascending (JS string sort = UTF-16 code unit order; use `<` on `String` which matches for
  ASCII ids), remainder to the first ids; result keys in sorted order. Errors: "Cannot split with zero participants",
  "Total amount cannot be negative", "Total amount must be a whole number of minor units (got …)".
- `percentage` / `shares`: largest-remainder (Hamilton) allocation with exact integer maths (use
  `Int` products only if they cannot overflow; otherwise use a 128-bit-safe multiply-divide — `multipliedFullWidth`
  + `dividingFullWidth`). Ties by ascending user id. Zero weight → 0. Result keys in ascending id order.
  Percentage-sum check against 100 % ± 0.15 % in the scaled domain; message
  "Percentages sum to <x>%, but must sum to 100%" where `<x>` is the scaled sum printed like a JS number
  (`99.5`, `100.3`). "Total shares cannot be zero", "Total weight cannot be zero", "<label> cannot be negative".
- `exact`: every value ≥ 0, sum must equal total; message
  "Exact split allocations sum to S minor units, but total is T minor units (difference: D)".
- Tests: port `__tests__/splits.test.ts` (property tests with a seeded deterministic RNG and ≥ 2 000 cases each),
  split parts of `ledger.test.ts`, `acceptance.test.ts` criteria 1, 3, 10.

### 2.7 Balances & debts (`Balances.swift`, port of `lib/ledger/balances.ts`)
```swift
public let personalDebtBucket = "__personal__"
public struct PersonalSpend: Sendable, Equatable { totalSpentMinor, totalIncomeMinor: Int; netSavingsMinor: Int { get } }
public struct PairDebtComponent: Sendable, Hashable { groupId: String?; fromUserId, toUserId: String; amountMinor: Int }
public struct SettlementValidationInput: Sendable { senderId, recipientId: String; amountMinor: Int; groupId: String?; allowOverpayment: Bool }
public enum SettlementValidationResult: Sendable, Equatable { case ok(debtMinor: Int); case failure(reason: String, debtMinor: Int)
    public var isOK: Bool; public var debtMinor: Int; public var reason: String? }
public enum Balances {
    public static func isValidSettlementAmount(_ amountMinor: Int, debtMinor: Int, allowOverpayment: Bool = false) -> Bool
    public static func net(transactions: [Transaction], splits: [TransactionSplit], settlements: [Settlement], seeding userIds: [String]? = nil) -> Shares
    public static func groupedBilateral(transactions:splits:settlements:) -> OrderedMap<String, PairwiseDebtMap>
    public static func bilateral(transactions:splits:settlements:) -> PairwiseDebtMap
    public static func summarizeSimplification(transactions:splits:settlements:) -> (beforeTransfers: Int, afterTransfers: Int)
    public static func signedPairDebt(_ debts: PairwiseDebtMap?, from: String, to: String) -> Int
    public static func pairDebtBreakdown(_ grouped: OrderedMap<String, PairwiseDebtMap>, userA: String, userB: String) -> [PairDebtComponent]
    public static func checkSettlement(_ input: SettlementValidationInput, debtMinor: Int,
                                       senderName: String? = nil, recipientName: String? = nil,
                                       format: (Int) -> String = { Currency.format($0) }) -> SettlementValidationResult
    public static func personalSpend(userId: String, transactions: [Transaction], splits: [TransactionSplit]) -> PersonalSpend
}
```
Exact semantics of balances.ts: expense & adjustment debit, refund reverses, income/transfer ignored, settled
settlements only; `directPairwiseDebts`, `netPairs` (pair key de-dupe in first-seen order), group buckets via
`simplifyDebts` with fallback to direct on invariant error, personal bucket direct; insertion orders preserved.
`checkSettlement` messages verbatim (balances.ts:373-401) including the "You"/"don't"/"owe" grammar.
Tests: port `__tests__/balances.test.ts` (random-ledger property test with seeded RNG), the balance parts of
`ledger.test.ts`, `acceptance.test.ts` criteria 4, 5, 9, 11.

### 2.8 Debt simplification (`DebtSimplifier.swift`, port of `lib/ledger/simplification.ts`)
```swift
public struct SimplifiedDebt: Codable, Sendable, Hashable { fromUserId, toUserId: String; amountMinor: Int }
public enum DebtSimplifier {
    public static let exactLimit = 12
    public static func simplify(_ netBalances: Shares) throws(LedgerInvariantError) -> [SimplifiedDebt]
}
```
Exact algorithm: non-finite/unbalanced check ("Balances do not sum to zero (off by N)"), entries in insertion
order skipping zeros, > 12 → greedy, else bitmask DP partition into max zero-sum subsets then greedy per subset
(stable sorts by amount desc; ties keep insertion order). Replaces the old id-tie-break greedy.
Tests: simplification parts of balances.test.ts and ledger.test.ts.

### 2.9 Ledger actions (`LedgerActions.swift`, port of every PaydContext action)
```swift
public struct ActionContext: Sendable {           // injected clock + randomness (pure, testable)
    public let now: Date
    public let randomSuffix: String               // 5 lowercase base36 chars (Math.random().toString(36).substring(2,7))
    public init(now: Date, randomSuffix: String)
    public static func live() -> ActionContext
    public var epochMillis: Int { get }           // Date.now()
}
public struct NewTransaction: Sendable, Hashable {   // AddTransactionInput
    type: TransactionType; title: String; amountMinor: Int; currency: String? = nil; categoryId: String? = nil
    payerId: String; groupId: String? = nil; paymentMethod: String? = nil; notes: String? = nil; occurredAt: Date? = nil
    splits: [ShareAllocation]
}
public struct NewSettlement: Sendable, Hashable {    // RecordSettlementInput
    groupId: String? = nil; senderId, recipientId: String; amountMinor: Int; currency: String? = nil
    method: String; reference: String? = nil; allowOverpayment: Bool = false
}
public struct NewRecurringBill: Sendable, Hashable { // Omit<RecurringBill,'id'|'created_at'>
    title: String; amountMinor: Int; currency: String; categoryId: String?; payerId: String; groupId: String?
    frequency: RecurringFrequency; dueDay: Int; notes: String?; autoPost: Bool; lastPostedAt: Date?; splits: [ShareAllocation]
}
public struct UserProfileUpdate: Sendable, Hashable { name: String? = nil; defaultCurrency: String? = nil }
public struct JoinGroupResult: Sendable, Equatable { success: Bool; group: Group?; error: String?; alreadyMember: Bool; message: String? }

public enum LedgerActions {
    public static func addTransaction(_ input: NewTransaction, to state: LedgerState, context: ActionContext) throws(LedgerInvariantError) -> (LedgerState, Transaction)
    public static func softDeleteTransaction(_ id: String, in state: LedgerState, context: ActionContext) -> LedgerState
    public static func restoreTransaction(_ id: String, in state: LedgerState, context: ActionContext) -> LedgerState
    public static func recordSettlement(_ input: NewSettlement, in state: LedgerState, context: ActionContext) throws(LedgerInvariantError) -> (LedgerState, Settlement)
    public static func createGroup(name: String, description: String, memberIds: [String], currency: String = "AED", in state: LedgerState, context: ActionContext) -> (LedgerState, Group)
    public static func joinGroupByToken(_ input: String, in state: LedgerState, context: ActionContext) -> (LedgerState, JoinGroupResult)
    public static func updateBudget(limitMinor: Int, categoryId: String?, in state: LedgerState, context: ActionContext) -> LedgerState
    public static func updateUserProfile(_ update: UserProfileUpdate, in state: LedgerState) -> LedgerState
    public static func switchUser(to userId: String, in state: LedgerState) -> LedgerState
    public static func resetToDemoData(context: ActionContext) -> LedgerState
    public static func addRecurringBill(_ bill: NewRecurringBill, to state: LedgerState, context: ActionContext) -> (LedgerState, RecurringBill)
    public static func deleteRecurringBill(_ id: String, in state: LedgerState) -> LedgerState
    public static func triggerRecurringBillSplit(_ id: String, in state: LedgerState, context: ActionContext) throws(LedgerInvariantError) -> (LedgerState, Transaction)
}
```
Exact web semantics (PaydContext.tsx line refs):
- addTransaction (294-347): only check is split sum == amount, message
  "Split sum (S) does not equal transaction amount (T)". id `t-<ms>-<suffix>`; currency forced "AED";
  `category_id`, `group_id`, `notes`: empty string → nil; `payment_method` empty/nil → "Card"; `occurred_at` default
  now; `created_by` = currentUserId; splits ids `sp-<txnId>-<idx>`; prepend txn, append splits; prepend audit
  `al-<ms>` insert with `after = {"transaction": txn, "splits": [splits]}`.
- softDelete (349-370) / restore (372-393): no-op when missing or already in that state; audit entries with
  `before`/`after` = the transaction objects (restore's `after` has no `deleted_at` key).
- recordSettlement (395-435): `LedgerQueries.validateSettlement` first, throw its reason; id `s-<ms>-<suffix>`;
  currency AED; method empty → "Cash"; reference empty → nil; status settled; settled_at = created_at = now; prepend;
  audit insert with `after` = settlement.
- createGroup (437-463): id `g-<ms>`; currency always "AED"; creator = currentUserId; members =
  `[currentUserId] + memberIds` uniqued, creator admin, others member; prepend group, append members. No audit.
- joinGroupByToken (465-499) using `GroupLogic.extractJoinToken` (the PaydContext variant, 80-91): empty →
  error "Paste an invite link or code first."; match by group id, `dubai-marina-2026` (lowercased) → first group whose
  name contains "Flatmates", `hatta-camp-2026` → "Hatta"; none → "That invite link is invalid or has expired.";
  already member → success, alreadyMember, "You're already a member of <name>."; else append member (role member)
  → "Joined <name>!".
- updateBudget (501-525): match `user_id == currentUserId && category_id == categoryId` (nil == nil), replace
  `limit_minor` in place, else append `b-<ms>` monthly.
- updateUserProfile (527-532): apply non-nil fields to the current user in `users`.
- switchUser: set `currentUserId` if the user exists.
- addRecurringBill (535-543): id `rec-<ms>`, created_at now, prepend. deleteRecurringBill: filter.
- triggerRecurringBillSplit (549-575): missing → "Recurring bill template not found"; title
  "<title> (Monthly Split)" / "(Weekly Split)" / "(Annual Split)"; payment "Auto-Debit / Card"; notes =
  bill.notes (non-empty) else "Recurring subscription automatically triggered on <PaydFormat.aeDate(now)>";
  goes through addTransaction (same sum check); then `last_posted_at = now` on the bill.
- Tests: port `__tests__/recurring.test.ts` (Feature 1/6/4 parts), plus new action tests: ids/format, audit entries,
  restore omits `deleted_at`, budget upsert, join-token cases, JSON round-trip of a web-produced blob fixture
  (CORE writes a fixture in `Tests/PaydCoreTests/Fixtures/payd_state_v3.json` shaped like the web blob, decode →
  encode → decode equal).

### 2.10 Queries & derived values (`LedgerQueries.swift`, PaydContext.tsx:577-777)
```swift
public struct UserReimbursementVelocity: Sendable, Hashable {
    userId, name: String; avatarUrl: String?; avgLagDays: Double?; avgLagLabel: String   // "3.5 days" | "n/a"
    totalSettlementsCount: Int; tier: Tier; currentOwedMinor: Int
    public enum Tier: String, Sendable { case speedy, average, lagging, unknown }
}
public struct CashFlowExposureMetrics: Sendable, Hashable {
    totalFrontedMinor, totalRecoveredMinor, outstandingExposureMinor, personalConsumptionMinor: Int
    topLaggingUser: UserReimbursementVelocity?
}
public struct LedgerSnapshot: Sendable {             // everything PaydContext memoises
    public let currentUser: User
    public let netBalances: Shares
    public let userNetBalance: Int
    public let groupedBilateralDebts: OrderedMap<String, PairwiseDebtMap>
    public let bilateralDebts: PairwiseDebtMap
    public let userOwedToMe: Int
    public let userIOwe: Int
    public let userSpending: PersonalSpend
    public let visibleGroups: [Group]
    public let reimbursementVelocities: [UserReimbursementVelocity]
    public let cashFlowExposure: CashFlowExposureMetrics
    public let simplification: (beforeTransfers: Int, afterTransfers: Int)   // summarizeDebtSimplification
}
public enum LedgerQueries {
    public static func snapshot(of state: LedgerState, now: Date) -> LedgerSnapshot
    public static func currentUser(in state: LedgerState) -> User
    public static func user(_ id: String, in state: LedgerState) -> User?
    public static func category(_ id: String?, in state: LedgerState) -> Category?
    public static func group(_ id: String?, in state: LedgerState) -> Group?
    public static func groupMembers(_ groupId: String, in state: LedgerState) -> [User]          // users order
    public static func groupBalances(_ groupId: String, in state: LedgerState) -> Shares           // getGroupBalances
    public static func groupSimplifiedDebts(_ groupId: String, snapshot: LedgerSnapshot) -> [SimplifiedDebt] // sorted desc, stable
    public static func pairwiseDebt(from: String, to: String, groupId: String?, snapshot: LedgerSnapshot) -> Int
    public static func pairDebtBreakdown(_ a: String, _ b: String, snapshot: LedgerSnapshot) -> [PairDebtComponent]
    public static func validateSettlement(_ input: SettlementValidationInput, in state: LedgerState, snapshot: LedgerSnapshot) -> SettlementValidationResult
    public static func splits(for transactionId: String, in state: LedgerState) -> [TransactionSplit]
    public static func monthlyBudget(for userId: String, in state: LedgerState) -> Budget?   // budgets.find(user && !category_id)
}
```
- `validateSettlement` (617-641): name rules ("You"/"you"/"Someone"), group missing → "That group doesn't exist any
  more.", membership → "Both people need to be members of <name> to settle in it.", "Choose who is paying.",
  "Choose who is being paid.", then `Balances.checkSettlement` with `Currency.format`.
- `userOwedToMe`/`userIOwe` (595-606), `visibleGroups` (643-646), `userSpending`, velocities (655-712: only real
  history, most recent fronted expense ≤ repayment, `Math.round(avg*10)/10`, open-debt fallback from oldest fronted
  expense to `now`, tiers ≤2.5 / ≤7 / >7 / unknown, label `"<jsNumber> days"`), exposure (715-750, lagging sort by
  `avg_lag_days ?? -1` desc, stable).
- Tests: queries on the seed (owed/owe, velocities: Veer and Prakarsh settled after fronted expenses), exposure
  numbers, visibleGroups after `switchUser`.

### 2.11 Spend maths (`SpendMath.swift`, port of `components/analytics/spendMath.ts`)
```swift
public enum SpendMath {
    public static func myExpenseShareMinor(_ t: Transaction, userId: String, splits: [TransactionSplit]) -> Int
    public static func isParticipant(_ t: Transaction, userId: String, splits: [TransactionSplit]) -> Bool
    public static func sortedByDateDesc(_ items: [Transaction]) -> [Transaction]       // occurred_at then created_at, stable
    public static func groupSpendMinor(_ groupId: String, transactions: [Transaction]) -> Int
    public static func isCareemExpense(_ t: Transaction) -> Bool
    public static func isSameMonth(_ date: Date, _ now: Date, calendar: Calendar = .current) -> Bool
    public static func monthlyCategoryShares(userId: String, transactions: [Transaction], splits: [TransactionSplit], now: Date) -> (totals: [(id: String, totalMinor: Int)], totalMinor: Int)  // key "other" for nil
    public static func volumeByType(_ transactions: [Transaction]) -> (expenseMinor: Int, incomeMinor: Int)
}
```
Tests: port `spendMath.test.ts`.

### 2.12 Recurring periods (`RecurringPeriod.swift`, port of `components/recurring/recurringPeriod.ts`)
`weekdayNames`, `periodKey(_ date: Date, _ f: RecurringFrequency, calendar: Calendar = .current) -> String`
(ISO week local time `YYYY-Www`, `YYYY`, `YYYY-MM`), `isPostedInCurrentPeriod(_ bill: RecurringBill, now: Date) -> Bool`,
`describePeriod(_ date:, _ f:) -> String` ("week 46 of 2026", "2026", "November 2026"),
`dueDayRange(_ f:) -> ClosedRange<Int>`, `clampDueDay(_ day: Int, _ f:) -> Int`, `formatDueDay(_ day: Int, _ f:) -> String`
("Every Monday", "Due on the 1st", "Yearly on the 15th"). Tests: recurring.test.ts "per-period guard" block.

### 2.13 Group logic (`GroupLogic.swift`, port of `components/groups/groupLogic.ts` + PaydContext.extractJoinToken)
```swift
public enum GroupLogic {
    public static func extractInviteToken(_ input: String) -> String      // groupLogic.ts:18-34
    public static func extractJoinToken(_ input: String) -> String        // PaydContext.tsx:81-91 (used by joinGroupByToken)
    public static func resolveInviteGroup(_ token: String, groups: [Group]) -> Group?
    public static func filterGroupsForUser(_ groups: [Group], members: [GroupMember], userId: String) -> [Group]
    public static func sumBalances(_ balances: Shares) -> Int
    public static func parseAmountInput(_ input: String) -> Result<Int, ParseError>   // groupLogic variant, messages verbatim
    public static let rouletteFilsPerExtraSlice = 2500
    public static let rouletteMaxExtraSlices = 10
    public enum RouletteMode: String, Sendable { case debtWeighted = "debt_weighted", equal }
    public static func rouletteWeights(userIds: [String], groupBalances: Shares, mode: RouletteMode) -> [(userId: String, weight: Int)]
    public static func pickWeightedIndex(_ weights: [Int], rand01: Double) -> Int
}
```
Tests: port `groupLogic.test.ts`.

### 2.14 Add-expense logic (`AddExpenseLogic.swift`, port of `components/modals/addExpenseLogic.ts` + AddExpenseModal helpers)
```swift
public struct FormItem: Sendable, Hashable, Identifiable { id, name, amountText: String; assignedUserIds: [String] }  // empty = shared
public struct AddExpensePrefill: Sendable, Hashable {      // AddExpenseModal.tsx:28-36
    title: String; amountMinor: Int; notes: String?; categoryName: String?; items: [PrefillItem]; paymentMethod: String?
    public struct PrefillItem: Sendable, Hashable { name: String; amountMinor: Int }
}
public enum ExpenseSplitMethod: String, Sendable { case equal, exact, itemized }
public struct SplitInput: Sendable { type: TransactionType /* .expense | .income */; totalMinor: Int; payerId: String
    splitMethod: ExpenseSplitMethod; participantIds: [String]; exactAmounts: [String: String]; items: [FormItem]; nameOf: @Sendable (String) -> String }
public enum AddExpenseLogic {
    public static func parseAmountInput(_ input: String, label: String = "amount") -> Result<Int, ParseError>
    public static func previewMinor(_ input: String) -> Int
    public static func friendlyError(_ message: String) -> String          // takes LedgerInvariantError.message or any text
    public static func itemsSubtotalMinor(_ items: [FormItem]) -> Int
    public static func pruneClaims(_ items: [FormItem], participantIds: [String]) -> (items: [FormItem], orphaned: [String])
    public static func computeSplits(_ input: SplitInput) -> Result<[ShareAllocation], ParseError>
    public static func findCategoryId(_ categories: [Category], hint: String?) -> String?   // AddExpenseModal.tsx:39-61
    public static func isMoneyKeystroke(_ text: String) -> Bool            // ^[0-9.,]*$
    public static func isNumberKeystroke(_ text: String) -> Bool           // ^[0-9.]*$ (NewSplitModal)
}
```
Tests: port `addExpenseLogic.test.ts`.

### 2.15 New-split logic (`NewSplitLogic.swift`, port of `components/modals/newSplitLogic.ts`)
```swift
public struct NewSplitDraft: Sendable, Hashable {
    title, amountInput, payerId: String; groupId: String?; participantIds: [String]; method: SplitMethod
    values: [String: String]; notes: String?; categoryId: String?
}
public enum Remaining: Sendable, Equatable { case amount(minor: Int); case percent(scaled: Int) }  // scaled 1e6
public enum NewSplitLogic {
    public static func build(_ draft: NewSplitDraft, nameOf: ((String) -> String)? = nil) -> Result<NewTransaction, ParseError>
    public static func preview(_ draft: NewSplitDraft) -> Shares                  // {} when not computable
    public static func remaining(_ draft: NewSplitDraft) -> Remaining?
    public static func formatRemaining(_ r: Remaining) -> String                  // NewSplitModal.tsx:204-209
}
```
Weights use `Splits.parseScaledWeight`; percentage tolerance compare in the scaled domain (the web compares in 1e6
too); messages verbatim (e.g. "Percentages add up to 99.5%, but they need to add up to 100%."). `build` returns a
`NewTransaction` (type expense, currency AED, paymentMethod nil so the action defaults to "Card", notes trimmed or nil).
`formatRemaining` percent text = `Number(abs.toFixed(2))` → round half-up to 2 decimals in the scaled domain and
print like a JS number + "%"; zero → "All of the amount is assigned" / "Adds up to 100%"; positive "… left to
assign", negative "… over". Tests: port `newSplitLogic.test.ts`.

### 2.16 Receipt maths & OCR text parser
`ReceiptModels.swift` (port of `lib/ai/receipt-scan.ts` types + Zod defaults):
```swift
public struct ReceiptItem: Codable, Sendable, Hashable { name: String; quantity: Int /* default 1 */; priceMinor: Int /* "price_minor" */ }
public struct ReceiptScanResult: Codable, Sendable, Hashable {
    merchantName: String = "UAE Merchant"; date: String? = nil; currency: String = "AED"; trn: String? = nil
    subtotalMinor: Int = 0; vatMinor: Int = 0; totalMinor: Int; category: String = "Food and dining"
    lineItems: [ReceiptItem] = []; chargesMinor: Int?; confidence: Double = 0.95; warnings: [String]?
    notes: String? = nil; engine: String = "local_ocr"
}   // snake_case keys; lenient decode applying these defaults; totalMinor required
public enum ReceiptSamples { public static func all(now: Date) -> [String: ReceiptScanResult] } // lulu, al_safadi, carrefour, zaatar (tests only)
public enum ItemizedShares {
    public static func calculate(totalMinor: Int, lineItems: [ReceiptItem], assignments: [Int: [String]], participantIds: [String]) throws(LedgerInvariantError) -> Shares
}
```
`ItemizedShares.calculate` is an exact port of receipt-scan.ts:123-196 (replacing the old version): per-item remainder
to the first users **in the assignment's own order**, floor scaling, leftover to participants stable-sorted by subtotal
desc (ties keep participant order), result keys in `participantIds` order; "Cannot split receipt without participants".

`ReceiptTextParser.swift` (port of the pure part of `lib/ai/receipt-server.ts:26-423`):
```swift
public struct ReceiptScanError: Error, Sendable, Equatable { message: String; status: Int; code: String }
public enum ReceiptRowKind: String, Sendable { case item, subtotal, vat, total, charge, discount, payment }
public enum ReceiptTextParser {
    public static let unreadableMessage = "We couldn't read a receipt in this image. Try a sharper, well-lit photo, or enter the bill manually."
    public static func classifyLabel(_ label: String) -> ReceiptRowKind
    public static func extractDate(_ lines: [String], now: Date) -> String?
    public static func extractTrn(_ lines: [String]) -> String?
    public static func assess(_ r: ReceiptScanResult, baseConfidence: Double, extraWarnings: [String] = []) -> (confidence: Double, warnings: [String])
    public static func parseRawLines(_ rawLines: [String], now: Date) throws(ReceiptScanError) -> ReceiptScanResult
}
```
Same regexes, column pairing, metadata skipping, total priority, VAT inference, merchant line (first 6 lines),
category heuristic, notes `"Scanned on-device with Apple Vision OCR. Check the items before saving."` (+ inferred-total
note), `engine: "local_ocr"`, confidence clamp `[0.05, 0.97]` rounded to 2 dp.
Tests: port `__tests__/receipt.test.ts` blocks "Functionality 2" and "Payd Lens local OCR parser"
(not "upload validation"/"route").

### 2.17 Careem Pay (`CareemPay.swift`, port of `components/modals/careemPaySettle.ts` + `lib/mcp/careemPayLink.ts`)
```swift
public struct CareemPayReceipt: Codable, Sendable, Hashable { success: Bool; status, transactionRef /* transaction_ref */: String
    amountMinor /* amount_minor */: Int; careemPayDeeplink /* careem_pay_deeplink */: String; simulated: Bool }
public enum CareemPayOutcome: Sendable, Equatable { case invalid(message: String); case chargeFailed(message: String)
    case recorded(receipt: CareemPayReceipt); case chargedNotRecorded(receipt: CareemPayReceipt, message: String) }
public enum CareemPayFailure: Error, Sendable { case amountMismatch(CareemPayReceipt); case declined(String); case transport(String) }
public enum CareemPay {
    public static func tag(for name: String?) -> String                      // "@rahulmehta.careem"
    public static func payLink(tag: String, amountMinor: Int) -> String      // https://careem.me/pay?tag=…&amount=…&currency=AED
    public static func deeplink(tag: String?, phone: String?, amountMinor: Int) -> String
    public static func parseMCPResponse(httpOK: Bool, httpStatus: Int, body: JSONValue?, requestedMinor: Int) throws(CareemPayFailure) -> CareemPayReceipt
    public static func friendlyError(_ failure: CareemPayFailure) -> String  // maps "transport" to the "couldn't reach" text
    public static func friendlyRecordWarning(_ receipt: CareemPayReceipt) -> String
    public static func run(validate: () -> SettlementValidationResult,
                           charge: () async throws(CareemPayFailure) -> CareemPayReceipt,
                           record: (CareemPayReceipt) throws -> Void,
                           priorReceipt: CareemPayReceipt?) async -> CareemPayOutcome
    public static func mcpRequestBody(recipientTag: String, recipientName: String?, amountMinor: Int, note: String, id: Int) -> JSONValue  // CareemPayModal.tsx:34-52
}
```
`encodeURIComponent` semantics as in §1.5. Tests: port `careemPaySettle.test.ts` (with fake async closures).

### 2.18 Careem events (`CareemEvents.swift`, client side of `lib/careem/useCareemEvents.ts` + page.tsx:63-88 + CareemSplitPrompt helpers)
```swift
public enum CareemService: String, Codable, Sendable { case food, groceries, ride, box }
public struct CareemEventItem: Codable, Sendable, Hashable { name: String; quantity: Int /* default 1 */; amountMinor: Int }
public struct CareemEvent: Codable, Sendable, Hashable, Identifiable {
    id: String; type: String; service: CareemService; sourceTool: String = "unknown"; occurredAt: String = ""
    title: String = ""; merchant: String?; amountMinor: Int; currency: String = "AED"; reference: String?
    items: [CareemEventItem] = []; status: String
}   // snake_case keys, lenient defaults (events.ts:9-28)
public enum CareemEvents {
    public static let pollIntervalSeconds: Double = 2
    public static func decodePending(_ body: JSONValue) -> [CareemEvent]   // {events:[…]}, skip invalid items, keep status=="pending"
    public static func sortNewestFirst(_ events: [CareemEvent]) -> [CareemEvent]   // stable, unparseable = 0
    public static func current(_ events: [CareemEvent]) -> CareemEvent?            // last element (oldest)
    public static func serviceLabel(_ s: CareemService) -> String                  // "Careem Ride" / Food / Quik / Box
    public static func relativeTime(_ iso: String, now: Date) -> String            // CareemSplitPrompt.tsx:15-25
    public static func itemCount(_ e: CareemEvent) -> Int
    public static func subtitle(_ e: CareemEvent) -> String                        // "merchant · Ref X"
    public static func prefill(for e: CareemEvent) -> AddExpensePrefill            // page.tsx:63-88 exactly
}
```
Tests: lenient-decode cases from `lib/careem/__tests__/events.test.ts` "CareemEventSchema" block (as client
decode), plus sort/current/prefill/relativeTime tests.

### 2.19 Voice intents & deterministic Q&A (`VoiceIntent.swift`, port of the pure part of `lib/ai/gemini.ts:1-479`)
This is what the server itself returns when AI is off; the app uses it as the on-device fallback (§3.8).
```swift
public enum VoiceIntentKind: String, Codable, Sendable { case addExpense = "add_expense", addIncome = "add_income", splitExpense = "split_expense", recordRepayment = "record_repayment", query }
public struct VoiceIntent: Codable, Sendable, Hashable {
    intent: VoiceIntentKind; amount: Decimal?  // major units, exact; JSON number
    currency: String?; category: String?; payer: String?; participants: [String]; splitMethod: SplitMethod? /* split_method */
    groupName: String? /* group_name */; notes: String?; confidence: Double; missingFields: [String] /* missing_fields */
    clarificationQuestion: String? /* clarification_question */
    public var amountMinor: Int? { get }   // exact Decimal → fils, half away from zero
}
public struct InterpretContext: Codable, Sendable, Hashable {   // keys camelCase: currentUser{id,name,currency}, knownMembers[{id,name}], groups[{id,name}], categories[String]
    public static func from(state: LedgerState) -> InterpretContext      // FloatingMicrophone.tsx:168-177
}
public struct QueryPerson: Codable, Sendable, Hashable { name: String; netMinor: Int }
public struct QueryCategory: Codable, Sendable, Hashable { name: String; spentMinor: Int }
public struct QueryDataContext: Codable, Sendable, Hashable {  // camelCase keys exactly FloatingMicrophone.tsx:261-286
    currency, …, people: [QueryPerson], topCategories: [QueryCategory], formattedNet…formattedRemaining: String, type: String
    public static func from(query: String, state: LedgerState, snapshot: LedgerSnapshot) -> QueryDataContext   // incl. queryInsights (222-253)
}
public enum VoiceRules {
    public static let maxTextLength = 2000
    public static let maxNotesLength = 140
    public static func parseNumberWords(_ text: String) -> Int?
    public static func extractAmount(_ text: String) -> Decimal?
    public static func detectCurrency(_ text: String, default: String) -> String
    public static func resolveCategory(_ name: String?, categories: [String]) -> String?
    public static func truncateNotes(_ text: String, max: Int = 140) -> String
    public static func buildShortDescription(_ intent: VoiceIntent, maxLen: Int = 40) -> String
    public static func sanitize(_ intent: VoiceIntent, context: InterpretContext, rawTranscript: String?) -> VoiceIntent
    public static func deterministicParseIntent(_ transcript: String, context: InterpretContext) -> VoiceIntent
    public static func deterministicAnswerQuery(_ query: String, context: QueryDataContext) -> String
    public static func offlineQueryFallback(_ context: QueryDataContext) -> String   // "Your net balance is X. Total spent is Y."
}
```
`toAmount` (`Math.round(n*100)/100`) is done on the decimal text, not Doubles. Keep `VoiceExpenseParser.swift` and its
tests unchanged (it stays available; the app's voice flow uses `VoiceRules`).
Tests: port `lib/ai/ai.test.ts` blocks "deterministic parser" and "deterministic query answers", and
`acceptance.test.ts` criteria 7, 8.

### 2.20 Small pure rules
- `ProfileForm.swift` (port of `components/profile/profileForm.ts`): `ProfileForm.validate(name:budgetText:) -> (nameError: String?, budgetError: String?, budgetMinor: Int)`. Tests: `profileForm.test.ts`.
- `LensMirror.swift`: `LensMirror.shouldMirrorPreview(facingMode: String?, label: String?) -> Bool` (LensCameraViewer.tsx:25-29). Tests: `lensMirror.test.ts`.

### 2.21 Web tests CORE must port to Swift Testing (one Swift file per web file, same `@Test` names)
`lib/ledger/__tests__/{currency,splits,balances,ledger,acceptance,recurring,receipt}.test.ts` (receipt: not the upload/route
blocks), `components/analytics/spendMath.test.ts`, `components/groups/__tests__/groupLogic.test.ts`,
`components/modals/{addExpenseLogic,newSplitLogic,careemPaySettle,lensMirror}.test.ts`,
`components/profile/profileForm.test.ts`, `lib/careem/__tests__/events.test.ts` (CareemEventSchema block as client decode),
`lib/ai/ai.test.ts` (deterministic parser + deterministic query answers blocks).
Not ported (server-only): `mcp.test.ts`, `careemMcp.test.ts`, `webhookAuth.test.ts`, `middleware.test.ts`,
`receipt-claude.test.ts`, Bedrock/route blocks of `ai.test.ts`, upload/route blocks of `receipt.test.ts`.
Existing Swift tests are rewritten to the new APIs; `VoiceExpenseParserTests` stays.

---------------------------------------------------------------------------------------------------

## 3. APP SHELL (SHELL agent)

### 3.1 Package / capabilities (`ios/Payd.swiftpm/Package.swift`)
Keep: name/product `SwiftExpenseTracker`, bundle id `com.payd.SwiftExpenseTracker`, team `8WJHXBCT98`, versions,
`.iOS("17.0")`, tools 5.9, `AppModule` executableTarget at path `"."`, dependency on `../PaydCore`, portrait.
Change:
- `resources: [.process("Resources")]`, `exclude: ["README.md", "Config"]` (no "unhandled file" warnings).
- capabilities: `.camera(purposeString: "Payd Lens uses the camera to scan your receipts.")`,
  `.photoLibrary(purposeString: "Payd Lens reads the receipt photo you choose so you can split the bill.")`,
  keep the existing `.microphone` and `.speechRecognition` strings,
  `.localNetwork(purposeString: "Payd connects to your Payd server on your local network.")`,
  `.appTransportSecurity(configuration: .init(allowsLocalNetworking: true))`.
- `additionalInfoPlistContentFilePath: "Config/AdditionalInfo.plist"` declaring `CFBundleURLTypes` with URL scheme
  `payd` (name `com.payd.SwiftExpenseTracker.invite`).
- Brand images: copy `web/public/brand/payd-logo-96.png` (and `payd-logo-192.png` as @2x) into
  `Resources/Brand/` (read-only copy from web). Fonts stay in `Resources/Fonts` and load from `Bundle.main`.

### 3.2 Theme (`Theme/PaydTheme.swift`, `Theme/PaydFonts.swift`) — current web brand is **green** (tailwind.config.js, globals.css)
`enum PaydTheme` static `Color`s (hex exact):
- brand 50 `#f0fdf4`, 100 `#dcfce7`, 200 `#bbf7d0`, 300 `#86efac`, 400 `#4ade80`, 500 `#22c55e`, 600 `#16a34a`,
  700 `#15803d`, 800 `#166534`, 900 `#14532d`, 950 `#052e16` (`brand50`…`brand950`, `brandPrimary` = 500,
  `brandLight` = 300, `brandDark` = 700, `brandSoft` = 500 @ 0.12).
- brand-deep 300 `#5eead4`, 400 `#2dd4bf`, 500 `#10b981`, 600 `#059669`, 700 `#047857`.
- surfaces: `canvas #09090b`, `card #18181b`, `cardSubtle #27272a`, `border` white 0.08, `foreground #f4f4f5`,
  `textSecondary #a1a1aa`, `textMuted #71717a`, `slate850 #151518`, `slate925 #0f0f12`, plus literal web hexes
  `#202024`, `#202025`, `#202028`, `#22222a`, `#222227`, `#3f3f46`.
- accents (Tailwind defaults used by the web): emerald 400 `#34d399` / 500 `#10b981` / 600 `#059669` / 950 `#022c22`;
  rose 300 `#fda4af` / 400 `#fb7185` / 500 `#f43f5e` / 600 `#e11d48` / 700 `#be123c`; amber 300 `#fcd34d` /
  400 `#fbbf24` / 500 `#f59e0b` / 600 `#d97706`; sky 500 `#0ea5e9` / 700 `#0369a1`; teal 400 `#2dd4bf` /
  500 `#14b8a6` / 600 `#0d9488`; blue 400 `#60a5fa` / 500 `#3b82f6`; lime 300 `#bef264`; red 300 `#fca5a5` /
  500 `#ef4444`; zinc 200 `#e4e4e7`, 300 `#d4d4d8`, 400 `#a1a1aa`, 500 `#71717a`, 600 `#52525b`, 700 `#3f3f46`,
  800 `#27272a`, 950 `#09090b`; slate 200 `#e2e8f0`, 300 `#cbd5e1`, 400 `#94a3b8`, 500 `#64748b`, 700 `#334155`,
  800 `#1e293b`, 900 `#0f172a`; cyan 500 `#06b6d4`, pink 500 `#ec4899`, orange 500 `#f97316`, sky 400 `#38bdf8`,
  yellow 200 `#fef08a`; Careem green `#00ea80`. Name them `emerald400`, `rose500`, `careemGreen`, etc.
- gradients: `brandGradient` 135° `#bef264 0%, #4ade80 35%, #10b981 70%, #0d9488 100%`;
  `brandHero` 135° `#15803d 0%, #047857 45%, #065f46 75%, #064e3b 100%` (as `LinearGradient` with stops,
  `.topLeading → .bottomTrailing`).
Fonts (`PaydFonts`, keep registration code): body PT Sans (`.font-body`; only Regular 400 and Bold 700 exist, so
web 500 → Regular, 600/700 → Bold); heading DM Sans weight **600**, tracking −0.01 em, **not uppercased**
(`.font-heading`, globals.css:101-105); logo Zen Dots, tracking 0.5. API:
`Font.payd(size: CGFloat, bold: Bool = false, italic: Bool = false)`, `Font.paydHeading(size: CGFloat)`,
`Font.paydLogo(size: CGFloat)` — all `relativeTo:` a text style for Dynamic Type. App root: `.preferredColorScheme(.dark)`,
`.tint(PaydTheme.brand400)`, background canvas.

### 3.3 Root layout (`ExpenseTrackerApp.swift`, `Shell/RootView.swift`) — web `app/page.tsx`
- `@main ExpenseTrackerApp` creates `LedgerStore`, `AppSettings`, `AppRouter` (`@State`), registers fonts, injects all
  three with `.environment(_:)`, handles `.onOpenURL` (§3.9).
- `RootView`: canvas background; `Navbar` pinned on top (safe-area inset, 64 pt, `#09090b` @ 0.85 + ultra-thin
  material, bottom hairline white 0.08); tab content inside a vertical `ScrollView` with
  `padding(.horizontal, 16).padding(.top, 16).padding(.bottom, 112)`, max width 1152 centred. **Feature entry views do
  not add their own vertical ScrollView** (they may use `ScrollViewReader` inside, horizontal ScrollViews allowed).
- Tab switch: `.home → HomeView()`, `.groups → GroupsView()`, `.settlements → SettlementsView()`,
  `.transactions → TransactionsView()`, `.profile → ProfileView()`.
- Overlays (in this z-order, bottom to top): `BottomNav` (bottom 16, horizontal 16), `VoiceAssistantOverlay()` (it draws
  the floating keyboard button and the voice cards; full-screen when active), `CareemEventsHost()` (z above voice; it
  hides its prompt when `router.sheet != nil`).
- One `.sheet(item: $router.sheet)` presenting `PaydSheetContent(sheet:)` (§3.6). Global `.ledgerErrorAlert(store)` on
  root and on sheet content.

### 3.4 Shared UI (`UI/*.swift`; every feature may use these, none may redefine them)
```swift
extension View {
    func paydCard(padding: CGFloat = 20, cornerRadius: CGFloat = 16, fill: Color = PaydTheme.card, stroke: Color = PaydTheme.border) -> some View
    func ledgerErrorAlert(_ store: LedgerStore, isEnabled: Bool = true) -> some View   // keep existing behaviour
    func paydToast(_ message: Binding<String?>, duration: Double) -> some View          // top toast, auto-clears
}
struct PressScaleButtonStyle: ButtonStyle { var scale: CGFloat = 0.95 }
struct PaydPrimaryButtonStyle: ButtonStyle { var height: CGFloat = 48 }      // brand400 fill, zinc950 text, PT Sans Bold 14, radius 12
struct PaydSecondaryButtonStyle: ButtonStyle { var height: CGFloat = 48 }    // border white 0.1, zinc300 text
struct PaydTonalButtonStyle: ButtonStyle { let tint: Color; var height: CGFloat = 40 } // tint 0.15 fill, tint text, tint 0.3 border
struct PaydDarkButtonStyle: ButtonStyle { var height: CGFloat = 40 }        // #27272a fill, zinc200 text
struct PaydFilledButtonStyle: ButtonStyle { let fill: Color; let text: Color; var height: CGFloat = 48 } // e.g. emerald600 / white
struct PaydBadge: View { init(_ text: String, tint: Color, bordered: Bool = false, size: CGFloat = 10) } // heading font, capsule, tint 0.2 bg
struct IconTile: View { init(systemName: String, tint: Color, size: CGFloat = 32, iconSize: CGFloat = 16, cornerRadius: CGFloat = 12) } // tint 0.2 bg
struct CardHeader<Trailing: View>: View { init(systemName: String, tint: Color, title: String, badge: String?, subtitle: String?, @ViewBuilder trailing: () -> Trailing) } // analytics/recurring header pattern
struct SectionHeading: View { init(_ title: String, actionTitle: String? = nil, action: (() -> Void)? = nil) } // heading 12 zinc400 + brand400 bold 12 link
struct ScreenTitle: View { init(_ title: String, subtitle: String) }   // heading 20 white tracking-wide + 12 zinc400
struct SheetHeader: View { init(title: String, systemName: String? = nil, tint: Color = PaydTheme.brand400, badge: String? = nil, subtitle: String? = nil, onClose: @escaping () -> Void) }
struct FieldLabel: View { init(_ text: String) }                       // heading 11 zinc400
struct PaydTextField: View { init(_ placeholder: String, text: Binding<String>, isError: Bool = false, prefix: String? = nil, suffix: String? = nil, keyboard: UIKeyboardType = .default) } // #09090b fill, white 0.1 border, brand500 focus border, radius 12
struct PaydAmountField: View { init(_ placeholder: String = "0.00", text: Binding<String>, prefix: String? = "AED", suffix: String? = nil, allowComma: Bool = true, isError: Bool = false) } // decimal pad; rejects keystrokes failing AddExpenseLogic.isMoneyKeystroke (or isNumberKeystroke when allowComma == false); applies Currency.normalizeLocaleDecimalInput
struct PaydMenuPicker<Value: Hashable>: View { init(selection: Binding<Value>, options: [(value: Value, label: String)], isDisabled: Bool = false) } // looks like the web <select>
struct SegmentedPills<Value: Hashable>: View { init(selection: Binding<Value>, options: [(value: Value, label: String)]) } // #27272a container, selected brand600/white
struct PersonChip: View { init(title: String, isSelected: Bool, leading: String? = nil, action: @escaping () -> Void) } // brand600 selected / #27272a unselected pill
struct ErrorBanner: View { init(_ text: String) }                       // rose500 0.1 bg, rose500 0.3 border, rose400 text, radius 12
struct WarningBanner: View { init(_ text: String, onDismiss: (() -> Void)? = nil) } // amber, "OK" button when dismissible
struct SuccessBanner: View { init(_ text: String) }                     // emerald 0.15 bg, emerald400 text, check icon
struct InfoNote: View { init(systemName: String = "checkmark.shield", text: String, tint: Color = PaydTheme.emerald500) }
struct AvatarView: View { init(user: User?, size: CGFloat) }            // §3.5
struct InitialsDisc: View { init(_ text: String, size: CGFloat, fill: Color = PaydTheme.zinc700, fontSize: CGFloat = 11) }
struct MoneyText: View { init(_ minor: Int, currency: String = "AED", prefix: String = "", font: Font, color: Color) }
enum CategoryIcon { static func symbol(forLucide name: String?) -> String }   // §3.5
enum ShareActions {
    @MainActor static func copy(_ text: String)                                // UIPasteboard
    static func whatsAppURL(text: String) -> URL?                             // https://wa.me/?text=<encodeURIComponent>
}
```
Empty-state card, progress bars, wheels etc. are feature-local.

### 3.5 Icons and avatars
Lucide → SF Symbol (`CategoryIcon.symbol`, mirrors `lib/icons.tsx:25-52`; unknown incl. `MoreHorizontal` → `tag`):
UtensilsCrossed `fork.knife`, ShoppingCart `cart`, Car `car`, ShoppingBag `bag`, Film `film`, Home `house`,
Zap `bolt`, HeartPulse `waveform.path.ecg`, GraduationCap `graduationcap`, Plane `airplane`, Repeat `repeat`,
default `tag`. Other Lucide icons used in components map to the nearest SF Symbol (features choose; e.g. HandCoins
`dollarsign.circle`, Split `arrow.triangle.branch`, Camera `camera`, Mic `mic.fill`, Coffee `cup.and.saucer`,
Zap `bolt.fill`, ShieldCheck `checkmark.shield`, X `xmark`, Check `checkmark`, Copy `doc.on.doc`, Share2
`square.and.arrow.up`, ArrowRightLeft `arrow.left.arrow.right`, Users `person.2`, Receipt `receipt`, Activity `waveform.path`,
PieChart `chart.pie`, Calendar `calendar`, Trash2 `trash`, RotateCcw `arrow.counterclockwise`, Plus `plus`).
`AvatarView`: `avatar_url` nil or `data:image/svg+xml…` → mint disc `#bbf7d0` with `#14532d` DM Sans 600 initials
(first letters of words, max 2, uppercased; font 0.4 × size) — visually identical to the web SVG; `http(s)` URL →
`AsyncImage` with the same disc as placeholder/failure. Circle clip. The web's zinc-700 letter discs are `InitialsDisc`.

### 3.6 Navigation, tabs and the sheet router (`Shell/AppRouter.swift`, `Shell/PaydSheet.swift`, `Shell/PaydSheetContent.swift`)
```swift
enum PaydTab: String, Hashable, CaseIterable { case home, groups, settlements, transactions, profile }   // web tab ids
struct AddExpenseRequest: Hashable { var type: TransactionType = .expense; var groupId: String? = nil; var prefill: AddExpensePrefill? = nil }
struct SettlementRequest: Hashable { var senderId: String? = nil; var recipientId: String? = nil; var amountMinor: Int? = nil; var groupId: String? = nil }
struct CareemPayRequest: Hashable { var senderId: String? = nil; var recipientId: String? = nil; var amountMinor: Int = 0; var groupId: String? = nil; var reference: String = "Group settlement" }
enum PaydSheet: Identifiable, Hashable {             // one case per web modal (page.tsx:206-265) + local web modals
    case addExpense(AddExpenseRequest)               // AddExpenseModal
    case newSplit(defaultGroupId: String?)           // NewSplitModal (page always passes nil)
    case recordSettlement(SettlementRequest)         // RecordSettlementModal
    case careemPay(CareemPayRequest)                 // CareemPayModal
    case createGroup                                 // CreateGroupModal
    case transactionDetail(transactionId: String)    // TransactionDetailDrawer
    case receiptScanner                              // ReceiptScannerModal
    case roulette(defaultGroupId: String?)           // FairPayerRouletteModal
    case createRecurringBill(defaultGroupId: String?)// CreateRecurringBillModal (web: local to RecurringBillsSection)
    case joinInvite(token: String)                   // web route /join/[token]
    var id: String { get }                           // stable per case + params
}
@Observable @MainActor final class AppRouter {
    var tab: PaydTab = .home
    private(set) var focusGroupId: String? = nil     // page.tsx:28; GroupsView reads it
    private(set) var focusGroupRequest: Int = 0      // bumps on every openGroup (re-select same id)
    var sheet: PaydSheet? = nil
    private(set) var voiceTriggerCount: Int = 0      // dock mic taps
    func navigate(_ tab: PaydTab)
    func openGroup(_ groupId: String)                // focusGroupId = id; focusGroupRequest += 1; tab = .groups
    func present(_ sheet: PaydSheet)                 // if another sheet is up: dismiss it, then present this one after dismissal
    func dismissSheet()
    func triggerVoice()                              // voiceTriggerCount += 1
}
```
`PaydSheetContent` maps each case to the feature entry type (§4) and applies: `.presentationDetents([.large])`,
`.presentationDragIndicator(.visible)`, `.presentationBackground(PaydTheme.card)`, environment re-injection,
`.ledgerErrorAlert(store)`. Feature sheets close themselves with `router.dismissSheet()` (or `@Environment(\.dismiss)`).

`Navbar` (`Shell/Navbar.swift`, web `components/Navbar.tsx`): left button (→ `.home`, a11y "Payd home"): logo image
32 pt + "payd" Zen Dots 24 white + 8 pt `brandGradient` dot; right: circular 36 pt brand400 "+" (a11y "Add expense") →
`present(.addExpense(.init()))`; capsule `#18181b`, white 0.1 border, camera icon brand400 (label text hidden on
phone) → `present(.receiptScanner)`; profile capsule with 24 pt zinc700 disc of `PaydFormat.initialsNavbar(name)`,
toggles `.profile` ⇄ `.home`, selected state brand500 border + brand500 0.4 ring, a11y "Your profile" /
"Close profile and go home".

`BottomNav` (`Shell/BottomNav.swift`, web `components/BottomNav.tsx`; replaces `PaydDock`): capsule 64 pt,
`#18181b` @ 0.95 + material, white 0.1 border, heavy shadow; items Home (`house`), Groups (`person.2`), centre mic FAB,
"Settle up" (`dollarsign.circle`, always brand400, brand300 when active, rose500 10 pt badge with `#18181b` ring when
`snapshot.userIOwe > 0 || snapshot.userOwedToMe > 0`), Activity (`receipt`). Inactive zinc500, active brand400 bold and
icon scale 1.1; labels 10 pt. FAB: 52 pt brand400 circle, zinc950 `mic.fill`, 4 pt canvas ring, raised 16 pt, green glow
(`#4ade80` 0.55, radius 20) + pulsing brand400 0.4 blurred halo (respect Reduce Motion); tap → `router.triggerVoice()`;
a11y "Speak an expense".

### 3.7 LedgerStore (`Store/LedgerStore.swift`) and AppSettings (`Store/AppSettings.swift`)
```swift
@Observable @MainActor final class LedgerStore {
    private(set) var state: LedgerState
    private(set) var snapshot: LedgerSnapshot          // recomputed (LedgerQueries.snapshot(of:now: Date())) on every state change
    var errorMessage: String?                          // load/save problems → global alert
    var currentUser: User { snapshot.currentUser }
    nonisolated static let defaultFileURL: URL         // Application Support/payd_state_v3.json
    init(fileURL: URL = LedgerStore.defaultFileURL)
    // PaydContext actions. Throwing ones rethrow LedgerInvariantError for the caller to show inline (web behaviour).
    @discardableResult func addTransaction(_ input: NewTransaction) throws -> LedgerTransaction
    func softDeleteTransaction(_ id: String)
    func restoreTransaction(_ id: String)
    @discardableResult func recordSettlement(_ input: NewSettlement) throws -> Settlement
    @discardableResult func createGroup(name: String, description: String, memberIds: [String]) -> LedgerGroup
    func joinGroupByToken(_ input: String) -> JoinGroupResult
    func updateBudget(limitMinor: Int, categoryId: String?)
    func updateUserProfile(_ update: UserProfileUpdate)
    func switchUser(_ userId: String)
    func resetToDemoData()
    @discardableResult func addRecurringBill(_ bill: NewRecurringBill) -> RecurringBill
    func deleteRecurringBill(_ id: String)
    @discardableResult func triggerRecurringBillSplit(_ id: String) throws -> LedgerTransaction
    // Query conveniences (thin wrappers over LedgerQueries with the current state/snapshot):
    func groupMembers(_ groupId: String) -> [User]
    func groupBalances(_ groupId: String) -> Shares
    func groupSimplifiedDebts(_ groupId: String) -> [SimplifiedDebt]
    func pairwiseDebt(from: String, to: String, groupId: String?) -> Int
    func pairDebtBreakdown(_ a: String, _ b: String) -> [PairDebtComponent]
    func validateSettlement(_ input: SettlementValidationInput) -> SettlementValidationResult
    func user(_ id: String) -> User?
}
```
Persistence (keep the existing good fixes): JSON via `PaydJSON.encoder`; file missing → seed; unreadable file
(read error) → seed in memory, file untouched, saving disabled, error shown; corrupt JSON → move to
`payd_state_v3.json.corrupt-<ms>` (never delete), load seed, tell the user; save after every successful action with
`.atomic`; save failure → `errorMessage`. Decode with `LedgerState.decodeWebBlob`. The old `payd_state_v1.json`
is left untouched (different shape; no migration). Every action uses `ActionContext.live()`.

```swift
@Observable @MainActor final class AppSettings {
    var aiEnabled: Bool                 // UserDefaults "payd_ai_enabled", default true; writes through
    private(set) var serverBaseURL: String   // UserDefaults "payd_server_base_url", default "" (offline)
    func setServerBaseURL(_ text: String) -> String?   // returns an error message or nil; trims, strips trailing "/"; "" allowed (offline);
                                                       // must parse as URL with scheme http/https and a host, else "Enter a full address starting with http:// or https://."
    var isOnline: Bool { get }          // !serverBaseURL.isEmpty
    var api: PaydAPI { get }            // client for the current base URL
    func inviteURL(groupId: String) -> String  // "<base>/join/<id>" when a server is set, else "payd://join/<id>"
}
```
The server URL UI lives in `ProfileView` (VOICE-PROFILE, §4.6).

### 3.8 PaydAPI (`Networking/PaydAPI.swift`, `Networking/APIModels.swift`)
Never embed API keys (the web never sends one from the client either). All requests: `Content-Type: application/json`,
`Accept: application/json`, no Origin header, `URLSession` ephemeral config, JSON via `PaydJSON` with explicit keys.
```swift
enum PaydAPIError: Error, Equatable {
    case offline                       // no base URL configured
    case network(String)               // transport failure (unreachable, DNS, TLS, cancelled)
    case timeout
    case http(status: Int, message: String?, code: String?)   // server answered non-2xx; message/code from body when present
    case decoding(String)
    var isUnreachable: Bool { get }    // offline || network || timeout
}
struct PaydAPI: Sendable {
    let baseURL: URL?
    func interpret(_ body: InterpretRequest) async throws(PaydAPIError) -> InterpretResponse     // POST /api/ai/interpret, timeout 20 s
    func query(_ body: QueryRequest) async throws(PaydAPIError) -> QueryResponse                 // POST /api/ai/query, 20 s
    func receiptScan(_ body: ReceiptScanRequest) async throws(PaydAPIError) -> ReceiptScanResponse // POST /api/ai/receipt-scan, 60 s
    func careemEvents() async throws(PaydAPIError) -> [CareemEvent]                               // GET /api/careem/events, 10 s, Cache-Control no-store
    func decideCareemEvent(id: String, decision: CareemDecision) async -> CareemDecideResult      // POST /api/careem/events/<encodeURIComponent(id)>, 10 s
    func careemPaySettle(recipientTag: String, recipientName: String?, amountMinor: Int, note: String) async throws(CareemPayFailure) -> CareemPayReceipt // POST /api/mcp JSON-RPC, 20 s
}
```
(If typed throws are troublesome in Swift 5 mode, use untyped `throws` that only ever throws these types.)

Request/response shapes (exactly the web routes):
- `InterpretRequest { transcript: String; context: InterpretContext; aiEnabled: Bool }` →
  `InterpretResponse { success: Bool; provider: String?; model: String?; intent: VoiceIntent?; error: String? }`.
  A body with `success == false`, no intent, or non-2xx → `.http(status, error, nil)`.
- `QueryRequest { query: String; dataContext: QueryDataContext; aiEnabled: Bool }` →
  `QueryResponse { success: Bool; provider: String?; model: String?; answer: String?; error: String? }`; missing answer = error.
- `ReceiptScanRequest { image: String /* "data:image/jpeg;base64,…" */; mimeType: String; aiEnabled: Bool }` →
  `{ success: true, receipt: ReceiptScanResult }` | `{ success: false, error: String, code: String? }` (status 400/413/422/503/500).
- `GET /api/careem/events` → `{ events: [StoredCareemEvent] }` (decode with `CareemEvents.decodePending`).
- `POST /api/careem/events/<id>` body `{ decision: "split" | "dismiss" }` → 200 `{ok:true,event}` | 404 | 409.
  `enum CareemDecision: String { case split, dismiss }`;
  `enum CareemDecideResult { case ok, alreadyDecided, notFound, network, server }` (useCareemEvents.ts:106-125).
- `POST /api/mcp` body = `CareemPay.mcpRequestBody(...)`; parse with `CareemPay.parseMCPResponse`; transport failure →
  `CareemPayFailure.transport(...)`; `.offline` → `.transport("Network request failed")` (gives the web's "couldn't
  reach Careem Pay" message).
- Not called by the app: `/api/careem/webhook` and `/api/careem/webhook/test` (server-side receivers fed by careem-mcp)
  and the MCP tool catalogue — not ported.

Offline / unreachable fallbacks (owned by the features that call the API):
| Call | `isUnreachable` | server error (`.http`) |
|------|-----------------|------------------------|
| interpret | `VoiceRules.deterministicParseIntent` on device (same as server with AI off) | web message "Sorry, we couldn't understand that just now. Check the text below and try again." |
| query | `VoiceRules.deterministicAnswerQuery` on device | `VoiceRules.offlineQueryFallback` (web FloatingMicrophone.tsx:297-301) |
| receipt-scan | on-device Apple Vision OCR → `ReceiptTextParser.parseRawLines` | show the server's `error` text; code `ocr_unavailable` (503) also falls back to on-device OCR |
| careem events | do not poll at all when offline; ignore network errors silently | ignore |
| careem pay | outcome `chargeFailed` with "We couldn't reach Careem Pay. …" | mapped by `CareemPay.friendlyError` |

### 3.9 Deep link
`.onOpenURL`: if `url.scheme == "payd"` and `url.host == "join"` → `router.present(.joinInvite(token: GroupLogic.extractInviteToken(url.absoluteString)))`.
Any other URL is ignored (logged).

### 3.10 Stubs SHELL creates (once) so the app compiles before features land
For each entry type in §4: a file `Features/<Dir>/<EntryType>.swift` containing the exact struct + init signature with a
placeholder body (`Text("<EntryType>")`). Feature agents replace the body (and may add files beside it) but must keep
the type name and init signature unchanged.

---------------------------------------------------------------------------------------------------

## 4. FEATURES

Common to every feature: read `LedgerStore`, `AppRouter`, `AppSettings` from `@Environment`; never mutate state except
through `LedgerStore` methods; show validation errors inline exactly where the web does; sheets close with
`router.dismissSheet()`; open other modals with `router.present(...)`; switch tabs with `router.navigate(...)`.
Cross-feature embedding only through the entry types below.

### 4.1 `home` — `ios/Payd.swiftpm/Features/Home/`
Web files: `components/home/HomeView.tsx`, `components/home/SettleUpCard.tsx`,
`components/analytics/CashFlowAnalyticsCard.tsx`, `components/analytics/CategoryBreakdownCard.tsx`
(`spendMath.ts` is CORE).
Entry types: `struct HomeView: View { init() }`. (SettleUpCard, CashFlowAnalyticsCard, CategoryBreakdownCard are
internal types in this directory.) Embeds `RecurringBillsSection(groupId: nil)` (VOICE-PROFILE).

Acceptance checklist:
- [ ] Section order (HomeView.tsx:93-369): hero card, SettleUpCard, Active groups carousel, Quick actions, Cash-flow card,
      Category card, Recurring bills section, Recent activity; spacing 24.
- [ ] Hero (95-156): `brandHero` gradient, radius 16, p 24; "Total net balance" heading 11 brand100; amount =
      sign (`+`/`-`/none) + formatted |net| with the leading 3-letter code stripped (`/^[A-Z]{3}\s*/`), 30 pt bold, then
      `AED` 14 bold brand100; subtitle rules (70-77) with `PaydFormat.plural(groups.count, "active group", "active groups")`
      using **all** groups; divider white 0.2; "Owed to you" (lime300 dot, `+AED …`) and "You owe" (rose `#F43F5E` dot,
      `-AED …`); buttons "Settle up" (flex 3, white fill, brand900 text → `.settlements`) and "New split" (flex 2, white 0.15
      fill, white 0.2 border → `present(.newSplit(defaultGroupId: nil))`), height 48.
- [ ] SettleUpCard (SettleUpCard.tsx:19-104): rows = other users with net ≠ 0 from `snapshot.bilateralDebts`, sorted by |net|
      desc (stable), max 4; subtitle three-way text (49-53) using `snapshot.simplification`; empty "All settled up";
      row "<First> owes you" (+ emerald) / "You owe <First>" (− rose), initials disc 36; CTA "Settle up now" or
      "Settle up with all N people" brand400 → `.settlements`; border brand500 0.3.
- [ ] Active groups (162-225): heading + "See all (N) →" → `.groups`; horizontal snap carousel of **all** groups, card 220
      wide: group emoji, balance badge (+ emerald / − rose / "Settled" brand), name, description or
      "<members> • AED ledger", footer members label + `SpendMath.groupSpendMinor`; tap → `router.openGroup(id)`,
      a11y "Open <name>".
- [ ] Quick actions (228-262): 2-column grid: "Roulette"/"Who pays coffee?" amber → `present(.roulette(defaultGroupId: nil))`;
      "Payd Lens"/"Split a receipt" emerald → `present(.receiptScanner)`.
- [ ] CashFlowAnalyticsCard (CashFlowAnalyticsCard.tsx): header "Cash flow health & reimbursement lag" + "Analytics" badge +
      subtitle; expand chevron (collapsed by default); 3 KPI tiles (#202025, white 0.06 border) "Out-of-pocket exposure"
      (rose), "Settlement recovery rate" `roundedPercent` capped 100 (100 when denominator ≤ 0), "Fair share consumption";
      "Capital Float: X% of monthly budget" (budget = current user's overall budget if > 0 else 500000) and
      "… paid back / … total fronted"; progress bar emerald/rose; lagging alert (145-166) with "Nudge" opening
      `ShareActions.whatsAppURL` with the exact text (42-44); expanded roster (169-253) per velocity: avatar, name,
      "Avg turnaround: <label>", tier badge texts "Speedy ⚡" / "Average ⏱️" / "No history" / "Lagging 🐢" with colours,
      owed amount + nudge or "All settled"; "Open settlements →" → `.settlements`.
- [ ] CategoryBreakdownCard (CategoryBreakdownCard.tsx): expanded by default; "Spending sectors & daily runway" + "Insights";
      subtitle with `PaydFormat.monthName(now)`; runway tile: budget = overall budget or 500000, remaining =
      max(0, budget − spent), days remaining = max(1, daysInMonth − day + 1), daily = `roundedDiv`, "On Track"/"High Burn"
      via `spent*daysInMonth <= budget*day`, "/ day", "N day(s) remaining in <Month> • AED … unspent budget";
      Careem pulse tile ("Careem Super-App Pulse", "Careem Pay Ready", sum of my share of `isCareemExpense` this month);
      "Category Breakdown" + "Total: …" + "Activity →" (→ `.transactions`); rows from `SpendMath.monthlyCategoryShares`
      with icon (`CategoryIcon`), name or "Other / Uncategorized", `roundedPercent`, bar colours cycling
      emerald500, sky500, zinc400, amber500, rose500, teal500; empty "No expenses of yours recorded this month yet."
- [ ] Recent activity (274-368): heading + "See all →" (→ `.transactions`); 6 newest non-deleted via
      `SpendMath.sortedByDateDesc`; row: emoji tile (`PaydFormat.categoryEmojiHome`), title, "Paid by you"/"Paid by X"/
      "Received by…" • `shortDate`; right amount (`+` and emerald for income) and share line rules (301-322) with colours;
      tap → `present(.transactionDetail(transactionId:))`; empty card "No expenses recorded yet" / "Tap the center
      microphone or New split to start."
- [ ] Demo/empty states: switching to a user with no data shows "You are all settled up", empty SettleUpCard text, 100%
      recovery, empty category text.

### 4.2 `groups` — `ios/Payd.swiftpm/Features/Groups/`
Web files: `components/groups/GroupsView.tsx`, `components/groups/useVisibleGroups.ts`, `components/modals/CreateGroupModal.tsx`,
`components/modals/FairPayerRouletteModal.tsx`, `app/join/[token]/page.tsx` (`groupLogic.ts` is CORE).
Entry types:
`struct GroupsView: View { init() }`, `struct CreateGroupView: View { init() }`,
`struct FairPayerRouletteView: View { init(defaultGroupId: String?) }`, `struct JoinGroupView: View { init(token: String) }`.
Embeds `RecurringBillsSection(groupId: selectedGroupId)`.

Acceptance checklist:
- [ ] Header "Active ledgers" / "Fewest payments to settle up, so everyone's square" + "+ New Group" brand400 →
      `present(.createGroup)` (GroupsView.tsx:182-199).
- [ ] Join box (202-240): "Join Ledger:" with link icon, placeholder "Paste invite link or token (e.g. dubai-marina-2026)...",
      "Join"; logic 138-177 (empty → "Paste an invite link or token first."; already member → info; success/info/error
      texts verbatim; error clears on edit); message colours rose400/emerald400/zinc300.
- [ ] Only `snapshot.visibleGroups`; empty text (243-247). Group cards (249-320): emoji, name, description, "AED" pill, up to all
      member letter discs, "Balance" with signed amount colours; selected = brand500 border + #22222a + ring.
- [ ] Selection: initial = `router.focusGroupId` if visible else first; follows `focusGroupRequest` changes; auto-selects a group
      that newly appears for the same user (88-103); selecting scrolls the detail into view (ScrollViewReader).
- [ ] Detail header (326-365): emoji, name, "N MEMBERS" badge, description; "Copy Invite" → `ShareActions.copy(settings.inviteURL(groupId:))`
      then "Invite Link Copied!" with check for 2 s; "Coffee Roulette" amber → `present(.roulette(defaultGroupId: id))`;
      "Add Expense" brand600 → `present(.addExpense(.init(type: .expense, groupId: id)))`.
- [ ] Member balances (368-429): "Σ Balances = AED …" emerald when 0 else amber; rows "Name (You)", "Gets back"/"Owes"/"Settled",
      signed coloured amount.
- [ ] Optimal debt simplification (432-508): `store.groupSimplifiedDebts`; empty text verbatim; row "A (You) → pays → B",
      emerald amount, "Careem Pay" (emerald600) → `present(.careemPay(.init(senderId:, recipientId:, amountMinor:, groupId:, reference: "<group> settlement")))`,
      "Manual" → `present(.recordSettlement(.init(senderId:, recipientId:, amountMinor:, groupId:)))`.
- [ ] Group expense log (511-557): "GROUP EXPENSE LOG (N)" of the group's non-deleted txns in stored order; "Paid by X • Split among N
      members"; amount + `shortDate`; tap → transaction detail; empty text.
- [ ] CreateGroupView (CreateGroupModal.tsx): fields "Group name" (placeholder "e.g. Dubai Villa, Supper Club"), "Description",
      disabled "AED (UAE Dirham)" + note, "ADD MEMBERS (N)" list of all users with "(Creator)" locked selected; validation
      "Please provide a group name." / "Group name must be 60 characters or fewer."; "Cancel" / "Create Group" →
      `store.createGroup(name: trimmed, description: trimmed, memberIds:)` then dismiss (GroupsView auto-selects it).
- [ ] FairPayerRouletteView (FairPayerRouletteModal.tsx): resets on open; visible groups picker (or "Join or create a group to play
      Fair Payer Roulette."); presets AED 25/45/80/150 + amount field (default "45.00") validated by `GroupLogic.parseAmountInput`;
      modes "Smart Debt-Weighted"/"Pure Chance" with the weighted hint text; wheel drawn with SwiftUI `Canvas` using slice colours
      `#10b981 #06b6d4 #3b82f6 #a1a1aa #f59e0b #ec4899 #14b8a6 #f97316`, `#0f172a` strokes, first names, `+Nx` in `#fef08a`,
      hub `#0f172a` with `#38bdf8` ring and ☕, amber pointer; spin = `pickWeightedIndex(weights, Double.random(in: 0..<1))`,
      target rotation formula (226-238), 4 s ease-out (cubic-bezier 0.15,0.9,0.2,1) then winner card "Winner Covers The Bill!";
      participants toggles ("Keep at least 2 people in the wheel."); "Spin The Wheel!"/"Spinning..."; "Re-spin" and
      "Record <First>'s Bill to Ledger" → `store.addTransaction` with title "Coffee & Treats Round (Covered by <First>)",
      category food id, payment "Card / Apple Pay", notes "Fair Payer Roulette round • Debt-Weighted Fairness|Pure Random",
      equal split (Splits.equal); error texts verbatim.
- [ ] JoinGroupView (`app/join/[token]/page.tsx`): invalid token card ("Invite unavailable", "Invite not found or expired", text,
      "Back to Payd" → dismiss); valid: "Group Invitation", "Join <name>", description, "N member(s) • AED ledger";
      already member → note + "Open Payd" (dismiss, `.home`); else "Joining as <name> (<email>)" + "Accept & Join Group" →
      `store.joinGroupByToken`; success "Joined group! Redirecting to dashboard..." then after 1.5 s dismiss + `.home`; failure
      "Invite not found or expired. Ask the group admin for a new link."; footer "Payd Voice-First Shared Expense Ledger".
- [ ] Deep link `payd://join/dubai-marina-2026` opens JoinGroupView for Dubai Flatmates.

### 4.3 `settle` — `ios/Payd.swiftpm/Features/Settle/`
Web files: `components/settlements/SettlementsView.tsx`, `components/modals/RecordSettlementModal.tsx`,
`components/modals/CareemPayModal.tsx` (`careemPaySettle.ts`, `careemPayLink.ts` are CORE).
Entry types: `struct SettlementsView: View { init() }`, `struct RecordSettlementView: View { init(request: SettlementRequest) }`,
`struct CareemPayView: View { init(request: CareemPayRequest) }`.

Acceptance checklist:
- [ ] Header "Settle up" + exact subtitle + "Record Settlement" → `present(.recordSettlement(.init()))` (SettlementsView.tsx:226-243).
- [ ] Smart settle-up hero (246-279): "All square"/"No open debts to settle" when before == 0, else "B → A" and
      "N transfer(s) eliminated (P% fewer)" (`oneDecimalPercentString`) or "Already the fewest transfers possible";
      "Pending Volume" = owedToMe + iOwe in emerald.
- [ ] Summary cards + tab bar (282-347) with counts and grammar ("1 person owes"/"people owe", "You owe 1 person"); default tab
      "owed_to_me".
- [ ] People lists (70-82, 359-432): from `snapshot.bilateralDebts`, sorted desc; card with initials (sky700 / rose700), name,
      "owes You"/"You owe X", email, signed amount; "Copy Reminder" (owed-to-me only) copies text (104-106) with
      `CareemPay.payLink(tag(currentUser.name))` and toasts "Reminder for <First> copied. Paste it into WhatsApp or SMS." (3 s);
      settle area single-group vs multi-group (172-213) with group names ("Personal (no group)"), "spans N groups and
      partly cancels out" text; action buttons (120-169): they-pay-me → "Careem QR" (reference "Settlement from <name>") +
      "Mark Received"; I-pay → "Pay with Careem Pay (AED …)" (reference "Settlement to <name>") + "Record Repayment";
      params from each `PairDebtComponent`. Empty states verbatim.
- [ ] Completed transfers (437-488): "COMPLETED TRANSFERS (N)", sorted by settled_at desc; "<Sender> (You) paid <Recipient>",
      "<method> • <group or No group> • <reference or Settlement completed>", amount, `shortDate`; empty text.
- [ ] RecordSettlementView (RecordSettlementModal.tsx): open-time defaults (40-56, amount via `Currency.minorToMajorString`,
      method "Careem Pay"); "Record settlement" + "Not an expense"; payer→recipient header with avatars; pickers Sender /
      Recipient ("No one else in this group") / Group ("No group (overall balance)" + shared groups 97-101) with change rules
      (69-87); "… owes … in this group/overall:" debt line and reverse-debt hint; Amount (AED prefix) + Payment Method options
      Careem Pay (Instant) / Apple Pay / Bank Transfer / Wio / Card / Cash with values "Careem Pay","Apple Pay",
      "Bank Transfer","Credit Card","Cash"; overpay warning + advance checkbox (313-336); reference field; info note; submit disabled
      when overpaying without advance or no recipient; submit validates then `store.recordSettlement` with reference fallback
      "Advance payment"/"Settlement"; thrown error shown with "Ledger Invariant Violation:" prefix stripped.
- [ ] CareemPayView (CareemPayModal.tsx): sender default current user, recipient default first other user; pending charges kept in a
      process-lifetime cache keyed `"<sender>|<recipient>|<amount>|<group>"` (never re-charge); pre-check via
      `store.validateSettlement`; header "Careem pay" + "Instant UAE"; amount card; recipient tag row ("C" tile, `CareemPay.tag`);
      "Share WhatsApp" (text 171-177) and "Copy Pay Link" ("Link Copied!" 2 s); error / warning / pre-check banners; button texts
      (379-386) and "Settling via Careem Pay..."/"Saving..."; flow via `CareemPay.run` with charge =
      `settings.api.careemPaySettle(recipientTag:, recipientName:, amountMinor:, note: reference)` and record =
      `store.recordSettlement(method "Careem Pay", reference "Careem Pay <ref>: <reference>", allowOverpayment true)`;
      success splash "SETTLEMENT CONFIRMED!", text, "Ref …" (+ " · sandbox (no real money moved)" when simulated), auto-close
      after 2.4 s; footer "Recorded in <group>. Your balances update as soon as Careem Pay confirms the transfer."
- [ ] Offline (no server URL): pressing settle shows "We couldn't reach Careem Pay. Check your connection and try again. You have
      not been charged." and nothing is recorded.

### 4.4 `expenses` — `ios/Payd.swiftpm/Features/Expenses/`
Web files: `components/transactions/TransactionsView.tsx`, `components/modals/TransactionDetailDrawer.tsx`,
`components/modals/AddExpenseModal.tsx`, `components/modals/NewSplitModal.tsx` (`addExpenseLogic.ts`, `newSplitLogic.ts` are CORE).
Entry types: `struct TransactionsView: View { init() }`, `struct TransactionDetailView: View { init(transactionId: String) }`,
`struct AddExpenseView: View { init(request: AddExpenseRequest) }`, `struct NewSplitView: View { init(defaultGroupId: String?) }`.

Acceptance checklist:
- [ ] TransactionsView: header "Expense activity" + subtitle + "+ Add Expense" → `present(.addExpense(.init()))`; search
      (title/payer/category/notes, case-insensitive) placeholder verbatim; filters All Types/Expenses/Income, All Categories +
      categories, All Groups/Personal Only + groups, "Include Deleted" toggle persisted with `@SceneStorage("payd:activity:showDeleted")`;
      summary line (182-195) with `volumeByType`; rows (215-282): emoji (`categoryEmojiActivity`), title, "Reversed" badge,
      group badge, "<category> • Paid by/Received by You|Name • <shortDate>", amount (+ emerald income, strikethrough zinc500
      deleted, row opacity 0.6 rose tint); sorted `sortedByDateDesc`; empty state verbatim; tap → detail sheet.
- [ ] TransactionDetailView (drawer): type badge, "Soft Deleted (Reversed)"; title + `longDateTime`; amount (teal for income);
      Category tile (icon) and Paid By tile (avatar, "(You)"); group/notes box; "Split Allocation" rows + "N member(s)";
      "Share to WhatsApp" / "Copy Breakdown" ("Copied!" 2 s) using the exact summary text (67-83) — hidden when deleted or no
      splits; delete notice; two-step delete (confirm text 299-304 incl. other-payer warning) "Soft-Delete & Reverse" →
      "Yes, delete & reverse" (`store.softDeleteTransaction`, dismiss) / "Keep it"; deleted → "Restore Transaction"
      (`store.restoreTransaction`, dismiss); "Close". Missing transaction id → dismiss.
- [ ] AddExpenseView (AddExpenseModal.tsx): fresh state per open from `request` (type/group/prefill rules 82-125 incl.
      `AddExpenseLogic.findCategoryId`, prefill items → itemized); header "ADD NEW EXPENSE"/"RECORD INCOME"; Expense/Income toggle;
      "Or scan paper receipt with Payd Lens" (expense only) → `present(.receiptScanner)`; Description, Amount (AED, placeholder =
      item subtotal in itemized mode), Category, Paid by (members or everyone), Ledger group ("Personal (No group)" + visible
      groups + preselected) with group-change rules (171-179); participants chips ("SPLIT PARTICIPANTS (N)", keep ≥ 1) and
      "Only members of … can be part of this split."; Equal / Itemize / Exact; itemized line items (add/remove/claim chips,
      "¹/N" fraction, "Shared by all · tap to claim:"/"Claimed:", subtotal vs bill total box with extra/less note); exact per-person
      fields; claim-pruning warning with "OK"; live preview "Equal shares:"/"Each person pays:" or amber status with the
      `computeSplits` error; accuracy note; "Cancel" / "Save Expense"|"Save Income"; submit rules (220-260) and `friendlyError`.
- [ ] NewSplitView (NewSplitModal.tsx): fresh per open; title field focused; "What was it for?", Amount, "Category (optional)"
      ("No category"), "Split with" ("No group / friends" + visible/preselected groups), "Paid by" (participants); people chips
      with first-last initials, keep ≥ 1, stable order; "Split method" Equal/Exact/%/Shares (a11y "Percentage"); per-person rows
      with inputs (exact AED / % / x; shares default "1"), per-method value memory, live preview amounts or "-"; remaining line
      with tone (emerald/amber/rose); summary line (155-172) with tones; accuracy note; "Create split" disabled until title and amount
      are non-empty; submit via `NewSplitLogic.build` then `store.addTransaction`.

### 4.5 `lens` — `ios/Payd.swiftpm/Features/Lens/`
Web files: `components/modals/ReceiptScannerModal.tsx`, `components/modals/LensCameraViewer.tsx`, client side of
`app/api/ai/receipt-scan/route.ts`, server fallback `lib/ai/local-ocr.ts` + `web/scripts/ocr.swift` (on-device equivalent);
`receipt-scan.ts` maths and `receipt-server.ts` parser are CORE.
Entry types: `struct ReceiptScannerView: View { init() }` (camera viewer, OCR service etc. are internal types here).

Acceptance checklist:
- [ ] Fresh state on every open (ReceiptScannerModal.tsx:122-140); default group = first group containing the current user, else first
      group, else personal (102-105); pool = group members or all users; payer = current user if in pool else first.
- [ ] Header "Payd Lens" + "UAE OCR • 5% VAT" badge + "Snap a receipt and split it item by item"; close (a11y "Close Payd Lens").
- [ ] Stage 1: camera viewer (LensCameraViewer.tsx) — 4:3 dashed frame; idle button "Open Payd Lens Camera"/"Starting camera…";
      AVCaptureSession preferring the back wide camera; 10 s start timeout; errors mapped to the web texts (118-130:
      permission denied, no camera (Simulator), in use, generic); "Try again"; live: green inset frame, camera picker + switch
      button when > 1 device; **preview mirrored for front cameras** (`LensMirror.shouldMirrorPreview(facingMode: "user"/"environment", label:)`)
      while the captured photo is never mirrored; "Capture Receipt" (JPEG 0.92) and "Upload Photo" (PhotosPicker, images only;
      > 8 MB → "That photo is too large. Please use one under 8 MB."; unreadable → "Couldn't read that file. Please try another photo.");
      helper text and "No photo? Enter the bill manually" (blank manual receipt 46-63).
- [ ] Stage 1.5: preview with rotate ±90° (re-encode JPEG 0.92), "Is the receipt upright?…" text, "Retake", "Scan receipt".
- [ ] Stage 2: scanning animation, "Payd Lens Scanning Receipt...", subtitle verbatim.
- [ ] Scan: `settings.api.receiptScan(.init(image: "data:image/jpeg;base64,…", mimeType: "image/jpeg", aiEnabled: settings.aiEnabled))`;
      success → receipt with currency AED, assignments = all selected users per item; server error → its message +
      "Try another photo"/"Enter manually"; unreachable or `ocr_unavailable` → on-device Vision OCR
      (`VNRecognizeTextRequest` accurate, language correction, automatic language; retry orientations right/down/left when < 5
      lines and keep the best; downscale images > 1 MB to max 1400 px first) → `ReceiptTextParser.parseRawLines(lines, now:)`;
      parser error → its message with scanFailed actions.
- [ ] Stage 3 (643-1077): merchant + TRN chip + date chip + "Needs review • N% confidence"/"Totals reconcile • N% confidence"
      (not for manual); total, "Subtotal: … • VAT: …" (+ "• Charges: …"); warnings list; edit mode for merchant/total
      (total edit keeps VAT ≤ total and recomputes subtotal 702-711); Payer picker and "Group Ledger" picker (all groups) with
      `applyGroup` rules (107-120); "Split Strategy", "Edit Items"/"Done Editing", "Split Equally"/"Itemized ("Who Had What?")";
      participant chips (keep ≥ 1, removal prunes assignments); line items with claimed-by chips (keep ≥ 1 per item), "¹/N (AED … each)"
      using `roundedDiv`, quantity prefix "2x ", edit name/price/delete (`withItems` recompute 165-175), "Add Item" (Custom Item
      AED 10.00), "Split All Equally", "All to Payer"; VAT note; "EACH PERSON PAYS" grid with "Sum: …" from `Splits.equal` or
      `ItemizedShares.calculate` (assignments filtered to participants); "Share WhatsApp"/"Copy Summary" ("Copied to Clipboard!")
      with the exact text (400-412); "Scan Another"; "Save Receipt to Ledger"/"Saving…"/"Saved" enabled per `canSave` (393-398).
- [ ] Save (425-465): `store.addTransaction` with title merchant or "Receipt Expense", category matched by name else first,
      payment "Card", group, occurred_at = local noon of `date` when `^\d{4}-\d{2}-\d{2}$`, notes
      "Payd Lens OCR • TRN: <trn|N/A> • 5% VAT: <AED …>", splits from the shown shares; errors via `friendlySaveError` text
      (38-44); success closes.

### 4.6 `voice-profile` — `ios/Payd.swiftpm/Features/VoiceProfile/`
Web files: `components/voice/FloatingMicrophone.tsx`, `components/voice/VoiceWaveform.tsx`, `components/voice/ConfirmationCard.tsx`,
`components/voice/ClarificationCard.tsx`, `components/profile/ProfileView.tsx`, `components/recurring/RecurringBillsSection.tsx`,
`components/modals/CreateRecurringBillModal.tsx`, `components/careem/CareemSplitPrompt.tsx`, `lib/careem/useCareemEvents.ts`,
client side of `app/api/ai/interpret`, `app/api/ai/query`, `app/api/careem/events` (+ `/[id]`) (`gemini.ts` rules,
`profileForm.ts`, `recurringPeriod.ts`, careem event helpers are CORE). Also owns the moved `SpeechRecognizer.swift`.
Entry types:
`struct VoiceAssistantOverlay: View { init() }`, `struct ProfileView: View { init() }`,
`struct RecurringBillsSection: View { init(groupId: String?) }`, `struct CreateRecurringBillView: View { init(defaultGroupId: String?) }`,
`struct CareemEventsHost: View { init() }`.

Acceptance checklist:
- [ ] VoiceAssistantOverlay: always shows the floating keyboard button (bottom 96, trailing 16; `#18181b`, white 0.1 border, a11y
      "Type instead of speaking") opening the typed card; `router.voiceTriggerCount` change toggles recording (web hidden mic trigger).
      Speech: `SpeechRecognizer` (keep: permissions, audio session off main thread on a serial queue, generation guards) with locale
      **en-US**, partial results; final result → processTranscript; errors mapped to the web texts (54-68) and open the typed card.
- [ ] Cards (FloatingMicrophone.tsx:347-551) on a black 0.75 dimmed full-screen layer, bottom-aligned: Listening card ("Listening...",
      close, `VoiceWaveform` = ripple orb + 9 bars heights 16,34,48,56,38,52,28,42,20 with delays 0.1…0.45 s and 1 s bar-jump,
      transcript or the example prompt, "Tap when you're done", "Type instead"); processing card "Interpreting Speech"/
      "Working out the details…"; Clarification card; Confirmation card; answer card "Payd Financial Intelligence" + footnote
      + "Close"; typed card (maxLength 2000, placeholder, quick chips "Dinner 120 split"/"Spend query"/"Repayment" filling the
      exact texts, send button, error banner amber). Tapping the dimmed area does nothing; close buttons as web.
- [ ] processTranscript (159-218): context `InterpretContext.from(state:)`, `settings.api.interpret` with `aiEnabled`; unreachable →
      `VoiceRules.deterministicParseIntent`; query intent → `QueryDataContext.from` + `settings.api.query` (unreachable →
      `deterministicAnswerQuery`, server error → `offlineQueryFallback`); missing fields → clarification (combined text rule 304-308);
      failures → error text (too-long variant) and typed card prefilled.
- [ ] ConfirmationCard (ConfirmationCard.tsx): intent badge (underscores → spaces), matched group badge, title =
      `VoiceRules.buildShortDescription`, amount field initialised from `VoiceRules`/`PaydMath.jsNumberString(amount)` or "0",
      payer resolution, participant matching rule (43-49), currency-mismatch note, repayment row, non-member warning, category picker,
      equal split preview, "Discard"/"Confirm & Persist"; save rules (84-146) incl. repayment via `store.recordSettlement`
      (method "Voice Settlement", reference title, allowOverpayment true) and friendly error mapping.
- [ ] ClarificationCard: question fallback chain, "Original voice command: "<notes>"", answer field placeholder "e.g. 150 dirhams with Veer",
      "Cancel voice command".
- [ ] ProfileView (ProfileView.tsx): "User profile & settings" + subtitle; saved banner "Profile settings saved." (2.5 s); profile card
      (AvatarView 64 rounded-2xl ring brand500, name, email, "Verified Ledger Account"); Display name (max 60) with error; disabled
      currency "AED - UAE Dirham (د.إ)" + note; "Monthly budget limit" (initial `Currency.minorToMajorPlainString` or "5000") with
      error; "Save Profile Settings" → `ProfileForm.validate`, `store.updateBudget(limitMinor:categoryId: nil)`,
      `store.updateUserProfile(.init(name: trimmed, defaultCurrency: "AED"))`; AI features card with switch and the two description
      texts bound to `settings.aiEnabled`; Privacy & accuracy card verbatim. **iOS-only addition required by the port:** a
      "Payd server" card below the AI card: field (placeholder `https://your-payd-server.example`), "Save", helper text
      "Payd Lens, voice and Careem features use your Payd web server. Leave empty to work offline with on-device recognition.",
      error from `settings.setServerBaseURL`, success "Server address saved.". No user-switching or reset UI (the web has none).
- [ ] RecurringBillsSection (RecurringBillsSection.tsx): header "Shared subscriptions & recurring bills" + "N ACTIVE" + subtitle,
      "+ Subscription" → `present(.createRecurringBill(defaultGroupId: groupId))`; flash banner 3.5 s; empty dashed card text;
      bill cards: "<formatDueDay> • <frequency>", title, delete with inline "Delete?" Yes/No, amount + "/mo|/wk|/yr", notes,
      "Already posted for <period>", repost confirm (amber, "Post again"/"Cancel"), "Paid by <First|Member>", group name or
      "Personal", overlapping 20 pt avatars, "Post Split Now"/"Posted!" (3 s, disabled while posted) via
      `store.triggerRecurringBillSplit`; success/error flash texts verbatim; filtered by `groupId` when non-nil.
- [ ] CreateRecurringBillView (CreateRecurringBillModal.tsx): defaults (27-58, visible groups), fields "Subscription Title",
      "Amount (AED)", Frequency (Monthly/Weekly/Yearly; clamps due day), due-day label variants + weekday picker or 1–31 stepper/field,
      "Who Pays Front-Line?", "Assign to Group" ("Personal (No group)"), Category, participant chips "Split Subscriptions Between (N)"
      (keep ≥ 1), "Equal Share per member:" with "≈ " when not divisible and `roundedDiv` + "/ month|week|year"; note; validation
      texts (100-115); "Cancel"/"Create Subscription" → `store.addRecurringBill` (equal splits, currency AED, auto_post false,
      last_posted nil, due day clamped).
- [ ] CareemEventsHost: when `settings.isOnline` and the scene is active, polls `settings.api.careemEvents()` every 2 s (stops in
      background), drops ids decided locally until the server stops returning them, shows `CareemEvents.current`; prompt hidden while
      `router.sheet != nil`; bottom card (bottom padding 96): "C" tile, service label uppercased in `#00ea80`, "· <relativeTime>"
      refreshed every 15 s, dismiss X, order summary (icon per service, title, subtitle, "N item(s)"), "Split this with others?",
      "Add it to Payd and choose who to split AED … with." + " · N more pending", "No"/"Yes, split"; answering twice is impossible;
      split → `decideCareemEvent(.split)` (fire-and-forget) + `present(.addExpense(.init(type: .expense, groupId: nil,
      prefill: CareemEvents.prefill(for:))))`; No/X → `.dismiss`.

---------------------------------------------------------------------------------------------------

## 5. FILE OWNERSHIP TABLE

Existing files (action → owner):

| Path | Action | Owner |
|------|--------|-------|
| `ios/PaydCore/Package.swift` | keep (add test resources for Fixtures if needed) | CORE |
| `ios/PaydCore/Sources/PaydCore/Models.swift` | rewrite (§1) | CORE |
| `ios/PaydCore/Sources/PaydCore/Currency.swift` | rewrite (§2.5) | CORE |
| `ios/PaydCore/Sources/PaydCore/Splits.swift` | rewrite (§2.6; `LedgerError` removed) | CORE |
| `ios/PaydCore/Sources/PaydCore/Balances.swift` | rewrite (§2.7) | CORE |
| `ios/PaydCore/Sources/PaydCore/DebtSimplifier.swift` | rewrite (§2.8) | CORE |
| `ios/PaydCore/Sources/PaydCore/ItemizedShares.swift` | rewrite (§2.16) | CORE |
| `ios/PaydCore/Sources/PaydCore/LedgerActions.swift` | rewrite (§2.9) | CORE |
| `ios/PaydCore/Sources/PaydCore/LedgerQueries.swift` | rewrite (§2.10) | CORE |
| `ios/PaydCore/Sources/PaydCore/SeedData.swift` | rewrite (§1.5) | CORE |
| `ios/PaydCore/Sources/PaydCore/VoiceExpenseParser.swift` | keep unchanged | CORE |
| `ios/PaydCore/Tests/PaydCoreTests/*Tests.swift` (7 files) | rewrite to new APIs; `VoiceExpenseParserTests.swift` keep | CORE |
| `ios/Payd.swiftpm/Package.swift` | edit (§3.1) | SHELL |
| `ios/Payd.swiftpm/README.md` | update to the new structure (excluded from target) | SHELL |
| `ios/Payd.swiftpm/ExpenseTrackerApp.swift` | rewrite (§3.3) | SHELL |
| `ios/Payd.swiftpm/Models/CategoryStyle.swift` | delete | SHELL |
| `ios/Payd.swiftpm/Store/LedgerStore.swift` | rewrite (§3.7) | SHELL |
| `ios/Payd.swiftpm/Theme/PaydTheme.swift`, `Theme/PaydFonts.swift` | rewrite (§3.2) | SHELL |
| `ios/Payd.swiftpm/Resources/Fonts/*.ttf` | keep | SHELL |
| `ios/Payd.swiftpm/Views/RootView.swift` | move → `Shell/RootView.swift`, rewrite | SHELL |
| `ios/Payd.swiftpm/Views/PaydDock.swift` | delete (replaced by `Shell/BottomNav.swift`) | SHELL |
| `ios/Payd.swiftpm/Views/LedgerErrorAlert.swift` | move → `UI/LedgerErrorAlert.swift` | SHELL |
| `ios/Payd.swiftpm/Views/{ContentView,SummaryCardView,ExpenseRowView,ActivityView,AddExpenseView,GroupsView,SettleView,CameraScannerView}.swift` | delete | SHELL |
| `ios/Payd.swiftpm/Voice/SpeechRecognizer.swift` | SHELL moves (git mv, content unchanged) → `Features/VoiceProfile/SpeechRecognizer.swift`; afterwards owned by VOICE-PROFILE | SHELL → VOICE-PROFILE |
| `ios/Payd.swiftpm/Voice/VoiceCaptureView.swift` | delete | SHELL |

New files:

| Path | Owner |
|------|-------|
| `ios/PaydCore/Sources/PaydCore/{JSONValue,PaydJSON,OrderedMap,Foundation+Payd,LedgerInvariantError,PaydMath,PaydFormat,SpendMath,RecurringPeriod,GroupLogic,AddExpenseLogic,NewSplitLogic,ReceiptModels,ReceiptTextParser,CareemPay,CareemEvents,VoiceIntent,ProfileForm,LensMirror}.swift` | CORE |
| `ios/PaydCore/Tests/PaydCoreTests/**` (one per ported web test file + new action/query/JSON tests, `Fixtures/`) | CORE |
| `ios/Payd.swiftpm/Config/AdditionalInfo.plist` | SHELL |
| `ios/Payd.swiftpm/Resources/Brand/*.png` | SHELL |
| `ios/Payd.swiftpm/Shell/{RootView,Navbar,BottomNav,AppRouter,PaydSheet,PaydSheetContent,PaydCoreAliases}.swift` | SHELL |
| `ios/Payd.swiftpm/Store/AppSettings.swift` | SHELL |
| `ios/Payd.swiftpm/Networking/{PaydAPI,APIModels}.swift` | SHELL |
| `ios/Payd.swiftpm/UI/*.swift` (all §3.4 components) | SHELL |
| `ios/Payd.swiftpm/Features/Home/HomeView.swift` (stub by SHELL) + any `Features/Home/*` | HOME |
| `ios/Payd.swiftpm/Features/Groups/{GroupsView,CreateGroupView,FairPayerRouletteView,JoinGroupView}.swift` (stubs by SHELL) + any `Features/Groups/*` | GROUPS |
| `ios/Payd.swiftpm/Features/Settle/{SettlementsView,RecordSettlementView,CareemPayView}.swift` (stubs) + any `Features/Settle/*` | SETTLE |
| `ios/Payd.swiftpm/Features/Expenses/{TransactionsView,TransactionDetailView,AddExpenseView,NewSplitView}.swift` (stubs) + any `Features/Expenses/*` | EXPENSES |
| `ios/Payd.swiftpm/Features/Lens/ReceiptScannerView.swift` (stub) + any `Features/Lens/*` | LENS |
| `ios/Payd.swiftpm/Features/VoiceProfile/{VoiceAssistantOverlay,ProfileView,RecurringBillsSection,CreateRecurringBillView,CareemEventsHost}.swift` (stubs) + `SpeechRecognizer.swift` + any `Features/VoiceProfile/*` | VOICE-PROFILE |
| `docs/ios-port/SPEC.md` | ARCHITECT |

Rules: SHELL touches `Features/**` only to create the stubs and the SpeechRecognizer move, before feature agents start.
Feature-private type names must be prefixed with the feature (e.g. `HomeSettleUpCard`, `LensCameraViewer`, `GroupsRouletteWheel`)
so two features never declare the same type in the shared `AppModule` target. Nobody edits `web/`.

---------------------------------------------------------------------------------------------------

## 6. GLOBAL ACCEPTANCE (integration)
- [ ] A `payd_state_v3` JSON exported from the web's localStorage, placed at `Application Support/payd_state_v3.json`, loads in the
      app with identical balances, and the app's saved file loads back in the web (keys, nulls, ISO dates with ms).
- [ ] First launch shows the web demo exactly: Home net `+1,500.00 AED`, "You are owed net across 2 active groups",
      Settle tab badge visible, Dubai Flatmates simplification shows Prakarsh → Manan AED 240.00 among its transfers.
- [ ] Every web modal is reachable from the same buttons as on the web; only one sheet at a time; Careem prompt never covers a sheet.
- [ ] With an empty server URL everything except Careem Pay charging and Careem events works offline (voice via on-device rules,
      Lens via Apple Vision), and no request is attempted.
- [ ] No force-unwraps on external data, no `print`, no Double money maths, zero build warnings, all PaydCore tests green.
