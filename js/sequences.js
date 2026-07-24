const FADE_MATCH_TOLERANCE_SECONDS = 0.075;
const DEFAULT_FRAME_INTERVAL_MS = 50;

export function normalizeSequence(raw, fileName = 'sequence.json') {
  const root = raw.sequence || raw.data || raw;
  const source =
    root.commands ||
    root.cues ||
    root.events ||
    root.timeline ||
    root.sequenceData ||
    root.clips ||
    [];

  if (!Array.isArray(source)) {
    throw new Error('No commands/cues/events/timeline/clips array found.');
  }

  const isBoraWaves =
    raw.format === 'bora-waves-sequence' || Array.isArray(root.clips);

  const cues = isBoraWaves
    ? normalizeBoraWavesClips(source)
    : source
        .map((cue, index) => normalizeCue(cue, index))
        .filter(Boolean)
        .sort((a, b) => a.time - b.time);

  if (!cues.length) {
    throw new Error('No usable color cues found.');
  }

  return {
    id: String(root.id || `${slug(fileName.replace(/\.json$/i, ''))}-${Date.now()}`),
    title: String(root.title || root.name || fileName.replace(/\.json$/i, '')),
    songKey: String(
      root.songKey ||
        root.song ||
        root.audioFile ||
        root.audio ||
        root.video_id ||
        ''
    ),
    sourceFile: fileName,
    offset: finiteNumber(root.offset ?? root.startOffset, 0),
    cues
  };
}

