import Foundation

// Port of the pure OCR-text parser in web/src/lib/ai/receipt-server.ts:26-423 (Payd Lens local OCR).
// The app feeds it the lines Apple Vision recognised when the server is unreachable. Same regexes,
// column pairing, metadata skipping, total priority, VAT inference, merchant and category rules.
// Amounts are integer fils; only the confidence score is a Double (as on the web).

/// `ReceiptScanError`: the upload cannot be turned into a trustworthy receipt.
public struct ReceiptScanError: Error, Sendable, Equatable {
    public let message: String
    public let status: Int
    public let code: String

    public init(_ message: String, status: Int = 422, code: String = "unreadable") {
        self.message = message
        self.status = status
        self.code = code
    }
}

public enum ReceiptRowKind: String, Sendable { case item, subtotal, vat, total, charge, discount, payment }

public enum ReceiptTextParser {
    public static let unreadableMessage =
        "We couldn't read a receipt in this image. Try a sharper, well-lit photo, or enter the bill manually."

    /// AED 1,000,000 sanity ceiling.
    static let maxReceiptMinor = 100_000_000

    // MARK: Amounts

    private static let amountPattern = JSRegex(
        "(?<![\\d.,])(-)?\\s?(?:AED|DHS?|د\\.إ)?\\s?((?:\\d{1,3}(?:,\\d{3})+|\\d+)\\.\\d{2}|\\d+,\\d{2})(?![\\d.,]*\\d)", "i")
    private static let currencyNoise = JSRegex("\\b(?:AED|DHS?)\\b|د\\.إ|[:=*\\-\\s]", "i")

    private struct FoundAmount {
        let minor: Int
        let index: Int
        let end: Int
    }

    /// `amountTextToMinor`: "1,250.50" → 125050, "13,50" → 1350; nil when too long for Int.
    private static func amountTextToMinor(_ raw: String) -> Int? {
        let normalized: String
        if raw.contains(".") {
            normalized = raw.replacingOccurrences(of: ",", with: "")
        } else if let comma = raw.firstIndex(of: ",") {
            normalized = raw.replacingCharacters(in: comma...comma, with: ".")
        } else {
            normalized = raw
        }
        let parts = normalized.split(separator: ".", omittingEmptySubsequences: false)
        let fraction = parts.count > 1 ? String(parts[1]) : "00"
        let padded = String((fraction + "00").prefix(2))
        guard let whole = Int(parts.first.map(String.init) ?? ""), let cents = Int(padded) else { return nil }
        let (scaled, overflow) = whole.multipliedReportingOverflow(by: 100)
        return overflow ? nil : scaled + cents
    }

    private static func findAmounts(_ line: String) -> [FoundAmount] {
        amountPattern.matches(line).compactMap { match in
            guard let text = match[2], let minor = amountTextToMinor(text), minor <= maxReceiptMinor else { return nil }
            return FoundAmount(minor: match[1] != nil ? -minor : minor, index: match.range.location,
                               end: match.range.location + match.range.length)
        }
    }

    /// `amountOnly`: the amount when the line holds nothing but a price (Vision's price column).
    private static func amountOnly(_ line: String) -> Int? {
        let amounts = findAmounts(line)
        guard let last = amounts.last else { return nil }
        var rest = line as NSString
        for amount in amounts.reversed() {
            rest = (rest.substring(to: amount.index) + rest.substring(from: amount.end)) as NSString
        }
        return currencyNoise.replacing(in: rest as String, with: "").isEmpty ? last.minor : nil
    }

    // MARK: Classification

    private static let metadataPattern = JSRegex(
        "\\b(?:trn|tin|vat\\s*(?:reg|no|number|id)|tax\\s*reg\\w*|date|time|tel|phone|mob(?:ile)?|fax|invoice|inv\\s*no|bill\\s*no|receipt\\s*(?:no|#)|order\\s*(?:no|#)|table|cashier|server|waiter|guests?|covers?|terminal|thank\\s*you|thanks|welcome|visit\\s*again|www|https?|e-?mail)\\b|@",
        "i")
    private static let lettersPattern = JSRegex("\\p{L}{2,}")

    private static func hasLetters(_ s: String) -> Bool { lettersPattern.test(s) }

