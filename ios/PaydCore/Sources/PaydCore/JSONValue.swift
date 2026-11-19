import Foundation

/// Any JSON value. Used for audit `before`/`after`, Careem `raw`, MCP bodies and query contexts.
/// Numbers are `Decimal`, so integers stay exact. Object equality ignores key order.
public enum JSONValue: Codable, Sendable, Hashable {
    case null
    case bool(Bool)
    case number(Decimal)
    case string(String)
    case array([JSONValue])
    case object(OrderedMap<String, JSONValue>)

    /// Encodes `value` with `PaydJSON.encoder` and reads it back as a JSONValue.
    public init(encoding value: some Encodable) throws {
        let data = try PaydJSON.encoder.encode(value)
        self = try PaydJSON.decoder.decode(JSONValue.self, from: data)
    }

    /// Parses JSON text (`JSON.parse`); nil when it is not valid JSON.
    public static func parse(_ data: Data) -> JSONValue? {
        try? PaydJSON.decoder.decode(JSONValue.self, from: data)
    }

    public init(from decoder: Decoder) throws {
        if var array = try? decoder.unkeyedContainer() {
            var items: [JSONValue] = []
            while !array.isAtEnd { items.append(try array.decode(JSONValue.self)) }
            self = .array(items)
            return
        }
        if (try? decoder.container(keyedBy: DynamicCodingKey.self)) != nil {
            self = .object(try OrderedMap<String, JSONValue>(from: decoder))
            return
        }
        let container = try decoder.singleValueContainer()
        if container.decodeNil() {
            self = .null
        } else if let bool = try? container.decode(Bool.self) {
            self = .bool(bool)
        } else if let int = try? container.decode(Int.self) {
            self = .number(Decimal(int))
        } else if let double = try? container.decode(Double.self) {
            // Shortest round-trip text, i.e. the JS number the web would see.
            self = .number(Decimal(string: "\(double)") ?? Decimal(double))
        } else {
            self = .string(try container.decode(String.self))
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .null: try container.encodeNil()
        case let .bool(value): try container.encode(value)
        case let .number(value): try container.encode(value)
        case let .string(value): try container.encode(value)
        case let .array(value): try container.encode(value)
        case let .object(value): try container.encode(value)
        }
    }

    public static func == (lhs: JSONValue, rhs: JSONValue) -> Bool {
        switch (lhs, rhs) {
        case (.null, .null): return true
        case let (.bool(a), .bool(b)): return a == b
        case let (.number(a), .number(b)): return a == b
        case let (.string(a), .string(b)): return a == b
        case let (.array(a), .array(b)): return a == b
        case let (.object(a), .object(b)):
            return a.count == b.count && a.allSatisfy { b[$0.key] == $0.value }
        default: return false
        }
    }

    public func hash(into hasher: inout Hasher) {
        switch self {
        case .null: hasher.combine(0)
        case let .bool(value): hasher.combine(value)
        case let .number(value): hasher.combine(value)
        case let .string(value): hasher.combine(value)
        case let .array(value): hasher.combine(value)
        case let .object(value):
            for key in value.keys.sorted() {
                hasher.combine(key)
                hasher.combine(value[key])
            }
        }
    }

    // MARK: Lookup

    public subscript(key: String) -> JSONValue? {
        if case let .object(map) = self { return map[key] }
        return nil
    }

    public subscript(index: Int) -> JSONValue? {
        if case let .array(items) = self, items.indices.contains(index) { return items[index] }
        return nil
    }

    public var stringValue: String? {
        if case let .string(value) = self { return value }
        return nil
    }

    /// The integer value of a whole number that fits in Int; nil otherwise.
    public var intValue: Int? {
        guard case let .number(value) = self else { return nil }
        var source = value
        var rounded = Decimal()
        NSDecimalRound(&rounded, &source, 0, .plain)
        guard rounded == value, abs(value) <= Decimal(Int.max) else { return nil }
        return NSDecimalNumber(decimal: value).intValue
    }

    public var boolValue: Bool? {
        if case let .bool(value) = self { return value }
        return nil
    }

    public var arrayValue: [JSONValue]? {
        if case let .array(items) = self { return items }
        return nil
    }

    /// JS truthiness.
    public var isTruthy: Bool {
        switch self {
        case .null: return false
        case let .bool(value): return value
        case let .number(value): return value != 0
        case let .string(value): return !value.isEmpty
        case .array, .object: return true
        }
    }

    /// JS `String(value)`.
    public var jsString: String {
        switch self {
        case .null: return "null"
        case let .bool(value): return value ? "true" : "false"
        case let .number(value): return PaydMath.jsNumberString(value)
        case let .string(value): return value
        case let .array(items): return items.map { $0 == .null ? "" : $0.jsString }.joined(separator: ",")
        case .object: return "[object Object]"
        }
    }

    /// Decodes this value into `type` (round-trips through PaydJSON).
    public func decode<T: Decodable>(_ type: T.Type) throws -> T {
        try PaydJSON.decoder.decode(type, from: PaydJSON.encoder.encode(self))
    }
}

extension JSONValue: ExpressibleByStringLiteral, ExpressibleByIntegerLiteral, ExpressibleByBooleanLiteral,
    ExpressibleByArrayLiteral, ExpressibleByDictionaryLiteral, ExpressibleByNilLiteral {
    public init(stringLiteral value: String) { self = .string(value) }
    public init(integerLiteral value: Int) { self = .number(Decimal(value)) }
    public init(booleanLiteral value: Bool) { self = .bool(value) }
    public init(arrayLiteral elements: JSONValue...) { self = .array(elements) }
    public init(dictionaryLiteral elements: (String, JSONValue)...) { self = .object(OrderedMap(elements)) }
    public init(nilLiteral: ()) { self = .null }
}
