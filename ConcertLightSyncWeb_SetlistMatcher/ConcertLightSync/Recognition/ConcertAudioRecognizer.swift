import AVFAudio
import AVFoundation
import Foundation
import ShazamKit

@MainActor
final class ConcertAudioRecognizer: NSObject, ObservableObject {
    @Published var isListening = false
    @Published var statusMessage = "Preparing catalog…"
    @Published var lastMatch: SongMatch?
    @Published var inputLevel: Float = 0

    var onMatch: ((SongMatch) -> Void)?

    private let audioEngine = AVAudioEngine()
    private var session: SHSession?
    private var sequenceIDByTitle: [String: String] = [:]
    private var lastAcceptedAt: Date = .distantPast
    private var lastAcceptedSequenceID: String?

    func prepareCatalog(using entries: [SequenceManifestEntry]) async throws {
        guard !entries.isEmpty else {
            throw RecognizerError.emptyManifest
        }

        let catalog = SHCustomCatalog()
        sequenceIDByTitle.removeAll()

        for entry in entries {
            guard let audioURL = Bundle.main.url(
                forResource: entry.referenceAudioFile.deletingPathExtension,
                withExtension: entry.referenceAudioFile.pathExtension,
                subdirectory: "ReferenceAudio"
            ) else {
                throw RecognizerError.missingAudio(entry.referenceAudioFile)
            }

            let signature = try await SHSignatureGenerator.signature(from: AVURLAsset(url: audioURL))
            let mediaItem = SHMediaItem(properties: [
                .title: entry.title,
                .artist: entry.artist,
                .subtitle: entry.id
            ])
            try catalog.addReferenceSignature(signature, representing: [mediaItem])
            sequenceIDByTitle[entry.title] = entry.id
        }

        let newSession = SHSession(catalog: catalog)
        newSession.delegate = self
        session = newSession
        statusMessage = "Ready to listen."
    }

    func startListening() async throws {
        guard session != nil else { throw RecognizerError.catalogNotPrepared }
        guard !isListening else { return }

        let permission = await requestMicrophonePermission()
        guard permission else { throw RecognizerError.microphoneDenied }

        let audioSession = AVAudioSession.sharedInstance()
        try audioSession.setCategory(.record, mode: .measurement, options: [.allowBluetoothHFP])
        try audioSession.setActive(true, options: .notifyOthersOnDeactivation)

        let input = audioEngine.inputNode
        let format = input.outputFormat(forBus: 0)
        guard format.sampleRate > 0, format.channelCount > 0 else {
            throw RecognizerError.invalidAudioFormat
        }

        input.installTap(onBus: 0, bufferSize: 4096, format: format) { [weak self] buffer, time in
            guard let self else { return }
            let level = Self.rmsLevel(buffer)
            Task { @MainActor in self.inputLevel = level }
            self.session?.matchStreamingBuffer(buffer, at: time)
        }

        audioEngine.prepare()
        try audioEngine.start()
        isListening = true
        statusMessage = "Listening for a programmed song…"
    }

    func stopListening() {
        guard isListening else { return }
        audioEngine.inputNode.removeTap(onBus: 0)
        audioEngine.stop()
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        isListening = false
        statusMessage = "Stopped."
    }

    private func requestMicrophonePermission() async -> Bool {
        await withCheckedContinuation { continuation in
            AVAudioSession.sharedInstance().requestRecordPermission { granted in
                continuation.resume(returning: granted)
            }
        }
    }

    private static func rmsLevel(_ buffer: AVAudioPCMBuffer) -> Float {
        guard let data = buffer.floatChannelData?[0] else { return 0 }
        let frameLength = Int(buffer.frameLength)
        guard frameLength > 0 else { return 0 }
        var sum: Float = 0
        for index in 0..<frameLength {
            let sample = data[index]
            sum += sample * sample
        }
        return min(1, sqrt(sum / Float(frameLength)) * 8)
    }
}

extension ConcertAudioRecognizer: SHSessionDelegate {
    nonisolated func session(_ session: SHSession, didFind match: SHMatch) {
        guard let item = match.mediaItems.first else { return }
        let title = item.title ?? "Unknown"
        let sequenceID = item.subtitle ?? ""
        let result = SongMatch(
            sequenceID: sequenceID,
            title: title,
            artist: item.artist ?? "",
            currentReferenceOffset: item.predictedCurrentMatchOffset,
            confidence: item.confidence,
            frequencySkew: item.frequencySkew
        )

        Task { @MainActor in
            let now = Date()
            let sameSequence = self.lastAcceptedSequenceID == sequenceID
            let recentlyAccepted = now.timeIntervalSince(self.lastAcceptedAt) < 1.0
            if sameSequence && recentlyAccepted { return }

            self.lastAcceptedAt = now
            self.lastAcceptedSequenceID = sequenceID
            self.lastMatch = result
            self.statusMessage = String(
                format: "Matched %@ at %.2f s (confidence %.2f)",
                title,
                result.currentReferenceOffset,
                result.confidence
            )
            self.onMatch?(result)
        }
    }

    nonisolated func session(_ session: SHSession, didNotFindMatchFor signature: SHSignature, error: Error?) {
        guard let error else { return }
        Task { @MainActor in
            self.statusMessage = "No match yet: \(error.localizedDescription)"
        }
    }
}

enum RecognizerError: LocalizedError {
    case emptyManifest
    case missingAudio(String)
    case catalogNotPrepared
    case microphoneDenied
    case invalidAudioFormat

    var errorDescription: String? {
        switch self {
        case .emptyManifest: return "SequenceManifest.json contains no sequences."
        case .missingAudio(let file): return "Missing reference audio file: \(file)"
        case .catalogNotPrepared: return "The Shazam custom catalog has not been prepared."
        case .microphoneDenied: return "Microphone access was denied. Enable it in iPhone Settings."
        case .invalidAudioFormat: return "The microphone returned an invalid audio format."
        }
    }
}

private extension String {
    var deletingPathExtension: String { (self as NSString).deletingPathExtension }
    var pathExtension: String { (self as NSString).pathExtension }
}
