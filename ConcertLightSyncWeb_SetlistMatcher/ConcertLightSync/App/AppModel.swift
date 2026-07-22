import Foundation
import SwiftUI

@MainActor
final class AppModel: ObservableObject {
    let sequenceLibrary = SequenceLibrary()
    let bluetooth = SELightstickController()
    let recognizer = ConcertAudioRecognizer()
    let player = SequencePlayer()

    @Published var isPrepared = false
    @Published var preparationError: String?
    @Published var autoSendToLightstick = true

    init() {
        recognizer.onMatch = { [weak self] match in
            Task { @MainActor in
                self?.handle(match: match)
            }
        }

        player.onFrame = { [weak self] frame in
            Task { @MainActor in
                guard let self else { return }
                if self.autoSendToLightstick {
                    self.bluetooth.send(frame: frame)
                }
            }
        }
    }

    func prepare() async {
        do {
            try sequenceLibrary.loadBundledSequences()
            try await recognizer.prepareCatalog(using: sequenceLibrary.manifestEntries)
            isPrepared = true
            preparationError = nil
        } catch {
            isPrepared = false
            preparationError = error.localizedDescription
        }
    }

    func startListening() async {
        guard isPrepared else { return }
        do {
            try await recognizer.startListening()
        } catch {
            preparationError = error.localizedDescription
        }
    }

    func stopListening() {
        recognizer.stopListening()
        player.stop()
    }

    private func handle(match: SongMatch) {
        guard let sequence = sequenceLibrary.sequence(id: match.sequenceID) else {
            recognizer.statusMessage = "Matched \(match.title), but no sequence JSON was found."
            return
        }

        let sequenceTime = match.currentReferenceOffset - sequence.referenceStartOffset
        guard sequenceTime >= 0, sequenceTime <= sequence.duration else {
            recognizer.statusMessage = "Matched \(match.title), outside the programmed sequence range."
            return
        }

        player.synchronize(
            sequence: sequence,
            to: sequenceTime,
            confidence: match.confidence
        )
    }
}