    private static let subtotalLabel = JSRegex("sub\\s*-?\\s*total|excl\\.?\\s*(?:of\\s*)?(?:vat|tax)|before\\s*(?:vat|tax)")
    private static let totalLabel = JSRegex(
        "\\b(?:grand\\s*total|total|amount\\s*due|balance\\s*due|net\\s*payable|amount\\s*payable|net\\s*amount|incl\\.?\\s*(?:vat|tax))\\b")
    private static let notTotalLabel = JSRegex(
        "\\b(?:total\\s*(?:vat|tax)|(?:vat|tax)\\s*(?:amount|total)|total\\s*(?:items?|qty|quantity|savings?|discounts?|pieces?))\\b")
    private static let vatLabel = JSRegex("\\b(?:vat|tax|gst)\\b")
    private static let chargeLabel = JSRegex(
        "\\b(?:service|svc|tips?|gratuity|delivery|municipality|tourism|fees?|charges?|rounding|round\\s*off)\\b")
    private static let discountLabel = JSRegex("\\b(?:discount|disc|promo|coupon|savings?|offer|voucher)\\b")
    private static let paymentLabel = JSRegex(
        "\\b(?:cash|change|card|visa|mastercard|amex|tender(?:ed)?|paid|payment|apple\\s*pay)\\b")

    /// `classifyReceiptLabel`.
    public static func classifyLabel(_ label: String) -> ReceiptRowKind {
        let l = label.lowercased()
        if subtotalLabel.test(l) { return .subtotal }
        if totalLabel.test(l) && !notTotalLabel.test(l) { return .total }
        if vatLabel.test(l) { return .vat }
        if chargeLabel.test(l) { return .charge }
        if discountLabel.test(l) { return .discount }
        if paymentLabel.test(l) { return .payment }
        return .item
    }

    private static let topPriority = JSRegex("grand\\s*total|amount\\s*due|balance\\s*due|total\\s*due|payable")
    private static let inclusivePriority = JSRegex("incl\\.?\\s*(?:vat|tax)")

    private static func totalPriority(_ label: String) -> Int {
        let l = label.lowercased()
        if topPriority.test(l) { return 3 }
        if inclusivePriority.test(l) { return 2 }
        return 1
    }

    private static let labelCurrency = JSRegex("\\b(?:AED|DHS?)\\b|د\\.إ", "i")
    private static let labelPunctuation = JSRegex("[:=*]+")
    private static let multiSpace = JSRegex("\\s{2,}")
    private static let edgeJunk = JSRegex("^[\\s\\-.]+|[\\s\\-.]+$")

    private static func cleanLabel(_ raw: String) -> String {
        var s = labelCurrency.replacing(in: raw, with: " ")
        s = labelPunctuation.replacing(in: s, with: " ")
        s = multiSpace.replacing(in: s, with: " ")
        s = edgeJunk.replacing(in: s, with: "")
        return s.jsTrimmed
    }

    private static let upperLetter = JSRegex("[A-Z]")
    private static let wordStart = JSRegex("\\b\\p{L}")

    private static func titleCaseIfShouting(_ s: String) -> String {
        if s != s.uppercased() || !upperLetter.test(s) { return s }
        return wordStart.replacing(in: s.lowercased()) { ($0[0] ?? "").uppercased() }
    }

    private static let quantityPatterns: [(JSRegex, name: Int, quantity: Int)] = [
        (JSRegex("^(\\d{1,3})\\s*[x×]\\s+(.+)$", "i"), 2, 1),
        (JSRegex("^(.+?)\\s+(\\d{1,3})\\s*[x×]$", "i"), 1, 2),
        (JSRegex("^(.+?)\\s+[x×]\\s*(\\d{1,3})$", "i"), 1, 2),
        (JSRegex("^(.+?)\\s+qty\\.?\\s*(\\d{1,3})$", "i"), 1, 2),
    ]

    private static func splitQuantity(_ label: String) -> (name: String, quantity: Int) {
        for (pattern, nameIndex, quantityIndex) in quantityPatterns {
            if let match = pattern.firstMatch(label), let quantity = match[quantityIndex].flatMap(Int.init),
               quantity >= 1, let name = match[nameIndex] {
                return (name.jsTrimmed, quantity)
            }
        }
        return (label, 1)
    }

    // MARK: Date + TRN

