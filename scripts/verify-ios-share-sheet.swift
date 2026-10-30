import Foundation
import Vision
import ImageIO
import CoreGraphics

// Test-only pixel verification for system sharing UI hosted outside the app's
// accessibility process. Never log recognized text or upload captured pixels.
func normalized(_ text: String) -> String {
    return String(text.lowercased().unicodeScalars.filter { CharacterSet.alphanumerics.contains($0) })
}

func recognizedLines(_ image: CGImage) throws -> [String] {
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.recognitionLanguages = ["en-US"]
    request.usesLanguageCorrection = false
    try VNImageRequestHandler(cgImage: image, options: [:]).perform([request])
    return (request.results ?? []).compactMap { $0.topCandidates(1).first?.string }
}

func checks(_ lines: [String], expectedName: String) -> [String: Bool] {
    let text = lines.map(normalized)
    let name = normalized(expectedName)
    return [
        "expected_revision_file": text.contains(name) || text.contains(name + "pdf"),
        "pdf_document": text.contains { $0.hasPrefix("pdfdocument") },
        "copy_action": text.contains("copy"),
        "save_to_files_action": text.contains("savetofiles"),
    ]
}

func matches(_ lines: [String], expectedName: String) -> Bool {
    return checks(lines, expectedName: expectedName).values.allSatisfy { $0 }
}

do {
    var args = Array(CommandLine.arguments.dropFirst())
    let controls = args.contains("--validate-controls")
    args.removeAll { $0 == "--validate-controls" }
    guard args.count == 4, args[0] == "--image", args[2] == "--expected-name",
          !args[3].isEmpty,
          let source = CGImageSourceCreateWithURL(URL(fileURLWithPath: args[1]) as CFURL, nil),
          let image = CGImageSourceCreateImageAtIndex(source, 0, nil) else {
        throw NSError(domain: "ShareSheetVerification", code: 1)
    }
    let lines = try recognizedLines(image)
    let result = checks(lines, expectedName: args[3])
    if controls {
        guard matches(lines, expectedName: args[3]),
              !matches(lines, expectedName: args[3] + "-incorrect-revision"),
              let cropped = image.cropping(to: CGRect(x: 0, y: 0, width: image.width, height: image.height / 3)),
              !matches(try recognizedLines(cropped), expectedName: args[3]),
              let blank = CGContext(data: nil, width: 320, height: 600,
                  bitsPerComponent: 8, bytesPerRow: 0, space: CGColorSpaceCreateDeviceRGB(),
                  bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else {
            throw NSError(domain: "ShareSheetControls", code: 1)
        }
        blank.setFillColor(CGColor(gray: 1, alpha: 1))
        blank.fill(CGRect(x: 0, y: 0, width: 320, height: 600))
        guard let blankImage = blank.makeImage(),
              !matches(try recognizedLines(blankImage), expectedName: args[3]) else {
            throw NSError(domain: "ShareSheetControls", code: 2)
        }
        print("SHARE_SHEET_POSITIVE_AND_NEGATIVE_CONTROLS=PASS")
    }
    print(String(data: try JSONSerialization.data(withJSONObject: result, options: [.sortedKeys]), encoding: .utf8)!)
    exit(result.values.allSatisfy { $0 } ? 0 : 2)
} catch {
    // No image path, OCR content, invoice value or provider data in logs.
    fputs("SHARE_SHEET_VERIFICATION_ERROR\n", stderr)
    exit(1)
}
