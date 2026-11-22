// The songbook's melodies (src/songs.json, exported from gen.py by scripts/export_songs.py).
import data from "./songs.json" with { type: "json" };

export interface Note {
  /** MIDI number; null for a rest. */
  midi: number | null;
  /** Written name with octave ("F#4", "Bb5"); absent for rests. */
  name?: string;
  /** Length in quarter-note beats. */
  beats: number;
  finger?: number;
  /** Tied into the next note (same key, held on: not struck again). */
  tie?: boolean;
}
export interface Chord {
  midis: number[];
  names: string[];
  beats: number;
  tie?: boolean;
}
export interface PartnerBar {
  rh: Chord[];
  lh: Chord[];
}
export interface Phrase {
  id: string;
  title: string;
  meter: string;
  notes: Note[];
}
export interface WholeSong {
  id: string;
  title: string;
  meter: string;
  bars: Note[][];
  partner?: PartnerBar[];
}

export const PHRASES = data.phrases as Phrase[];
export const WHOLE = data.whole as WholeSong[];

/** Song pictures: the tiles carry no prose, so each song has a picture. */
export const EMOJI: Record<string, string> = {
  "zeldas-lullaby": "👑",
  "eponas-song": "🐴",
  "sarias-song": "🌳",
  "suns-song": "☀️",
  "song-of-time": "⏳",
  "song-of-storms": "🌧️",
  "minuet-of-forest": "🌲",
  "bolero-of-fire": "🔥",
  "serenade-of-water": "💧",
  "nocturne-of-shadow": "🌙",
  "requiem-of-spirit": "🏜️",
  "prelude-of-light": "✨",
};

/** A playable line: the notes he must strike, in order (rests and tied continuations kept for timing). */
export interface Tune {
  id: string;
  title: string;
  meter: string;
  notes: Note[];
  /** Index of the first note of each bar, for the whole songs. */
  barStarts?: number[];
}

export const phraseTune = (p: Phrase): Tune => ({ id: p.id, title: p.title, meter: p.meter, notes: p.notes });

export function wholeTune(w: WholeSong): Tune {
  const notes: Note[] = [];
  const barStarts: number[] = [];
  for (const bar of w.bars) {
    barStarts.push(notes.length);
    notes.push(...bar);
  }
  return { id: `${w.id}:whole`, title: w.title, meter: w.meter, notes, barStarts };
}

/** Indices of the notes that are struck: not rests, not the held half of a tie. */
export function struck(notes: Note[]): number[] {
  const out: number[] = [];
  notes.forEach((n, i) => {
    if (n.midi !== null && !(i > 0 && notes[i - 1]!.tie && notes[i - 1]!.midi === n.midi)) out.push(i);
  });
  return out;
}

export const pitchesOf = (notes: Note[]) => [...new Set(notes.flatMap((n) => (n.midi === null ? [] : [n.midi])))].sort((a, b) => a - b);

const LETTERS = ["C", "D", "E", "F", "G", "A", "B"];
const SEMI = [0, 2, 4, 5, 7, 9, 11];
/** Parse "F#4" -> diatonic step from C4 (C4 = 0, D4 = 1 ...) and accidental. */
export function spelling(name: string): { step: number; accidental: "" | "#" | "b"; letter: string; octave: number } {
  const m = /^([A-G])(#|b)?(-?\d)$/.exec(name);
  if (!m) throw new Error(`bad note name ${name}`);
  const letter = m[1]!;
  const octave = Number(m[3]);
  return { step: LETTERS.indexOf(letter) + 7 * (octave - 4), accidental: (m[2] ?? "") as "" | "#" | "b", letter, octave };
}
/** Default spelling for a MIDI number (sharps), when a note has no written name. */
export function nameOf(midi: number): string {
  const pc = midi % 12;
  const octave = Math.floor(midi / 12) - 1;
  const i = SEMI.indexOf(pc);
  return i >= 0 ? `${LETTERS[i]}${octave}` : `${LETTERS[SEMI.indexOf(pc - 1)]}#${octave}`;
}
export const noteName = (n: Note) => n.name ?? (n.midi === null ? "" : nameOf(n.midi));
