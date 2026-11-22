// The microphone: an AnalyserNode polled about 60 times a second, each frame through the
// pitch detector and note tracker (src/pitch.ts). Browser only.

import { DEFAULT_PITCH, detectPitch, NoteTracker, type NoteEvent, type PitchFrame } from "./pitch.ts";
import { audio, quietUntil } from "./synth.ts";

export const FRAME = 2048;
export const LONG = 8192;

export interface ListenSettings {
  gate: number;
  tuningCents: number;
}

export interface Tick {
  pitch: PitchFrame;
  /** The last LONG samples (for play-along's chord check). */
  long: Float32Array;
  /** AudioContext time of this frame's end. */
  at: number;
  sampleRate: number;
  /** A strike started on this frame. */
  onset: boolean;
}

export class Listener {
  settings: ListenSettings = { gate: DEFAULT_PITCH.gate, tuningCents: 0 };
  onNote?: (e: NoteEvent) => void;
  onTick?: (t: Tick) => void;
  private analyser?: AnalyserNode;
  private buf = new Float32Array(LONG);
  private tracker = new NoteTracker();
  private timer?: ReturnType<typeof setInterval>;
  private stream?: MediaStream;

  get running() {
    return !!this.timer;
  }

  /** Ask for the mic (inside a tap) and start listening. Throws if refused. */
  async start(): Promise<void> {
    if (this.timer) return;
    const c = audio();
    if (!this.stream) {
      // Voice processing would treat a held piano note as noise and squash it.
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 } });
      const src = c.createMediaStreamSource(this.stream);
      this.analyser = c.createAnalyser();
      this.analyser.fftSize = LONG;
      this.analyser.smoothingTimeConstant = 0;
      src.connect(this.analyser);
      // Some Safari versions only run nodes that reach the output.
      const mute = c.createGain();
      mute.gain.value = 0;
      this.analyser.connect(mute).connect(c.destination);
    }
    this.timer = setInterval(() => this.tick(), 16);
  }

  stop(): void {
    clearInterval(this.timer);
    this.timer = undefined;
  }

  /** Forget the note in progress (a new screen, or after the app made a sound). */
  reset(): void {
    this.tracker.reset();
  }

  private tick(): void {
    const a = this.analyser;
    if (!a) return;
    const c = audio();
    if (performance.now() < quietUntil) {
      this.tracker.reset();
      return;
    }
    a.getFloatTimeDomainData(this.buf);
    const frame = this.buf.subarray(LONG - FRAME);
    const pitch = detectPitch(frame, c.sampleRate, { gate: this.settings.gate, tuningCents: this.settings.tuningCents });
    const before = this.tracker.onsetAt;
    const ev = this.tracker.feed(pitch, c.currentTime, this.settings.gate);
    this.onTick?.({ pitch, long: this.buf, at: c.currentTime, sampleRate: c.sampleRate, onset: this.tracker.onsetAt !== before });
    if (ev) this.onNote?.(ev);
  }
}
