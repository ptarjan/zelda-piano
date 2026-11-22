// Monophonic pitch detection tuned for an acoustic piano heard through a tablet mic.
// Pure functions over Float32Array frames, so CI can test them on synthesized tones.
//
// Pipeline per frame (src/listen.ts polls an AnalyserNode about 60 times a second):
//   1. level gate: below the room's calibrated noise floor -> nothing.
//   2. McLeod Pitch Method (normalised square difference + "first key maximum above
//      k * best"), which already prefers the true period over its multiples.
//   3. octave check against the spectrum. A piano's 2nd partial can be louder than its
//      fundamental, so a period detector can land an octave low. A note at f has energy
//      at f and 3f; the note an octave up (2f) has none there. So we compare the odd
//      partials (f, 3f) with the even ones (2f, 4f) and move the estimate up an octave
//      when the odd ones are missing.
//   4. MIDI number, after taking off the piano's measured tuning offset.

export interface PitchOptions {
  minFreq: number;
  maxFreq: number;
  /** RMS below this is silence (calibrated from the room). */
  gate: number;
  /** MPM key-maximum threshold. */
  k: number;
  /** NSDF peak needed to call the frame pitched. */
  minClarity: number;
  /** Odd/even partial ratio under which an estimate is treated as an octave too low. */
  oddRatio: number;
  /** The piano's overall tuning, in cents from A440 equal temperament. */
  tuningCents: number;
}

export const DEFAULT_PITCH: PitchOptions = {
  // G3 (196 Hz) is the lowest key in the game; searching lower lets two notes ringing together
  // read as a phantom note at their common fundamental.
  minFreq: 170,
  maxFreq: 1500,
  gate: 0.004,
  k: 0.9,
  minClarity: 0.75,
  oddRatio: 0.2,
  tuningCents: 0,
};

export interface PitchFrame {
  /** Hz, or 0 when unpitched or silent. */
  freq: number;
  /** Fractional MIDI note after the tuning offset (NaN when unpitched). */
  midi: number;
  clarity: number;
  rms: number;
}

export const midiToFreq = (m: number) => 440 * 2 ** ((m - 69) / 12);
export const freqToMidi = (f: number) => 69 + 12 * Math.log2(f / 440);

export function rms(x: Float32Array): number {
  let s = 0;
  for (let i = 0; i < x.length; i++) s += x[i]! * x[i]!;
  return Math.sqrt(s / x.length);
}

/** McLeod normalised square difference function peak: period in samples (fractional) and clarity. */
export function mpm(x: Float32Array, sr: number, minFreq: number, maxFreq: number, k = 0.9): { period: number; clarity: number } {
  const n = x.length;
  const minLag = Math.max(2, Math.floor(sr / maxFreq));
  const maxLag = Math.min(n - 2, Math.ceil(sr / minFreq));
  const nsdf = new Float32Array(maxLag + 2);
  // m(tau) by a running update; r(tau) directly.
  let m = 0;
  for (let i = 0; i < n; i++) m += 2 * x[i]! * x[i]!;
  for (let tau = 0; tau <= maxLag + 1; tau++) {
    let r = 0;
    for (let i = 0; i < n - tau; i++) r += x[i]! * x[i + tau]!;
    nsdf[tau] = m > 0 ? (2 * r) / m : 0;
    m -= x[tau]! * x[tau]! + x[n - 1 - tau]! * x[n - 1 - tau]!;
  }
  // Key maxima: the highest point of each positive lobe after the first negative zero crossing.
  const peaks: number[] = [];
  let tau = 1;
  while (tau < maxLag && nsdf[tau]! > 0) tau++;
  let best = -1;
  while (tau <= maxLag) {
    while (tau <= maxLag && nsdf[tau]! <= 0) tau++;
    let top = -1;
    while (tau <= maxLag && nsdf[tau]! > 0) {
      if (top < 0 || nsdf[tau]! > nsdf[top]!) top = tau;
      tau++;
    }
    if (top >= minLag) {
      peaks.push(top);
      if (best < 0 || nsdf[top]! > nsdf[best]!) best = top;
    }
  }
  if (best < 0) return { period: 0, clarity: 0 };
  const limit = k * nsdf[best]!;
  const pick = peaks.find((p) => nsdf[p]! >= limit)!;
  // Parabolic interpolation around the pick.
  const a = nsdf[pick - 1]!, b = nsdf[pick]!, c = nsdf[pick + 1]!;
  const d = a - 2 * b + c;
  const shift = d === 0 ? 0 : (0.5 * (a - c)) / d;
  return { period: pick + Math.max(-1, Math.min(1, shift)), clarity: Math.min(1, b - 0.25 * (a - c) * shift) };
}

