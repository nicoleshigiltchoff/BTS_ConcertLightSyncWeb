import Foundation

@MainActor
final class SequenceLibrary: ObservableObject {
    @Published private(set) var sequences: [LightingSequence] = []
    private(set) var manifestEntries: [SequenceManifestEntry] = []

    func loadBundledSequences() throws {
        guard let manifestURL = Bundle.main.url(forResource: "SequenceManifest", withExtension: "json") else {
            throw SequenceError.missingManifest
        }

        let decoder = JSONDecoder()
        let manifest = try decoder.decode(SequenceManifest.self, from: Data(contentsOf: manifestURL))
        var loaded: [LightingSequence] = []

        for entry in manifest.sequences {
            guard let url = Bundle.main.url(
                forResource: entry.sequenceFile.deletingPathExtension,
                withExtension: entry.sequenceFile.pathExtension,
                subdirectory: "Sequences"
            ) else {
                throw SequenceError.missingSequence(entry.sequenceFile)
            }
            let sequence = try decoder.decode(LightingSequence.self, from: Data(contentsOf: url))
            guard sequence.id == entry.id else {
                throw SequenceError.identifierMismatch(entry.id, sequence.id)
            }
            loaded.append(sequence)
        }

        manifestEntries = manifest.sequences
        sequences = loaded
    }

    func sequence(id: String) -> LightingSequence? {
        sequences.first { $0.id == id }
    }
}

enum SequenceError: LocalizedError {
    case missingManifest
    case missingSequence(String)
    case identifierMismatch(String, String)

    var errorDescription: String? {
        switch self {
        case .missingManifest: return "SequenceManifest.json is missing from the app bundle."
        case .missingSequence(let file): return "Missing sequence file: \(file)"
        case .identifierMismatch(let expected, let actual):
            return "Sequence ID mismatch. Expected \(expected), found \(actual)."
        }
    }
}

private extension String {
    var deletingPathExtension: String { (self as NSString).deletingPathExtension }
    var pathExtension: String { (self as NSString).pathExtension }
}
