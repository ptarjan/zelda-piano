// Sound, made on the device with Web Audio: a soft piano-like voice for playing a song back,
// a reward chime, and the count-in clicks. No recordings from the game.

import type { Note } from "./songs.ts";

let ctx: AudioContext | undefined;

/** performance.now() until which the app itself is sounding: the listener ignores the mic. */
export let quietUntil = 0;
/** Mark the app as sounding for `seconds`, plus a tail for the room's echo (`tailMs`). */
const sounding = (seconds: number, tailMs = 450) => {
  quietUntil = Math.max(quietUntil, performance.now() + seconds * 1000 + tailMs);
};

/** The one AudioContext, created and resumed inside a tap (iOS needs that). */
export function audio(): AudioContext {
  if (!ctx) {
    ctx = new AudioContext({ latencyHint: "interactive" });
    // Mic and speaker together, and audible with the silent switch on (iOS 17+).
    const s = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
    if (s) s.type = "play-and-record";
  }
  if (ctx.state !== "running") void ctx.resume();
  return ctx;
}

const freq = (m: number) => 440 * 2 ** ((m - 69) / 12);

function out(c: AudioContext): AudioNode {
  const comp = c.createDynamicsCompressor();
  comp.connect(c.destination);
  return comp;
}

/** One soft piano-ish note: a few decaying partials, the higher ones dying first. */
function tone(c: AudioContext, dest: AudioNode, midi: number, at: number, dur: number, gain = 0.25): void {
  const f = freq(midi);
  const parts = [1, 0.45, 0.22, 0.12];
  parts.forEach((a, i) => {
    const o = c.createOscillator();
    o.type = "sine";
    o.frequency.value = f * (i + 1) * (1 + 0.0004 * (i + 1) ** 2);
    const g = c.createGain();
    const peak = gain * a;
    const decay = 1.4 / (i + 1);
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(peak, at + 0.006);
    g.gain.setTargetAtTime(0, at + 0.006, decay);
    g.gain.setTargetAtTime(0, at + dur, 0.08);
    o.connect(g).connect(dest);
    o.start(at);
    o.stop(at + dur + 0.6);
  });
}

/** Play a line of notes; resolves when it has finished. */
export function playNotes(notes: Note[], bpm = 96, gain = 0.25): Promise<void> {
  const c = audio();
  const dest = out(c);
  const beat = 60 / bpm;
  let t = c.currentTime + 0.08;
  notes.forEach((n, i) => {
    const held = n.beats * beat;
    if (n.midi !== null && !(i > 0 && notes[i - 1]!.tie && notes[i - 1]!.midi === n.midi)) {
      let len = held;
      for (let j = i; notes[j]?.tie && notes[j + 1]; j++) len += notes[j + 1]!.beats * beat;
      tone(c, dest, n.midi, t, len * 0.95, gain);
    }
    t += held;
  });
  sounding(t - c.currentTime + 0.3);
  return new Promise((r) => setTimeout(r, (t - c.currentTime + 0.3) * 1000));
}

/** A single key, for the note game's "here it is" and the keyboard picture. */
export function playKey(midi: number, dur = 0.6): void {
  const c = audio();
  tone(c, out(c), midi, c.currentTime + 0.01, dur, 0.22);
  sounding(dur + 0.3);
}

/** The reward: a quick rising sparkle (our own, not the game's). */
export function chime(): Promise<void> {
  const c = audio();
  const dest = out(c);
  const t = c.currentTime + 0.05;
  [84, 88, 91, 96, 100].forEach((m, i) => {
    const o = c.createOscillator();
    o.type = "triangle";
    o.frequency.value = freq(m);
    const g = c.createGain();
    const at = t + i * 0.07;
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(0.12, at + 0.005);
    g.gain.setTargetAtTime(0, at + 0.01, 0.25);
    o.connect(g).connect(dest);
    o.start(at);
    o.stop(at + 1.2);
  });
  sounding(1);
  return new Promise((r) => setTimeout(r, 1000));
}

/** A soft wooden click for the count-in (filtered noise: no pitch for the listener to catch). */
export function click(at: number, accent = false): void {
  const c = audio();
  const len = Math.floor(c.sampleRate * 0.03);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (len / 6));
  const src = c.createBufferSource();
  src.buffer = buf;
  const bp = c.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = accent ? 2600 : 1900;
  bp.Q.value = 1.2;
  const g = c.createGain();
  g.gain.value = accent ? 0.9 : 0.6;
  src.connect(bp).connect(g).connect(c.destination);
  src.start(at);
  // A click is a 30 ms burst with no pitch: a short tail, so a downbeat right after it is heard.
  sounding(Math.max(0, at - c.currentTime) + 0.03, 60);
}