function normalizeBoraWavesClips(clips) {
  const sorted = [...clips].sort((a, b) => {
    const timeDifference = finiteNumber(a.start, 0) - finiteNumber(b.start, 0);
    if (timeDifference !== 0) return timeDifference;
    // Process mode metadata before a color occurring at exactly the same time.
    return String(a.trackId).toLowerCase() === 'mode' ? -1 : 1;
  });

  const colorClips = sorted
    .filter((clip) => String(clip.trackId || '').toLowerCase() === 'color')
    .map((clip, index) => {
      const color = normalizeColor(clip.data?.color);
      const time = Number(clip.start);
      if (!color || !Number.isFinite(time)) return null;

      return {
        time,
        color,
        brightness: normalizeBrightness(clip.data?.brightness ?? 1),
        duration: Math.max(0, finiteNumber(clip.duration, 0)),
        mode: 'solid',
        fadeDuration: 0,
        fadeStart: null,
        sourceId: clip.id || `color-${index + 1}`,
        label: color
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.time - b.time);

  const modeClips = sorted.filter(
    (clip) => String(clip.trackId || '').toLowerCase() === 'mode'
  );

  for (const clip of modeClips) {
    const type = String(clip.data?.type || clip.data?.mode || '').toLowerCase();
    if (type !== 'fade') continue;

    const fadeStart = Number(clip.start);
    const fadeDuration = Math.max(0, finiteNumber(clip.duration, 0));
    if (!Number.isFinite(fadeStart) || fadeDuration <= 0) continue;

    const expectedTargetTime = fadeStart + fadeDuration;
    let target = colorClips.find(
      (cue) => Math.abs(cue.time - expectedTargetTime) <= FADE_MATCH_TOLERANCE_SECONDS
    );

    // Be tolerant of hand-authored sheets whose target starts shortly after the
    // nominal fade end, while never attaching a fade to a preceding color.
    if (!target) {
      target = colorClips.find((cue) => cue.time >= fadeStart - 0.001);
    }

    if (!target) continue;

    target.mode = 'fade';
    target.fadeStart = fadeStart;
    target.fadeDuration = Math.max(0, target.time - fadeStart) || fadeDuration;
    target.label = `fade Â· ${target.color}`;
  }

  return colorClips;
}

function normalizeCue(cue, index) {
  let time =
    cue.time ??
    cue.timestamp ??
    cue.at ??
    cue.start ??
    cue.startTime ??
    cue.timeSeconds;

  if (time == null && cue.timeMs != null) time = Number(cue.timeMs) / 1000;
  if (time == null && cue.timestampMs != null) {
    time = Number(cue.timestampMs) / 1000;
  }

  time = Number(time);
  if (!Number.isFinite(time)) return null;

  const nestedData = cue.data || {};
  const color = normalizeColor(
    cue.color ??
      cue.hexColor ??
      cue.hex ??
      cue.rgb ??
      nestedData.color ??
      nestedData.hexColor ??
      nestedData.hex ??
      nestedData.rgb
  );

  if (!color) return null;

  const mode = String(
    cue.effect || cue.mode || nestedData.type || nestedData.mode || 'solid'
  ).toLowerCase();

  const explicitFadeDuration = finiteNumber(
    cue.fadeDuration ?? cue.transitionDuration ?? nestedData.fadeDuration,
    0
  );

  return {
    time,
    color,
    brightness: normalizeBrightness(
      cue.brightness ??
        cue.intensity ??
        cue.level ??
        nestedData.brightness ??
        nestedData.intensity ??
        nestedData.level ??
        1
    ),
    duration: Math.max(0, finiteNumber(cue.duration, 0)),
    mode,
    fadeDuration: mode === 'fade' ? Math.max(0, explicitFadeDuration) : 0,
    fadeStart:
      mode === 'fade' && explicitFadeDuration > 0
        ? time - explicitFadeDuration
        : null,
    label: String(
      cue.effect ||
        cue.mode ||
        cue.label ||
        nestedData.type ||
        nestedData.mode ||
        `Cue ${index + 1}`
    )
  };
}

export class SequencePlayer extends EventTarget {
  constructor(send, options = {}) {
    super();
    this.send = send;
    this.frameIntervalMs = Math.max(
      35,
      finiteNumber(options.frameIntervalMs, DEFAULT_FRAME_INTERVAL_MS)
    );
    this.sequence = null;
    this.songStartPerf = 0;
    this.timer = null;
    this.lastIndex = -1;
    this.lastFrameKey = '';
    this.sending = false;
  }

  sync(sequence, songOffset) {
    const sequenceTime = songOffset - (sequence.offset || 0);
    this.sequence = sequence;
    this.songStartPerf = performance.now() - sequenceTime * 1000;
    this.lastIndex = -1;
    this.lastFrameKey = '';

    if (!this.timer) {
      this.timer = setInterval(() => this.tick(), this.frameIntervalMs);
    }

    this.tick();
  }

  correct(songOffset) {
    if (!this.sequence) return;

    const targetStart =
      performance.now() - (songOffset - (this.sequence.offset || 0)) * 1000;
    const error = targetStart - this.songStartPerf;

    if (Math.abs(error) > 750) this.songStartPerf = targetStart;
    else this.songStartPerf += error * 0.25;
  }

  async tick() {
    if (!this.sequence || this.sending) return;

    const time = (performance.now() - this.songStartPerf) / 1000;
    const frame = frameAtTime(this.sequence.cues, time);
    if (!frame) return;

    // Quantization prevents duplicate BLE writes caused by timer jitter while
    // retaining smooth fades at roughly the selected frame rate.
    const frameKey = `${frame.color}:${Math.round(frame.brightness * 255)}:${frame.index}:${frame.fading ? Math.floor(time * 20) : 'static'}`;
    if (frameKey === this.lastFrameKey) return;

    this.lastFrameKey = frameKey;
    this.lastIndex = frame.index;
    this.sending = true;

    try {
      await this.send(frame.color, frame.brightness);
      this.dispatchEvent(
        new CustomEvent('cue', {
          detail: {
            cue: frame.cue,
            time,
            index: frame.index,
            sequence: this.sequence,
            fading: frame.fading,
            progress: frame.progress,
            renderedColor: frame.color,
            renderedBrightness: frame.brightness
          }
        })
      );
    } finally {
      this.sending = false;
    }
  }

  stop() {
    this.sequence = null;
    this.lastIndex = -1;
    this.lastFrameKey = '';
    this.sending = false;

    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}

function frameAtTime(cues, time) {
  if (!cues.length || time < cues[0].time) return null;

  const currentIndex = findCueIndex(cues, time);
  const currentCue = currentIndex >= 0 ? cues[currentIndex] : cues[0];
  const nextIndex = currentIndex + 1;
  const nextCue = cues[nextIndex];

  if (nextCue && nextCue.mode === 'fade' && nextCue.fadeDuration > 0) {
    const fadeStart = Number.isFinite(nextCue.fadeStart)
      ? nextCue.fadeStart
      : nextCue.time - nextCue.fadeDuration;

    if (time >= fadeStart && time < nextCue.time) {
      const progress = clamp01((time - fadeStart) / Math.max(0.001, nextCue.time - fadeStart));
      return {
        cue: nextCue,
        index: nextIndex,
        color: interpolateHex(currentCue.color, nextCue.color, progress),
        brightness: lerp(currentCue.brightness, nextCue.brightness, progress),
        fading: true,
        progress
      };
    }
  }

  return {
    cue: currentCue,
    index: currentIndex,
    color: currentCue.color,
    brightness: currentCue.brightness,
    fading: false,
    progress: 1
  };
}

function interpolateHex(fromHex, toHex, progress) {
  const from = hexToRgb(fromHex);
  const to = hexToRgb(toHex);
  const p = clamp01(progress);

  return rgbToHex({
    r: Math.round(lerp(from.r, to.r, p)),
    g: Math.round(lerp(from.g, to.g, p)),
    b: Math.round(lerp(from.b, to.b, p))
  });
}

function hexToRgb(hex) {
  const value = normalizeColor(hex) || '#000000';
  return {
    r: parseInt(value.slice(1, 3), 16),
    g: parseInt(value.slice(3, 5), 16),
    b: parseInt(value.slice(5, 7), 16)
  };
}

function rgbToHex({ r, g, b }) {
  return `#${[r, g, b]
    .map((value) => Math.max(0, Math.min(255, value)).toString(16).padStart(2, '0'))
    .join('')}`.toUpperCase();
}

function normalizeColor(value) {
  let color = value;

  if (Array.isArray(color)) {
    color = rgbToHex({ r: color[0], g: color[1], b: color[2] });
  }

  if (color && typeof color === 'object') {
    color = rgbToHex(color);
  }

  if (typeof color !== 'string') return null;
  if (!color.startsWith('#')) color = `#${color}`;
  if (!/^#[0-9a-f]{6}$/i.test(color)) return null;
  return color.toUpperCase();
}

function normalizeBrightness(value) {
  let brightness = Number(value);
  if (!Number.isFinite(brightness)) return 1;
  if (brightness > 1) brightness /= 100;
  return clamp01(brightness);
}

function findCueIndex(cues, time) {
  let low = 0;
  let high = cues.length - 1;
  let answer = -1;

  while (low <= high) {
    const middle = (low + high) >> 1;
    if (cues[middle].time <= time) {
      answer = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }

  return answer;
}

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function lerp(from, to, progress) {
  return from + (to - from) * progress;
}

function slug(value) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'sequence'
  );
}