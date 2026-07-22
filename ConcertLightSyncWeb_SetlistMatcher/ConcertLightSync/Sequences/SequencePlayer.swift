import Foundation

@MainActor
final class SequencePlayer: ObservableObject {
    @Published private(set) var activeSequence: LightingSequence?
    @Published private(set) var currentTime: TimeInterval = 0
    @Published private(set) var currentFrame: LightFrame = .blackout
    @Published private(set) var synchronizationError: TimeInterval = 0

    var onFrame: ((LightFrame) -> Void)?

    private var timer: Timer?
    private var anchorDate: Date?
    private var anchorSequenceTime: TimeInterval = 0
    private var lastSentFrame: LightFrame?

    func synchronize(sequence: LightingSequence, to recognizedTime: TimeInterval, confidence: Float) {
        let estimated = estimatedSequenceTime
        let isSameSequence = activeSequence?.id == sequence.id

        if !isSameSequence {
            activate(sequence: sequence, at: recognizedTime)
            return
        }

        let error = recognizedTime - estimated
        synchronizationError = error

        if abs(error) >= 0.75 {
            anchorDate = Date()
            anchorSequenceTime = recognizedTime
        } else if abs(error) >= 0.25 {
            // Apply half of a small correction to avoid visible jitter.
            anchorDate = Date()
            anchorSequenceTime = estimated + (error * 0.5)
        }
    }

    func activate(sequence: LightingSequence, at time: TimeInterval) {
        activeSequence = sequence
        anchorDate = Date()
        anchorSequenceTime = max(0, time)
        startTimer()
        tick()
    }

    func stop() {
        timer?.invalidate()
        timer = nil
        activeSequence = nil
        currentTime = 0
        currentFrame = .blackout
        lastSentFrame = nil
        onFrame?(.blackout)
    }

    private var estimatedSequenceTime: TimeInterval {
        guard let anchorDate else { return anchorSequenceTime }
        return anchorSequenceTime + Date().timeIntervalSince(anchorDate)
    }

    private func startTimer() {
        timer?.invalidate()
        timer = Timer.scheduledTimer(withTimeInterval: 1.0 / 20.0, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.tick() }
        }
    }

    private func tick() {
        guard let sequence = activeSequence else { return }
        let time = estimatedSequenceTime
        currentTime = time

        guard time <= sequence.duration else {
            stop()
            return
        }

        let frame = sequence.frame(at: time)
        currentFrame = frame
        if frame != lastSentFrame {
            lastSentFrame = frame
            onFrame?(frame)
        }
    }
}
