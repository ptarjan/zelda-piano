import { test } from "node:test";
import assert from "node:assert/strict";
import { detectPitch, gateFromNoise, matches, NoteTracker, presence, rms, tuningFrom, type NoteEvent, type PitchOptions } from "../src/pitch.ts";
import { buffer, frameAt, noise, PIANO, SR, strike, type ToneOptions } from "./piano-synth.ts";

const FRAME = 2048;
const HOP = 800; // about what a 60 Hz poll of a 48 kHz analyser sees

/** The semitone heard 120 ms into a single struck note. */
function heard(midi: number, tone: ToneOptions = {}, opts: Partial<PitchOptions> = {}): number {
  const x = buffer(0.4);
  strike(x, midi, 0.02, 1, tone);
  noise(x, 0.0005);
  return Math.round(detectPitch(frameAt(x, 0.14, FRAME), SR, opts).midi);
}

/** Run a whole recording through detector + tracker, as the app does. */
function track(x: Float32Array, opts: Partial<PitchOptions> = {}, gate = 0.004): NoteEvent[] {
  const t = new NoteTracker();
  const out: NoteEvent[] = [];
  for (let i = 0; i + FRAME <= x.length; i += HOP) {
    const f = detectPitch(x.subarray(i, i + FRAME), SR, { gate, ...opts });
    const e = t.feed(f, (i + FRAME) / SR, gate);
    if (e) out.push(e);
  }
  return out;
}

test("every key from G3 to D6 reads as itself", () => {
  for (let m = 55; m <= 86; m++) assert.equal(heard(m), m, `midi ${m}`);
});

test("a weak fundamental does not drop or raise the octave", () => {
  for (let m = 60; m <= 81; m++) assert.equal(heard(m, { partials: [0.12, 1, 0.45, 0.4, 0.2, 0.1] }), m, `midi ${m}`);
});

test("a 2nd partial twice as loud as the fundamental still reads the right octave", () => {
  for (let m = 55; m <= 84; m++) assert.equal(heard(m, { partials: [0.5, 1, 0.3, 0.3, 0.15, 0.1] }), m, `midi ${m}`);
});

test("a bright, stretched upper-register tone reads right", () => {
  for (let m = 72; m <= 86; m++) assert.equal(heard(m, { B: 0.0012, partials: [1, 0.9, 0.7, 0.5, 0.4] }), m, `midi ${m}`);
});

test("D4, D5 and the ocarina keys stay apart", () => {
  const keys = [62, 65, 69, 71, 74];
  for (const m of keys) assert.equal(heard(m), m);
  assert.notEqual(heard(62), heard(74));
});

test("a piano 35 cents flat: calibration finds it and notes read true", () => {
  const raw: number[] = [];
  for (let i = 0; i < 3; i++) {
    const x = buffer(0.4);
    strike(x, 62, 0.02, 1, { detuneCents: -35 });
    raw.push(detectPitch(frameAt(x, 0.14), SR).midi);
  }
  const tuning = tuningFrom(62, raw)!;
  // The detector reads a few cents sharp on a stretched piano (it follows the partials, which sit
  // above the harmonics); calibration absorbs that, which the next lines check.
  assert.ok(Math.abs(tuning + 35) <= 8, `tuning ${tuning}`);
  for (const m of [60, 62, 65, 69, 71, 74, 79]) assert.equal(heard(m, { detuneCents: -35 }, { tuningCents: tuning }), m);
  // Without calibration a 45-cent-flat piano would read a semitone low for some keys; with it, never.
  for (const m of [62, 69, 74]) assert.equal(heard(m, { detuneCents: -45 }, { tuningCents: -45 }), m);
});

test("a high D struck while the low D still rings reads as a D", () => {
  // A ringing D4 already holds every partial of a D5, so one frame cannot tell which of the two
  // was just played: the pitch class is certain, the octave is not. (matches() in pitch.ts is where
  // the octave is settled, from the song's own notes.)
  const x = buffer(1);
  strike(x, 62, 0.02, 2, { gain: 0.12 });
  strike(x, 74, 0.4, 1, { gain: 0.2 });
  const midi = Math.round(detectPitch(frameAt(x, 0.52), SR).midi);
  assert.ok(midi === 62 || midi === 74, `midi ${midi}`);
});

test("silence and room noise are not notes", () => {
  const room = buffer(2);
  noise(room, 0.0015);
  const levels: number[] = [];
  for (let i = 0; i + FRAME <= room.length; i += HOP) levels.push(rms(room.subarray(i, i + FRAME)));
  const gate = gateFromNoise(levels);
  assert.ok(gate > 0.0015 && gate < 0.02, `gate ${gate}`);
  assert.equal(track(room, {}, gate).length, 0);
  assert.ok(Number.isNaN(detectPitch(new Float32Array(FRAME), SR).midi));
});

