import Foundation
import Vision
import AppKit

guard CommandLine.arguments.count > 1 else {
    fputs("Usage: payd-ocr <image_path>\n", stderr)
    exit(1)
}

let imagePath = CommandLine.arguments[1]
let url = URL(fileURLWithPath: imagePath)

guard let imageSource = CGImageSourceCreateWithURL(url as CFURL, nil),
      let cgImage = CGImageSourceCreateImageAtIndex(imageSource, 0, nil) else {
    fputs("Failed to load image at \(imagePath)\n", stderr)
    exit(1)
}

// Try recognizing with native orientation detection
func recognize(image: CGImage, orientation: CGImagePropertyOrientation = .up) -> [String] {
    var lines: [String] = []
    let request = VNRecognizeTextRequest { req, _ in
        guard let observations = req.results as? [VNRecognizedTextObservation] else { return }
        for obs in observations {
            if let candidate = obs.topCandidates(1).first {
                lines.append(candidate.string)
            }
        }
    }
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = true
    request.automaticallyDetectsLanguage = true
    
    let handler = VNImageRequestHandler(cgImage: image, orientation: orientation, options: [:])
    try? handler.perform([request])
    return lines
}

// Check EXIF orientation or try orientations to pick the one with most recognized words
var bestLines = recognize(image: cgImage, orientation: .up)

// If standard orientation has very few lines or looks sideways, test other orientations
if bestLines.count < 5 {
    for orientation in [CGImagePropertyOrientation.right, .down, .left] {
        let candidateLines = recognize(image: cgImage, orientation: orientation)
        if candidateLines.count > bestLines.count {
            bestLines = candidateLines
        }
    }
}

let json = try JSONSerialization.data(withJSONObject: ["lines": bestLines], options: [.prettyPrinted])
if let str = String(data: json, encoding: .utf8) {
    print(str)
}