const hannCache = new Map<number, Float32Array>();
function hann(n: number): Float32Array {
  let w = hannCache.get(n);
  if (!w) {
    w = new Float32Array(n);
    for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
    hannCache.set(n, w);
  }
  return w;
}

/** Magnitude of one frequency (Hann-windowed Goertzel); the best of f and +-20 cents, for piano stretch. */
export function magnitudeAt(x: Float32Array, sr: number, f: number): number {
  if (f <= 0 || f >= sr / 2) return 0;
  const w = hann(x.length);
  let best = 0;
  for (const c of [1, 2 ** (20 / 1200), 2 ** (-20 / 1200)]) {
    const coeff = 2 * Math.cos((2 * Math.PI * f * c) / sr);
    let s1 = 0, s2 = 0;
    for (let i = 0; i < x.length; i++) {
      const s0 = w[i]! * x[i]! + coeff * s1 - s2;
      s2 = s1;
      s1 = s0;
    }
    best = Math.max(best, Math.sqrt(Math.max(0, s1 * s1 + s2 * s2 - coeff * s1 * s2)));
  }
  return best;
}

/** (|f| + |3f|) / (|2f| + |4f|): high for a real note at f, near zero for a note at 2f. */
export function oddness(x: Float32Array, sr: number, f: number): number {
  const odd = magnitudeAt(x, sr, f) + magnitudeAt(x, sr, 3 * f);
  const even = magnitudeAt(x, sr, 2 * f) + magnitudeAt(x, sr, 4 * f);
  return odd / (even + 1e-9);
}

/** One frame -> pitch. */
export function detectPitch(x: Float32Array, sr: number, opts: Partial<PitchOptions> = {}): PitchFrame {
  const o = { ...DEFAULT_PITCH, ...opts };
  const level = rms(x);
  const none: PitchFrame = { freq: 0, midi: NaN, clarity: 0, rms: level };
  if (level < o.gate) return none;
  const { period, clarity } = mpm(x, sr, o.minFreq, o.maxFreq, o.k);
  if (!period || clarity < o.minClarity) return { ...none, clarity };
  let f = sr / period;
  // MPM's "first peak above k * best" already keeps it from reading a note an octave low
  // in most frames; the case left is a period detector settling on twice the period when
  // the frame is noisy. A note really at f has energy at f and 3f; if there is next to
  // none there, the note is 2f. (No downward check: a note an octave lower still ringing
  // under the new one has exactly the odd-partial energy such a check would look for.)
  if (2 * f <= o.maxFreq && oddness(x, sr, f) < o.oddRatio) f *= 2;
  if (f < o.minFreq || f > o.maxFreq) return { ...none, clarity };
  return { freq: f, midi: freqToMidi(f) - o.tuningCents / 100, clarity, rms: level };
}

// ---- Note events ---------------------------------------------------------------------

export interface NoteEvent {
  midi: number;
  /** Seconds (the caller's clock) of the onset that started it. */
  at: number;
  /** Cents off the nearest semitone (after tuning), for calibration. */
  cents: number;
}

export interface TrackerOptions {
  /** Level rise over the recent minimum that counts as a new strike. */
  onsetRatio: number;
  /** Frames that must agree on a pitch before it is reported. */
  confirm: number;
  /** Seconds after an onset during which its pitch may be confirmed. */
  window: number;
  /** Seconds after an onset before another can start. */
  refractory: number;
  /** Frames a different steady pitch must hold, with no new strike, to count (legato). */
  legato: number;
}

export const DEFAULT_TRACKER: TrackerOptions = { onsetRatio: 1.25, confirm: 2, window: 0.25, refractory: 0.09, legato: 5 };

/**
 * Turns a stream of pitch frames into note events. A piano note is a strike followed by a
 * decay, so a note is reported once per strike: a level jump starts a candidate, and the
 * first `confirm` frames that agree on a semitone (within `window`) report it. A repeated
 * key is a new strike and counts again; a note ringing on (and its beating) never does.
 */
export class NoteTracker {
  private o: TrackerOptions;
  private levels: number[] = [];
  /** Time of the last strike (seconds, caller's clock). */
  onsetAt = -Infinity;
  private votes: number[] = [];
  private cents: number[] = [];
  private reported: number | undefined;
  private current: number | undefined; // the semitone now sounding (reported or not)
  private run = 0;
  private runMidi: number | undefined;

  constructor(opts: Partial<TrackerOptions> = {}) {
    this.o = { ...DEFAULT_TRACKER, ...opts };
  }

