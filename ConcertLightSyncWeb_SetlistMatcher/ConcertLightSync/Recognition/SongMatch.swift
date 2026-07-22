import Foundation

struct SongMatch: Sendable {
    let sequenceID: String
    let title: String
    let artist: String
    let currentReferenceOffset: TimeInterval
    let confidence: Float
    let frequencySkew: Float
}