test("Song of Storms, notes ringing into each other: six notes in order", () => {
  const seq = [62, 65, 74, 62, 65, 74];
  const x = buffer(4);
  seq.forEach((m, i) => strike(x, m, 0.1 + i * 0.5, 0.6));
  noise(x, 0.001);
  assert.deepEqual(track(x).map((e) => e.midi), seq);
});

test("repeated notes count every time, even when the last one is still fading", () => {
  const x = buffer(3);
  for (let i = 0; i < 3; i++) strike(x, 69, 0.1 + i * 0.6, 0.45); // each key lifted just before it is struck again
  noise(x, 0.001);
  assert.deepEqual(track(x).map((e) => e.midi), [69, 69, 69]);
  // Serenade of Water: D F A A B, quarter notes at a child's pace, held with the pedal.
  const y = buffer(4);
  [62, 65, 69, 69, 71].forEach((m, i) => strike(y, m, 0.1 + i * 0.7, 3));
  noise(y, 0.001);
  assert.deepEqual(track(y).map((e) => e.midi), [62, 65, 69, 69, 71]);
});

test("a softer repeat after a loud note still counts", () => {
  const x = buffer(2);
  strike(x, 65, 0.1, 0.45, { gain: 0.25 });
  strike(x, 65, 0.6, 1, { gain: 0.12 });
  noise(x, 0.001);
  assert.deepEqual(track(x).map((e) => e.midi), [65, 65]);
});

test("one long note with beating strings is one note", () => {
  const x = buffer(4);
  strike(x, 71, 0.1, 3.5, { unisonCents: 3 });
  noise(x, 0.001);
  assert.deepEqual(track(x).map((e) => e.midi), [71]);
});

test("a soft note well above the room still registers", () => {
  const x = buffer(1.5);
  strike(x, 65, 0.1, 1, { gain: 0.03 });
  noise(x, 0.0008);
  assert.deepEqual(track(x, {}, 0.003).map((e) => e.midi), [65]);
});

test("varied piano timbres across the ocarina range", () => {
  const timbres: ToneOptions[] = [
    { partials: PIANO },
    { partials: [0.3, 1, 0.6, 0.5, 0.3] },
    { partials: [1, 0.3, 0.2, 0.1] },
    { partials: [0.7, 0.7, 0.7, 0.7, 0.5, 0.4, 0.3], B: 0.0008 },
  ];
  for (const t of timbres) for (const m of [62, 65, 69, 71, 74]) for (const d of [-15, 0, 15]) assert.equal(heard(m, { ...t, detuneCents: d }), m, `${m} ${d} ${t.partials}`);
});

test("matching: right key, and octave errors forgiven only when the song lacks that octave", () => {
  const timeSong = [69, 62, 65]; // Song of Time: A4 D4 F4
  const storms = [62, 65, 74]; // Song of Storms: D4 F4 D5
  assert.ok(matches(62, 62, timeSong));
  assert.ok(matches(62, 74, timeSong)); // D5 for D4: forgiven, Song of Time has no D5
  assert.ok(!matches(62, 74, storms)); // but Storms has both Ds
  assert.ok(!matches(62, 64, timeSong));
  assert.ok(matches(62, 50, storms)); // D3 for D4: Storms has no D3, forgiven
});

test("play-along: the melody note stands out of the grown-up's chord", () => {
  // Zelda's Lullaby, bar 1: B4 in the melody over G4 (harmony) and C3 + E3/G3 (left hand).
  const x = buffer(1);
  strike(x, 71, 0.05, 1, { gain: 0.2 });
  strike(x, 67, 0.05, 1, { gain: 0.12 });
  strike(x, 48, 0.05, 1, { gain: 0.12 });
  strike(x, 52, 0.05, 1, { gain: 0.08 });
  strike(x, 55, 0.05, 1, { gain: 0.08 });
  noise(x, 0.001);
  const f = frameAt(x, 0.1, 8192);
  assert.ok(presence(f, SR, 71) > 2, `B4 ${presence(f, SR, 71)}`);
  assert.ok(presence(f, SR, 69) < 1.5, `A4 ${presence(f, SR, 69)}`); // the next melody note, not played yet
  assert.ok(presence(f, SR, 72) < 1.5, `C5 ${presence(f, SR, 72)}`);
});
