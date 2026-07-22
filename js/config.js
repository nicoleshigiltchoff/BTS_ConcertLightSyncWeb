export const BLE = {
  service: '00010203-0405-0607-0809-0a0b0c0d1911',
  characteristic: '00010203-0405-0607-0809-0a0b0c0d2b19',
  filters: [
    { name: 'BTS LIGHTSTICK_SE' },
    { name: 'multiM' },
    { name: 'BTS LIGHTSTICK3' }
  ]
};

export const AUDIO = {
  targetSampleRate: 11025,
  fftSize: 2048,
  hopSize: 512,
  minHz: 90,
  maxHz: 5000,
  peaksPerFrame: 5,
  fanout: 6,
  minPairFrames: 1,
  maxPairFrames: 24,
  timeQuantizationFrames: 2
};

export const DB_NAME = 'concert-lightstick-sync-v1';
export const DB_VERSION = 1;
