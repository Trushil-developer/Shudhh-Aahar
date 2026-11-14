// scripts/clean-product-image.swift
// Turns a phone photo of a product into a clean shop packshot: lifts the
// product off its background with Apple's Vision subject-lifting, then
// centres it on a pure-white square with even padding. Runs locally on
// macOS 14+; no third-party service or model download.
//
// Usage: swift scripts/clean-product-image.swift <input> <output.jpg> [size]
// Exit code 2 = no subject found (the original is fitted on white instead).

import AppKit
import CoreImage
import CoreImage.CIFilterBuiltins
import Foundation
import Vision

let args = CommandLine.arguments
guard args.count >= 3 else {
  FileHandle.standardError.write("usage: clean-product-image <input> <output.jpg> [size]\n".data(using: .utf8)!)
  exit(1)
}
let inputURL = URL(fileURLWithPath: args[1])
let outputURL = URL(fileURLWithPath: args[2])
let canvasSize = CGFloat(args.count > 3 ? Double(args[3]) ?? 1000 : 1000)
let fill: CGFloat = 0.86 // product occupies 86% of the longer side

guard let source = CIImage(contentsOf: inputURL, options: [.applyOrientationProperty: true]) else {
  FileHandle.standardError.write("cannot read \(inputURL.path)\n".data(using: .utf8)!)
  exit(1)
}

// Cut out the product; fall back to the whole photo if Vision finds nothing.
var subject = source
var foundSubject = false
let handler = VNImageRequestHandler(ciImage: source)
let request = VNGenerateForegroundInstanceMaskRequest()
do {
  try handler.perform([request])
  if let result = request.results?.first, !result.allInstances.isEmpty {
    let masked = try result.generateMaskedImage(ofInstances: result.allInstances, from: handler, croppedToInstancesExtent: true)
    subject = CIImage(cvPixelBuffer: masked)
    foundSubject = true
  }
} catch {
  FileHandle.standardError.write("vision failed: \(error)\n".data(using: .utf8)!)
}

// Scale to fit the padded box (Lanczos also upscales small photos smoothly).
let extent = subject.extent
let scale = (canvasSize * fill) / max(extent.width, extent.height)
let scaler = CIFilter.lanczosScaleTransform()
scaler.inputImage = subject.transformed(by: CGAffineTransform(translationX: -extent.minX, y: -extent.minY))
scaler.scale = Float(scale)
scaler.aspectRatio = 1
let scaled = scaler.outputImage!
let dx = (canvasSize - scaled.extent.width) / 2
let dy = (canvasSize - scaled.extent.height) / 2
let placed = scaled.transformed(by: CGAffineTransform(translationX: dx, y: dy))

let canvas = CGRect(x: 0, y: 0, width: canvasSize, height: canvasSize)
let white = CIImage(color: .white).cropped(to: canvas)
let composed = placed.composited(over: white).cropped(to: canvas)

let context = CIContext()
let srgb = CGColorSpace(name: CGColorSpace.sRGB)!
guard let jpeg = context.jpegRepresentation(of: composed, colorSpace: srgb, options: [kCGImageDestinationLossyCompressionQuality as CIImageRepresentationOption: 0.88]) else {
  FileHandle.standardError.write("cannot encode jpeg\n".data(using: .utf8)!)
  exit(1)
}
try jpeg.write(to: outputURL)
exit(foundSubject ? 0 : 2)