  reset(): void {
    this.levels = [];
    this.onsetAt = -Infinity;
    this.votes = [];
    this.reported = this.current = this.runMidi = undefined;
    this.run = 0;
  }

  feed(p: PitchFrame, at: number, gate: number): NoteEvent | undefined {
    const o = this.o;
    // The floor a strike must rise from: the last few frames only. A strike's own attack
    // spans about three frames (the analysis window is longer than a hop), so a longer
    // memory would call the tail of that attack a second strike.
    const recentMin = this.levels.length ? Math.min(...this.levels) : 0;
    this.levels.push(p.rms);
    if (this.levels.length > 3) this.levels.shift();
    if (p.rms < gate) {
      this.current = this.runMidi = undefined;
      this.reported = undefined;
      this.run = 0;
      return undefined;
    }
    const strike = p.rms >= gate && (recentMin < gate || p.rms > recentMin * o.onsetRatio) && at - this.onsetAt >= o.refractory;
    if (strike) {
      this.onsetAt = at;
      this.votes = [];
      this.cents = [];
      this.reported = undefined;
    }
    const semi = Number.isFinite(p.midi) ? Math.round(p.midi) : undefined;
    // Legato: a new steady pitch with no strike (soft playing, or the pedal down).
    if (semi !== undefined && semi === this.runMidi) this.run++;
    else {
      this.runMidi = semi;
      this.run = semi === undefined ? 0 : 1;
    }
    if (semi === undefined) return undefined;
    if (at - this.onsetAt <= o.window && this.reported === undefined) {
      this.votes.push(semi);
      this.cents.push((p.midi - semi) * 100);
      const n = this.votes.filter((v) => v === semi).length;
      if (n >= o.confirm) return this.report(semi, this.onsetAt);
      return undefined;
    }
    if (this.run >= o.legato && semi !== this.current && semi !== this.reported) {
      this.onsetAt = at;
      this.cents = [(p.midi - semi) * 100];
      return this.report(semi, at);
    }
    return undefined;
  }

  private report(midi: number, at: number): NoteEvent {
    this.reported = this.current = midi;
    const c = [...this.cents].sort((a, b) => a - b);
    return { midi, at, cents: c[Math.floor(c.length / 2)] ?? 0 };
  }
}

// ---- Play-along: is the expected note among several? ---------------------------------

/**
 * How strongly `midi` sounds in a frame that may hold a chord: its first four partials
 * against the same partials a semitone either side. A grown-up's chords make a single
 * pitch estimate unreliable, but the melody note's partials still stand out. Use a long
 * frame (8192 samples at 48 kHz) so neighbouring semitones resolve. About 1 means absent.
 */
export function presence(x: Float32Array, sr: number, midi: number, tuningCents = 0): number {
  const f = midiToFreq(midi + tuningCents / 100);
  const sum = (g: number) => {
    let s = 0;
    for (let h = 1; h <= 4; h++) s += magnitudeAt(x, sr, h * g) / h;
    return s;
  };
  const semi = 2 ** (1 / 12);
  return sum(f) / (Math.max(sum(f / semi), sum(f * semi)) + 1e-9);
}

// ---- Judging against the score -------------------------------------------------------

/**
 * Is `heard` the note he was asked for? The right key in the right octave always is. An
 * octave off is forgiven only when the song never uses that other octave: then it cannot
 * be a reading mistake that matters, and it is the detector's likeliest error on a piano.
 * When the song has both (D4 and D5 in Song of Storms) the octave must be exact.
 */
export function matches(target: number, heard: number, songNotes: Iterable<number>): boolean {
  if (heard === target) return true;
  if (Math.abs(heard - target) !== 12) return false;
  for (const n of songNotes) if (n === heard) return false;
  return true;
}

// ---- Calibration -----------------------------------------------------------------------

/** The silence gate from a second or two of room noise: well above it, never absurdly low. */
export function gateFromNoise(levels: number[]): number {
  if (!levels.length) return DEFAULT_PITCH.gate;
  const s = [...levels].sort((a, b) => a - b);
  const p90 = s[Math.min(s.length - 1, Math.floor(s.length * 0.9))]!;
  return Math.min(0.05, Math.max(0.002, p90 * 3));
}

/** The piano's tuning offset from a few strikes of a known key (cents from equal temperament). */
export function tuningFrom(target: number, heardMidis: number[]): number | undefined {
  const near = heardMidis.filter((m) => Math.abs(m - target) < 1).map((m) => (m - target) * 100);
  if (near.length < 2) return undefined;
  near.sort((a, b) => a - b);
  return Math.round(near[Math.floor(near.length / 2)]!);
}
