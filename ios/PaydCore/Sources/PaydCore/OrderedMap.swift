import Foundation

/// An insertion-ordered dictionary: the Swift stand-in for the web's iterated `Record<string, …>`
/// objects and `Map`s, whose iteration order is observable (debt lists, preview rows, transfers).
/// Equality is order-sensitive.
public struct OrderedMap<Key: Hashable & Sendable, Value: Sendable>: Sendable, Sequence {
    public typealias Element = (key: Key, value: Value)

    public private(set) var keys: [Key]
    private var storage: [Key: Value]

    public init() {
        keys = []
        storage = [:]
    }

    /// Later duplicates overwrite the value but keep the first position (JS object assignment).
    public init(_ pairs: [(Key, Value)]) {
        self.init()
        for (key, value) in pairs { set(key, value) }
    }

    public var values: [Value] { keys.compactMap { storage[$0] } }
    public var count: Int { keys.count }
    public var isEmpty: Bool { keys.isEmpty }

    public subscript(key: Key) -> Value? { storage[key] }

    /// Appends when new, replaces in place when present.
    public func setting(_ key: Key, _ value: Value) -> OrderedMap {
        var copy = self
        copy.set(key, value)
        return copy
    }

    public func removing(_ key: Key) -> OrderedMap {
        guard storage[key] != nil else { return self }
        var copy = self
        copy.storage[key] = nil
        copy.keys.removeAll { $0 == key }
        return copy
    }

    public func mapValues<T>(_ transform: (Value) -> T) -> OrderedMap<Key, T> {
        OrderedMap<Key, T>(keys.compactMap { key in storage[key].map { (key, transform($0)) } })
    }

    public func makeIterator() -> IndexingIterator<[Element]> {
        keys.compactMap { key in storage[key].map { (key: key, value: $0) } }.makeIterator()
    }

    /// Local builder step used inside the pure algorithms (never on shared state).
    mutating func set(_ key: Key, _ value: Value) {
        if storage.updateValue(value, forKey: key) == nil { keys.append(key) }
    }
}

extension OrderedMap where Value == Int {
    /// `map[key] = (map[key] || 0) + delta`, keeping first-insertion order.
    mutating func add(_ key: Key, _ delta: Int) {
        set(key, (storage[key] ?? 0) + delta)
    }

    /// Sum of all values.
    var total: Int { values.reduce(0, +) }
}

extension OrderedMap: ExpressibleByDictionaryLiteral {
    public init(dictionaryLiteral elements: (Key, Value)...) {
        self.init(elements)
    }
}

extension OrderedMap: Equatable where Value: Equatable {
    public static func == (lhs: OrderedMap, rhs: OrderedMap) -> Bool {
        lhs.keys == rhs.keys && lhs.storage == rhs.storage
    }
}

extension OrderedMap: Hashable where Value: Hashable {
    public func hash(into hasher: inout Hasher) {
        for (key, value) in self {
            hasher.combine(key)
            hasher.combine(value)
        }
    }
}

extension OrderedMap: CustomStringConvertible {
    public var description: String {
        "[" + map { "\($0.key): \($0.value)" }.joined(separator: ", ") + "]"
    }
}

/// JSON object coding. Encoding writes keys in insertion order (PaydJSON sorts them anyway);
/// JSONDecoder does not expose source order, so decoded keys are sorted for determinism.
extension OrderedMap: Encodable where Key == String, Value: Encodable {
    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: DynamicCodingKey.self)
        for (key, value) in self {
            try container.encode(value, forKey: DynamicCodingKey(key))
        }
    }
}

extension OrderedMap: Decodable where Key == String, Value: Decodable {
    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: DynamicCodingKey.self)
        let sortedKeys = container.allKeys.map(\.stringValue).stableSorted(by: jsLess)
        var result = OrderedMap()
        for key in sortedKeys {
            result.set(key, try container.decode(Value.self, forKey: DynamicCodingKey(key)))
        }
        self = result
    }
}

/// String coding key for JSON objects with arbitrary keys.
struct DynamicCodingKey: CodingKey {
    let stringValue: String
    var intValue: Int? { nil }

    init(_ string: String) { stringValue = string }
    init?(stringValue: String) { self.stringValue = stringValue }
    init?(intValue: Int) { stringValue = String(intValue) }
}

/// userId -> minor units.
public typealias Shares = OrderedMap<String, Int>
/// debtor -> creditor -> amount (> 0).
public typealias PairwiseDebtMap = OrderedMap<String, OrderedMap<String, Int>>
