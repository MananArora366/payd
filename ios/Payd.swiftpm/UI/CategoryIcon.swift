/// Lucide category icon names → SF Symbols (mirrors web/src/lib/icons.tsx:25-52).
enum CategoryIcon {
    static func symbol(forLucide name: String?) -> String {
        switch name {
        case "UtensilsCrossed": "fork.knife"
        case "ShoppingCart": "cart"
        case "Car": "car"
        case "ShoppingBag": "bag"
        case "Film": "film"
        case "Home": "house"
        case "Zap": "bolt"
        case "HeartPulse": "waveform.path.ecg"
        case "GraduationCap": "graduationcap"
        case "Plane": "airplane"
        case "Repeat": "repeat"
        default: "tag"
        }
    }
}
