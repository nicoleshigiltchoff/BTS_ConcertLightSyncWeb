import Foundation

struct LightingSequence: Codable, Identifiable, Sendable {
    let id: String
    let title: String
    let artist: String
    let referenceAudioFile: String
    let referenceStartOffset: TimeInterval
    let duration: TimeInterval
    let cues: [LightCue]

    func frame(at time: TimeInterval) -> LightFrame {
        guard !cues.isEmpty else { return .blackout }
        let applicable = cues.last { $0.time <= time }
        return applicable?.frame ?? .blackout
    }
}

struct LightCue: Codable, Equatable, Sendable {
    let time: TimeInterval
    let frame: LightFrame
}

struct SequenceManifest: Codable, Sendable {
    let sequences: [SequenceManifestEntry]
}

struct SequenceManifestEntry: Codable, Identifiable, Sendable {
    let id: String
    let title: String
    let artist: String
    let referenceAudioFile: String
    let sequenceFile: String
}
