export const BLE = {
  service: '00010203-0405-0607-0809-0a0b0c0d1911',
  characteristic: '00010203-0405-0607-0809-0a0b0c0d2b19',
  filters: [
    { name: 'BTS LIGHTSTICK_SE' },
    { name: 'multiM' },
    { name: 'BTS LIGHTSTICK3' }
  ]
};

// Increment this whenever fingerprint generation changes. Bundled repository
// audio is automatically re-indexed when its stored version is older.
export const FINGERPRINT_VERSION = 2;

export const AUDIO = {
  targetSampleRate: 11025,
  fftSize: 2048,
  hopSize: 512,
  minHz: 70,
  maxHz: 5000,
  peaksPerFrame: 8,
  fanout: 8,
  minPairFrames: 1,
  maxPairFrames: 28,
  timeQuantizationFrames: 2,
  // Ensure quieter mid/high-frequency material is represented instead of
  // allowing bass-heavy peaks to consume every slot.
  peakBandsHz: [70, 250, 700, 1600, 3200, 5000],
  peaksPerBand: 2
};

export const DB_NAME = 'concert-lightstick-sync-v5';
export const DB_VERSION = 1;
