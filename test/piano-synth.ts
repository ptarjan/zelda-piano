// Piano-like test tones: stretched (inharmonic) partials that decay at different rates,
// two slightly detuned strings per note (beating), a hammer thump, room noise.
// Only for tests; the app's own playback is src/synth.ts.

export const SR = 48000;

export interface ToneOptions {
  /** Partial amplitudes, fundamental first. */
  partials?: number[];
  /** Inharmonicity coefficient (partial n sits at n*f*sqrt(1 + B n^2)). */
  B?: number;
  /** Whole-piano detune, cents. */
  detuneCents?: number;
  /** Detune between the note's two strings, cents. */
  unisonCents?: number;
  /** Seconds for the fundamental to fall by 1/e. */
  decay?: number;
  gain?: number;
}

export const PIANO = [1, 0.8, 0.5, 0.35, 0.25, 0.15, 0.1, 0.07];

let seed = 1;
export function rand(): number {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
}

/** Add one struck note into `out` starting at `start` s, released (fast damping) after `hold` s. */
export function strike(out: Float32Array, midi: number, start: number, hold: number, o: ToneOptions = {}): void {
  const partials = o.partials ?? PIANO;
  const B = o.B ?? 0.0004;
  const f0 = 440 * 2 ** ((midi - 69) / 12 + (o.detuneCents ?? 0) / 1200);
  const uni = 2 ** ((o.unisonCents ?? 0.8) / 1200);
  const decay = o.decay ?? 1.6;
  const gain = o.gain ?? 0.2;
  const s0 = Math.floor(start * SR);
  const end = Math.min(out.length, s0 + Math.floor((hold + 0.3) * SR));
  for (let n = 1; n <= partials.length; n++) {
    const a = partials[n - 1]! * gain;
    if (!a) continue;
    const f = n * f0 * Math.sqrt(1 + B * n * n);
    if (f >= SR / 2) continue;
    const tau = decay / n ** 0.7;
    // The hammer hits both strings together: they start in phase and drift apart (beat).
    const ph1 = rand() * 6.283, ph2 = ph1;
    for (let i = s0; i < end; i++) {
      const t = (i - s0) / SR;
      const attack = Math.min(1, t / 0.003);
      const release = t > hold ? Math.exp(-(t - hold) / 0.05) : 1;
      const env = attack * Math.exp(-t / tau) * release;
      out[i]! += 0.5 * a * env * (Math.sin(6.2832 * f * t + ph1) + Math.sin(6.2832 * f * uni * t + ph2));
    }
  }
  // Hammer thump: 8 ms of decaying noise.
  for (let i = s0; i < Math.min(out.length, s0 + 0.008 * SR); i++) out[i]! += gain * 0.3 * (rand() * 2 - 1) * Math.exp(-(i - s0) / (0.002 * SR));
}

export function noise(out: Float32Array, level: number): void {
  for (let i = 0; i < out.length; i++) out[i]! += level * 1.732 * (rand() * 2 - 1);
}

export const buffer = (seconds: number) => new Float32Array(Math.ceil(seconds * SR));

/** One analysis frame of `n` samples starting at `t` seconds. */
export const frameAt = (x: Float32Array, t: number, n = 2048) => x.slice(Math.floor(t * SR), Math.floor(t * SR) + n);
