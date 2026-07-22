import CoreBluetooth
import Foundation

struct SEBluetoothProfile: Codable, Sendable {
    let deviceNamePrefixes: [String]
    let serviceUUID: String
    let characteristicUUID: String
    let packetFormat: PacketFormat
    let writeWithoutResponse: Bool
    let foldBrightnessIntoRGB: Bool

    enum PacketFormat: String, Codable, Sendable {
        case fanlightNineByte
        case rawRGB
        case rawRGBBrightness
    }

    static func loadBundled() throws -> SEBluetoothProfile {
        guard let url = Bundle.main.url(forResource: "SEBluetoothProfile", withExtension: "json") else {
            throw BluetoothProfileError.missingProfile
        }
        return try JSONDecoder().decode(SEBluetoothProfile.self, from: Data(contentsOf: url))
    }

    var serviceCBUUID: CBUUID { CBUUID(string: serviceUUID) }
    var characteristicCBUUID: CBUUID { CBUUID(string: characteristicUUID) }
}

enum BluetoothProfileError: LocalizedError {
    case missingProfile

    var errorDescription: String? {
        "SEBluetoothProfile.json is missing."
    }
}
