import CoreBluetooth
import Foundation

@MainActor
final class SELightstickController: NSObject, ObservableObject {
    enum ConnectionState: String {
        case unavailable = "Bluetooth unavailable"
        case idle = "Ready to scan"
        case scanning = "Scanning"
        case connecting = "Connecting"
        case connected = "Connected"
        case failed = "Failed"
    }

    @Published private(set) var state: ConnectionState = .unavailable
    @Published private(set) var discoveredNames: [String] = []
    @Published private(set) var connectedName: String?
    @Published var statusMessage = "Waiting for Bluetooth."
    @Published var lastPacketHex = ""

    private var central: CBCentralManager!
    private var peripheral: CBPeripheral?
    private var writeCharacteristic: CBCharacteristic?
    private let profile: SEBluetoothProfile
    private let encoder: SEPacketEncoder

    override init() {
        do {
            let loaded = try SEBluetoothProfile.loadBundled()
            profile = loaded
            encoder = SEPacketEncoder(profile: loaded)
        } catch {
            let fallback = SEBluetoothProfile(
                deviceNamePrefixes: ["multiM", "BTS"],
                serviceUUID: "00010203-0405-0607-0809-0A0B0C0D1911",
                characteristicUUID: "00010203-0405-0607-0809-0A0B0C0D2B19",
                packetFormat: .fanlightNineByte,
                writeWithoutResponse: true,
                foldBrightnessIntoRGB: true
            )
            profile = fallback
            encoder = SEPacketEncoder(profile: fallback)
        }
        super.init()
        central = CBCentralManager(delegate: self, queue: nil)
    }

    func scan() {
        guard central.state == .poweredOn else {
            statusMessage = "Turn on Bluetooth first."
            return
        }
        discoveredNames.removeAll()
        state = .scanning
        statusMessage = "Scanning for \(profile.deviceNamePrefixes.joined(separator: ", "))…"
        central.scanForPeripherals(withServices: nil, options: [
            CBCentralManagerScanOptionAllowDuplicatesKey: false
        ])
    }

    func disconnect() {
        if let peripheral {
            central.cancelPeripheralConnection(peripheral)
        }
    }

    func send(frame: LightFrame) {
        guard state == .connected,
              let peripheral,
              let characteristic = writeCharacteristic else { return }

        let data = encoder.encode(frame)
        lastPacketHex = data.map { String(format: "%02X", $0) }.joined(separator: " ")
        let requestedType: CBCharacteristicWriteType = profile.writeWithoutResponse ? .withoutResponse : .withResponse
        let supportedType: CBCharacteristicWriteType
        if requestedType == .withoutResponse,
           characteristic.properties.contains(.writeWithoutResponse) {
            supportedType = .withoutResponse
        } else {
            supportedType = .withResponse
        }
        peripheral.writeValue(data, for: characteristic, type: supportedType)
    }

    func sendTestColor(_ frame: LightFrame) {
        send(frame: frame)
    }
}

extension SELightstickController: CBCentralManagerDelegate {
    nonisolated func centralManagerDidUpdateState(_ central: CBCentralManager) {
        Task { @MainActor in
            switch central.state {
            case .poweredOn:
                self.state = .idle
                self.statusMessage = "Bluetooth is ready."
            case .poweredOff:
                self.state = .unavailable
                self.statusMessage = "Bluetooth is off."
            case .unauthorized:
                self.state = .unavailable
                self.statusMessage = "Bluetooth permission was denied."
            default:
                self.state = .unavailable
                self.statusMessage = "Bluetooth is unavailable."
            }
        }
    }

    nonisolated func centralManager(
        _ central: CBCentralManager,
        didDiscover peripheral: CBPeripheral,
        advertisementData: [String: Any],
        rssi RSSI: NSNumber
    ) {
        let name = peripheral.name ?? (advertisementData[CBAdvertisementDataLocalNameKey] as? String) ?? "Unnamed"
        Task { @MainActor in
            if !self.discoveredNames.contains(name) {
                self.discoveredNames.append(name)
            }
            guard self.profile.deviceNamePrefixes.contains(where: { name.hasPrefix($0) }) else { return }
            central.stopScan()
            self.peripheral = peripheral
            peripheral.delegate = self
            self.state = .connecting
            self.statusMessage = "Connecting to \(name)…"
            central.connect(peripheral)
        }
    }

    nonisolated func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
        Task { @MainActor in
            self.statusMessage = "Discovering SE services…"
            self.connectedName = peripheral.name
            peripheral.discoverServices([self.profile.serviceCBUUID])
        }
    }

    nonisolated func centralManager(
        _ central: CBCentralManager,
        didFailToConnect peripheral: CBPeripheral,
        error: Error?
    ) {
        Task { @MainActor in
            self.state = .failed
            self.statusMessage = error?.localizedDescription ?? "Could not connect."
        }
    }

    nonisolated func centralManager(
        _ central: CBCentralManager,
        didDisconnectPeripheral peripheral: CBPeripheral,
        error: Error?
    ) {
        Task { @MainActor in
            self.state = .idle
            self.connectedName = nil
            self.writeCharacteristic = nil
            self.statusMessage = error == nil ? "Disconnected." : "Disconnected: \(error!.localizedDescription)"
        }
    }
}

extension SELightstickController: CBPeripheralDelegate {
    nonisolated func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
        if let error {
            Task { @MainActor in
                self.state = .failed
                self.statusMessage = "Service discovery failed: \(error.localizedDescription)"
            }
            return
        }

        let services = peripheral.services ?? []
        for service in services {
            peripheral.discoverCharacteristics([profile.characteristicCBUUID], for: service)
        }
    }

    nonisolated func peripheral(
        _ peripheral: CBPeripheral,
        didDiscoverCharacteristicsFor service: CBService,
        error: Error?
    ) {
        if let error {
            Task { @MainActor in
                self.state = .failed
                self.statusMessage = "Characteristic discovery failed: \(error.localizedDescription)"
            }
            return
        }

        guard let characteristic = service.characteristics?.first(where: {
            $0.uuid == profile.characteristicCBUUID
        }) else {
            Task { @MainActor in
                self.state = .failed
                self.statusMessage = "Configured write characteristic was not found. Update SEBluetoothProfile.json."
            }
            return
        }

        Task { @MainActor in
            self.writeCharacteristic = characteristic
            self.state = .connected
            self.statusMessage = "Connected and ready."
        }
    }
}
