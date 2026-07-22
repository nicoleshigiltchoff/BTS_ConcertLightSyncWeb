import Foundation
import SwiftUI

struct LightFrame: Codable, Equatable, Sendable {
    let red: UInt8
    let green: UInt8
    let blue: UInt8
    let brightness: UInt8

    static let blackout = LightFrame(red: 0, green: 0, blue: 0, brightness: 0)

    var color: Color {
        Color(
            red: Double(red) / 255.0,
            green: Double(green) / 255.0,
            blue: Double(blue) / 255.0
        )
        .opacity(Double(brightness) / 255.0)
    }

    func scaledForBrightness() -> LightFrame {
        let scale = Double(brightness) / 255.0
        return LightFrame(
            red: UInt8((Double(red) * scale).rounded().clamped(to: 0...255)),
            green: UInt8((Double(green) * scale).rounded().clamped(to: 0...255)),
            blue: UInt8((Double(blue) * scale).rounded().clamped(to: 0...255)),
            brightness: brightness
        )
    }
}

private extension Double {
    func clamped(to range: ClosedRange<Double>) -> Double {
        min(max(self, range.lowerBound), range.upperBound)
    }
}
