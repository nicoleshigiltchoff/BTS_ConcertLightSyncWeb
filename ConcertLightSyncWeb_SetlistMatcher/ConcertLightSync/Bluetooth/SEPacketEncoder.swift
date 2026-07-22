import Foundation

struct SEPacketEncoder {
    let profile: SEBluetoothProfile

    func encode(_ input: LightFrame) -> Data {
        let frame = profile.foldBrightnessIntoRGB ? input.scaledForBrightness() : input

        switch profile.packetFormat {
        case .fanlightNineByte:
            // Candidate FANLIGHT packet documented by community projects.
            // Verify this against your SE before concert use.
            var bytes: [UInt8] = [
                0x01, 0xFF, 0x00,
                frame.red, frame.green, frame.blue,
                0x00, 0x00, 0x00
            ]
            bytes[8] = bytes[2...7].reduce(UInt8(0)) { UInt8((UInt16($0) + UInt16($1)) & 0xFF) }
            return Data(bytes)

        case .rawRGB:
            return Data([frame.red, frame.green, frame.blue])

        case .rawRGBBrightness:
            return Data([frame.red, frame.green, frame.blue, frame.brightness])
        }
    }
}