    private static let months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]
    private static let dateWord = JSRegex("date", "i")
    private static let isoDate = JSRegex("\\b(\\d{4})[-/.](\\d{1,2})[-/.](\\d{1,2})\\b")
    private static let numericDate = JSRegex("\\b(\\d{1,2})[-/.](\\d{1,2})[-/.](\\d{2}|\\d{4})\\b")
    private static let dayMonthName = JSRegex("\\b(\\d{1,2})[\\s\\-]*([a-z]{3})[a-z]*[\\s\\-,]*(\\d{4}|\\d{2})\\b", "i")
    private static let monthNameDay = JSRegex("\\b([a-z]{3})[a-z]*\\.?\\s+(\\d{1,2}),?\\s+(\\d{4})\\b", "i")

    private static func isoIfValid(_ year: Int, _ month: Int, _ day: Int, now: Date) -> String? {
        let y = year < 100 ? year + 2000 : year
        if month < 1 || month > 12 || day < 1 || day > 31 || y < 2000 { return nil }
        let calendar = PaydJSON.utcCalendar
        guard let date = calendar.date(from: DateComponents(year: y, month: month, day: day)),
              calendar.component(.year, from: date) == y, calendar.component(.month, from: date) == month,
              calendar.component(.day, from: date) == day else { return nil }
        // Allow one day of clock/time-zone skew; anything further ahead is a misread.
        if date.timeIntervalSince1970 > now.timeIntervalSince1970 + 36 * 3600 { return nil }
        let pad = { (n: Int) in n < 10 ? "0\(n)" : "\(n)" }
        return "\(y)-\(pad(month))-\(pad(day))"
    }

    private static func number(_ text: String?) -> Int { text.flatMap { Int($0) } ?? 0 }

    /// `extractReceiptDate`: lines mentioning "date" first; UAE receipts are day-first.
    public static func extractDate(_ lines: [String], now: Date) -> String? {
        let ordered = lines.filter { dateWord.test($0) } + lines.filter { !dateWord.test($0) }
        for line in ordered {
            if let m = isoDate.firstMatch(line),
               let iso = isoIfValid(number(m[1]), number(m[2]), number(m[3]), now: now) { return iso }
            if let m = numericDate.firstMatch(line) {
                let a = number(m[1])
                let b = number(m[2])
                let iso = isoIfValid(number(m[3]), b, a, now: now) ?? (a <= 12 ? isoIfValid(number(m[3]), a, b, now: now) : nil)
                if let iso { return iso }
            }
            if let m = dayMonthName.firstMatch(line), let name = m[2]?.lowercased(),
               let index = months.firstIndex(of: name),
               let iso = isoIfValid(number(m[3]), index + 1, number(m[1]), now: now) { return iso }
            if let m = monthNameDay.firstMatch(line), let name = m[1]?.lowercased(),
               let index = months.firstIndex(of: name),
               let iso = isoIfValid(number(m[3]), index + 1, number(m[2]), now: now) { return iso }
        }
        return nil
    }

    private static let trnLabel = JSRegex("\\b(?:TRN|TIN|VAT\\s*(?:REG|NO)|TAX\\s*REG)", "i")
    private static let nonDigits = JSRegex("\\D")
    private static let trnDigits = JSRegex("1\\d{14}")
    private static let spacesAndDashes = JSRegex("[\\s-]")
    private static let bareTrn = JSRegex("(?<!\\d)(1\\d{14})(?!\\d)")

    /// `extractTrn`: a 15-digit UAE TRN, preferring labelled lines.
    public static func extractTrn(_ lines: [String]) -> String? {
        for line in lines where trnLabel.test(line) {
            if let match = trnDigits.firstMatch(nonDigits.replacing(in: line, with: ""))?[0] { return match }
        }
        for line in lines {
            if let match = bareTrn.firstMatch(spacesAndDashes.replacing(in: line, with: ""))?[1] { return match }
        }
        return nil
    }

    // MARK: Reconciliation

    /// receipt-server.ts `fmt`: "AED 1,250.50" / "-AED 5.00".
    private static func format(_ minor: Int) -> String { Currency.format(minor, currency: "AED") }

    /// `assessReceipt`: warnings and a confidence that drops when the numbers don't reconcile.
    public static func assess(_ r: ReceiptScanResult, baseConfidence: Double,
                              extraWarnings: [String] = []) -> (confidence: Double, warnings: [String]) {
        var warnings = extraWarnings
        var confidence = baseConfidence
        let charges = r.chargesMinor ?? 0
        let itemsSum = r.lineItems.reduce(0) { $0 + $1.priceMinor }

        if r.lineItems.isEmpty {
            warnings.append("No line items detected. Add them manually or split the total equally.")
            confidence -= 0.2
        } else {
            if r.subtotalMinor > 0 && itemsSum != r.subtotalMinor {
                warnings.append("Line items add up to \(format(itemsSum)) but the receipt subtotal is \(format(r.subtotalMinor)).")
                confidence -= 0.25
            }
            if itemsSum + r.vatMinor + charges != r.totalMinor {
                warnings.append(
                    "Items + VAT\(charges != 0 ? " + charges" : "") = \(format(itemsSum + r.vatMinor + charges)), but the total is \(format(r.totalMinor)). Please check the amounts.")
                confidence -= 0.25
            }
        }
        if r.subtotalMinor > 0 && r.subtotalMinor + r.vatMinor + charges != r.totalMinor {
            warnings.append("Subtotal + VAT doesn't equal the total (\(format(r.totalMinor))).")
            confidence -= 0.15
        }
        // `vat > total * 0.2` in integers.
        if r.totalMinor > 0 && r.vatMinor * 5 > r.totalMinor {
            warnings.append("VAT looks unusually high for UAE 5% VAT.")
            confidence -= 0.15
        }
        confidence = min(0.97, max(0.05, PaydMath.jsRound(confidence * 100) / 100))
        return (confidence, warnings)
    }

    // MARK: Parser

    private struct Row {
        let label: String
        let minor: Int
        let line: Int
        let kind: ReceiptRowKind
    }

    private struct Builder {
        var rows: [Row] = []
        var strayAmounts: [Int] = []
        var pending: [(label: String, line: Int)] = []
        var block: [(minor: Int, line: Int)] = []

        mutating func pushRow(_ label: String, _ minor: Int, _ line: Int) {
            let cleaned = ReceiptTextParser.cleanLabel(label)
            guard ReceiptTextParser.hasLetters(cleaned) else {
                strayAmounts.append(minor)
                return
            }
            rows.append(Row(label: cleaned, minor: minor, line: line, kind: ReceiptTextParser.classifyLabel(cleaned)))
        }

        /// Pairs the run of price-only lines with the label-only lines before it, aligned from the end.
        mutating func flush() {
            guard !block.isEmpty else { return }
            let m = min(block.count, pending.count)
            let labels = Array(pending.suffix(m))
            let amounts = Array(block.suffix(m))
            strayAmounts += block.prefix(block.count - m).map(\.minor)
            for (index, label) in labels.enumerated() { pushRow(label.label, amounts[index].minor, label.line) }
            pending = []
            block = []
        }
    }

    private static let groceryPattern = JSRegex(
        "carrefour|lulu|spinneys|choithram|waitrose|union\\s*coop|grocer|supermarket|hypermarket|\\bmarket\\b")
    private static let nonLetters = JSRegex("[^\\p{L}]")

    /// `parseRawReceiptTextLines`: Apple Vision OCR lines → a structured receipt.
    /// Throws `ReceiptScanError` (422) when there is nothing that looks like a receipt.
    public static func parseRawLines(_ rawLines: [String], now: Date) throws(ReceiptScanError) -> ReceiptScanResult {
        let lines = rawLines.map(\.jsTrimmed).filter { !$0.isEmpty }
        if lines.isEmpty { throw ReceiptScanError(unreadableMessage) }

        var builder = Builder()
        for (i, line) in lines.enumerated() {
            if let solo = amountOnly(line) {
                builder.block.append((solo, i))
                continue
            }
            builder.flush()
            if !hasLetters(line) { continue }
            let amounts = findAmounts(line)
            if let first = amounts.first, let last = amounts.last {
                let ns = line as NSString
                let before = ns.substring(to: first.index)
                let after = ns.substring(from: last.end)
                let label = hasLetters(before) ? before : after
                if metadataPattern.test(label) && classifyLabel(label) == .item { continue }
                builder.pending = []
                builder.pushRow(label, last.minor, i)
                continue
            }
            // Label-only line: metadata (TRN, date, phone, "thank you") never takes a price.
            if metadataPattern.test(line) && classifyLabel(line) == .item { continue }
            builder.pending.append((line, i))
        }
        builder.flush()
        let rows = builder.rows

        // Summary rows.
        let firstSummaryLine = rows.filter { $0.kind == .subtotal || $0.kind == .total || $0.kind == .vat }
            .map(\.line).min() ?? Int.max
        let totalRow = rows.filter { $0.kind == .total && $0.minor > 0 }.stableSorted { a, b in
            let pa = totalPriority(a.label), pb = totalPriority(b.label)
            if pa != pb { return pa > pb }
            if a.minor != b.minor { return a.minor > b.minor }
            return a.line > b.line
        }.first
        let subtotalRow = rows.first { $0.kind == .subtotal && $0.minor > 0 }
        let vatRow = rows.first { $0.kind == .vat && $0.minor >= 0 }
        let charges = rows.filter { $0.kind == .charge }.reduce(0) { $0 + $1.minor }
            - rows.filter { $0.kind == .discount }.reduce(0) { $0 + abs($1.minor) }

        let lineItems = rows.filter { $0.kind == .item && $0.minor > 0 && $0.line < firstSummaryLine }.map { row in
            let (name, quantity) = splitQuantity(row.label)
            return ReceiptItem(name: titleCaseIfShouting(name).nonEmpty ?? "Item", quantity: quantity, priceMinor: row.minor)
        }
        let itemsSum = lineItems.reduce(0) { $0 + $1.priceMinor }

        var notes: [String] = []
        var baseConfidence = 0.95
        var vatMinor = vatRow?.minor ?? 0
        var totalMinor = totalRow?.minor ?? 0

        if totalMinor == 0 {
            baseConfidence -= 0.25
            if let subtotalRow {
                totalMinor = subtotalRow.minor + vatMinor + charges
            } else if itemsSum > 0 {
                totalMinor = itemsSum + vatMinor + charges
            } else {
                let all = (rows.map(\.minor) + builder.strayAmounts).filter { $0 > 0 }
                guard let largest = all.max() else { throw ReceiptScanError(unreadableMessage) }
                totalMinor = largest
            }
            notes.append("No TOTAL line found; total was inferred. Please verify.")
        }
        if totalMinor <= 0 { throw ReceiptScanError(unreadableMessage) }

        if vatRow == nil {
            let base = subtotalRow?.minor ?? 0
            let diff = totalMinor - base - charges
            // `diff <= total * 0.2` in integers.
            if base > 0 && diff >= 0 && diff * 5 <= totalMinor { vatMinor = diff } else { notes.append("VAT not itemised on the receipt.") }
            baseConfidence -= 0.05
        }
        if vatMinor >= totalMinor { vatMinor = 0 }

        let subtotalMinor = subtotalRow?.minor ?? (itemsSum > 0 ? itemsSum : max(0, totalMinor - vatMinor - charges))

        // Merchant + category.
        let merchantLine = lines.prefix(6).first { line in
            hasLetters(line) && findAmounts(line).isEmpty && !metadataPattern.test(line)
                && classifyLabel(line) == .item && nonLetters.replacing(in: line, with: "").jsLength >= 3
        }
        let merchant = merchantLine.map { titleCaseIfShouting(cleanLabel($0)) } ?? "Receipt"
        let category = groceryPattern.test(lines.joined(separator: "\n").lowercased()) ? "Groceries" : "Food and dining"

        let draft = ReceiptScanResult(subtotalMinor: subtotalMinor, vatMinor: vatMinor, totalMinor: totalMinor,
                                      lineItems: lineItems, chargesMinor: charges)
        let (confidence, warnings) = assess(draft, baseConfidence: baseConfidence)

        return ReceiptScanResult(
            merchantName: merchant, date: extractDate(lines, now: now), currency: "AED", trn: extractTrn(lines),
            subtotalMinor: subtotalMinor, vatMinor: vatMinor, totalMinor: totalMinor, category: category,
            lineItems: lineItems, chargesMinor: charges, confidence: confidence, warnings: warnings,
            notes: (["Scanned on-device with Apple Vision OCR. Check the items before saving."] + notes).joined(separator: " "),
            engine: "local_ocr")
    }
}
