import SwiftUI

struct ContentView: View {
    @EnvironmentObject private var app: AppModel

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 18) {
                    recognitionCard
                    playbackCard
                    bluetoothCard
                    testCard
                }
                .padding()
            }
            .navigationTitle("Concert Light Sync")
            .task {
                if !app.isPrepared {
                    await app.prepare()
                }
            }
        }
    }

    private var recognitionCard: some View {
        GroupBox("Song recognition") {
            VStack(alignment: .leading, spacing: 12) {
                Text(app.preparationError ?? app.recognizer.statusMessage)
                    .font(.callout)

                ProgressView(value: Double(app.recognizer.inputLevel))

                if let match = app.recognizer.lastMatch {
                    LabeledContent("Song", value: match.title)
                    LabeledContent("Reference time", value: String(format: "%.2f s", match.currentReferenceOffset))
                    LabeledContent("Confidence", value: String(format: "%.2f", match.confidence))
                    LabeledContent("Frequency skew", value: String(format: "%.4f", match.frequencySkew))
                }

                HStack {
                    Button(app.recognizer.isListening ? "Stop listening" : "Start listening") {
                        Task {
                            if app.recognizer.isListening {
                                app.stopListening()
                            } else {
                                await app.startListening()
                            }
                        }
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(!app.isPrepared)

                    Button("Rebuild catalog") {
                        Task { await app.prepare() }
                    }
                    .buttonStyle(.bordered)
                }
            }
        }
    }

    private var playbackCard: some View {
        GroupBox("Active sequence") {
            VStack(alignment: .leading, spacing: 12) {
                if let sequence = app.player.activeSequence {
                    LabeledContent("Sequence", value: sequence.title)
                    LabeledContent("Position", value: String(format: "%.2f / %.2f s", app.player.currentTime, sequence.duration))
                    LabeledContent("Last correction", value: String(format: "%+.3f s", app.player.synchronizationError))
                } else {
                    Text("No sequence is playing.")
                        .foregroundStyle(.secondary)
                }

                RoundedRectangle(cornerRadius: 16)
                    .fill(app.player.currentFrame.color)
                    .frame(height: 110)
                    .overlay {
                        Text("RGB \(app.player.currentFrame.red), \(app.player.currentFrame.green), \(app.player.currentFrame.blue)  •  B \(app.player.currentFrame.brightness)")
                            .padding(8)
                            .background(.thinMaterial, in: Capsule())
                    }

                Toggle("Send sequence to lightstick", isOn: $app.autoSendToLightstick)
            }
        }
    }

    private var bluetoothCard: some View {
        GroupBox("SE lightstick") {
            VStack(alignment: .leading, spacing: 12) {
                LabeledContent("State", value: app.bluetooth.state.rawValue)
                Text(app.bluetooth.statusMessage)
                    .font(.callout)
                if !app.bluetooth.lastPacketHex.isEmpty {
                    Text("Last packet: \(app.bluetooth.lastPacketHex)")
                        .font(.caption.monospaced())
                        .textSelection(.enabled)
                }

                HStack {
                    Button("Scan and connect") { app.bluetooth.scan() }
                        .buttonStyle(.borderedProminent)
                    Button("Disconnect") { app.bluetooth.disconnect() }
                        .buttonStyle(.bordered)
                }

                if !app.bluetooth.discoveredNames.isEmpty {
                    Text("Seen: \(app.bluetooth.discoveredNames.joined(separator: ", "))")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
        }
    }

    private var testCard: some View {
        GroupBox("Manual BLE test") {
            HStack {
                testButton("Red", .init(red: 255, green: 0, blue: 0, brightness: 255))
                testButton("Green", .init(red: 0, green: 255, blue: 0, brightness: 255))
                testButton("Blue", .init(red: 0, green: 0, blue: 255, brightness: 255))
                testButton("Off", .blackout)
            }
        }
    }

    private func testButton(_ title: String, _ frame: LightFrame) -> some View {
        Button(title) { app.bluetooth.sendTestColor(frame) }
            .buttonStyle(.bordered)
    }
}
