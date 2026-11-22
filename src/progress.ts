// Learner model: what he can read, which songs are open, how much help each note gets.
// Pure functions over a plain state object; web/store.ts keeps it in the iPad's storage.
//
// Notes: one Bayesian Knowledge Tracing estimate per key (D4, F4 ...). The keyboard hint
// fades per note as the estimate climbs, so he ends up reading the staff alone. An answer
// he gave with the key already lit on screen shows he can follow a light, not that he can
// read, so it can lift a note only to the "light comes late" level, never to mastered.
//
// Songs: the 12 ocarina phrases open in stages, each stage adding one key:
//   1. D4 F4 A4      Song of Time, Requiem of Spirit, Bolero of Fire (all three keys are
//                    spaces on the staff: D under it, F and A inside)
//   2. + D5          Song of Storms, Sun's Song
//   3. + B4          Zelda's Lullaby, Saria's Song, Serenade of Water, Epona's Song,
//                    Minuet of Forest, Nocturne of Shadow, Prelude of Light
// A stage opens when every song of the one before has its star (finished with at most one
// slip in five). After stage 3: rhythm (each song again, now waiting for the beat) and the
// long songs, easiest first, each opening when the one before has its star.

import { PHRASES, WHOLE, pitchesOf, wholeTune, type WholeSong } from "./songs.ts";

export interface NoteState { p: number; n: number; right: number; at: number }
export interface SongState { star?: boolean; rhythm?: boolean; best?: number; plays?: number }
export interface Progress {
  version: 1;
  notes: Record<string, NoteState>;
  songs: Record<string, SongState>;
  /** Grown-up's override: everything open. */
  unlockAll?: boolean;
}

export const fresh = (): Progress => ({ version: 1, notes: {}, songs: {} });

// BKT parameters. Guessing the right key out of the few in play is not rare for a child
// who is hunting, so guess is fairly high; learning is quick because each note recurs often.
const BKT = { pInit: 0.1, pLearn: 0.12, pSlip: 0.1, pGuess: 0.2 };
export const MASTERED = 0.95;
/** A note answered with the key lit can climb no higher than this. */
export const HINTED_CAP = 0.8;

export function bkt(p: number, correct: boolean): number {
  const post = correct ? (p * (1 - BKT.pSlip)) / (p * (1 - BKT.pSlip) + (1 - p) * BKT.pGuess) : (p * BKT.pSlip) / (p * BKT.pSlip + (1 - p) * (1 - BKT.pGuess));
  return post + (1 - post) * BKT.pLearn;
}

export const noteP = (s: Progress, midi: number) => s.notes[midi]?.p ?? BKT.pInit;

/** One answer: the first strike on a note. `hinted` = the key was lit before he played. */
export function recordNote(s: Progress, midi: number, correct: boolean, hinted: boolean, now = Date.now()): void {
  const cur = s.notes[midi] ?? { p: BKT.pInit, n: 0, right: 0, at: 0 };
  let p = bkt(cur.p, correct);
  if (hinted && correct) p = Math.min(p, Math.max(cur.p, HINTED_CAP));
  s.notes[midi] = { p, n: cur.n + 1, right: cur.right + (correct ? 1 : 0), at: now };
}

/** How the keyboard helps with a note right now. */
export type Hint = "letter" | "lit" | "late" | "none";
export function hintFor(s: Progress, midi: number): Hint {
  const p = noteP(s, midi);
  if (p < 0.4) return "letter"; // key lit, letter name under the note
  if (p < HINTED_CAP) return "lit"; // key lit
  if (p < MASTERED) return "late"; // key lights after a slip or a long pause
  return "none"; // lights only after two slips
}
/** Seconds before a "late" hint lights the key by itself. */
export const LATE_HINT_S = 4;
/** Wrong notes before the key lights, by hint level. */
export const SLIPS_BEFORE_LIGHT: Record<Hint, number> = { letter: 0, lit: 0, late: 1, none: 2 };

// ---- Songs and stages ------------------------------------------------------------------

export const STAGES: { add: number[]; songs: string[] }[] = [
  { add: [62, 65, 69], songs: ["song-of-time", "requiem-of-spirit", "bolero-of-fire"] },
  { add: [74], songs: ["song-of-storms", "suns-song"] },
  { add: [71], songs: ["zeldas-lullaby", "sarias-song", "serenade-of-water", "eponas-song", "minuet-of-forest", "nocturne-of-shadow", "prelude-of-light"] },
];

/** A song's star: finished with at most one slip in five notes. */
export const STAR_RATE = 0.8;
/** Rhythm star: this share of notes on the beat. */
export const RHYTHM_RATE = 0.7;

/** Stages open so far (1-based count). */
export function stagesOpen(s: Progress): number {
  if (s.unlockAll) return STAGES.length;
  let n = 1;
  while (n < STAGES.length && STAGES[n - 1]!.songs.every((id) => s.songs[id]?.star)) n++;
  return n;
}
export const phrasesDone = (s: Progress) => STAGES.every((st) => st.songs.every((id) => s.songs[id]?.star));

/** Keys introduced so far. */
export const notesOpen = (s: Progress) => STAGES.slice(0, stagesOpen(s)).flatMap((st) => st.add);

export function phraseOpen(s: Progress, id: string): boolean {
  return STAGES.slice(0, stagesOpen(s)).some((st) => st.songs.includes(id));
}
/** The newest stage's songs, to draw his eye. */
export const newestSongs = (s: Progress) => STAGES[stagesOpen(s) - 1]!.songs;

/** Rhythm opens as a later level: once every ocarina song has its star. */
export const rhythmOpen = (s: Progress, id: string) => !!s.unlockAll || (phrasesDone(s) && !!s.songs[id]?.star);

/** Long songs, easiest first: fewer sharps and flats, fewer different keys, narrower, shorter. */
export function wholeOrder(): WholeSong[] {
  const cost = (w: WholeSong) => {
    const t = wholeTune(w);
    const ps = pitchesOf(t.notes);
    const accidentals = new Set(t.notes.filter((n) => n.name && /[#b]/.test(n.name)).map((n) => n.name)).size;
    return accidentals * 10 + ps.length * 2 + (ps[ps.length - 1]! - ps[0]!) / 2 + t.notes.length / 10;
  };
  return [...WHOLE].sort((a, b) => cost(a) - cost(b));
}
const WHOLE_ORDER = wholeOrder();
export const wholeKey = (id: string) => `${id}:whole`;

export function wholeOpen(s: Progress, id: string): boolean {
  if (s.unlockAll) return true;
  if (!phrasesDone(s)) return false;
  const i = WHOLE_ORDER.findIndex((w) => w.id === id);
  return i === 0 || (i > 0 && !!s.songs[wholeKey(WHOLE_ORDER[i - 1]!.id)]?.star);
}
export const wholeInOrder = () => WHOLE_ORDER;

/** Record a finished song; returns whether this play earned a new star. */
export function recordSong(s: Progress, key: string, firstTryRate: number, mode: "free" | "rhythm"): boolean {
  const cur = s.songs[key] ?? {};
  const plays = (cur.plays ?? 0) + 1;
  const best = Math.max(cur.best ?? 0, firstTryRate);
  if (mode === "rhythm") {
    const earned = !cur.rhythm && firstTryRate >= RHYTHM_RATE;
    s.songs[key] = { ...cur, plays, rhythm: cur.rhythm || earned };
    return earned;
  }
  const earned = !cur.star && firstTryRate >= STAR_RATE;
  s.songs[key] = { ...cur, plays, best, star: cur.star || earned };
  return earned;
}

// ---- Note game -------------------------------------------------------------------------

/** A short run of single notes from the keys he has, weakest most often; a new key shows up a lot. */
export function noteDrill(s: Progress, count = 8, rand: () => number = Math.random): number[] {
  const keys = notesOpen(s);
  const weight = (m: number) => 1.2 - noteP(s, m) + (s.notes[m] ? 0 : 0.8);
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    const pool = keys.filter((m) => m !== out[out.length - 1] || keys.length === 1);
    const total = pool.reduce((a, m) => a + weight(m), 0);
    let r = rand() * total;
    let pick = pool[0]!;
    for (const m of pool) {
      r -= weight(m);
      if (r <= 0) {
        pick = m;
        break;
      }
    }
    out.push(pick);
  }
  return out;
}

export const phraseById = (id: string) => PHRASES.find((p) => p.id === id);
export const wholeById = (id: string) => WHOLE.find((w) => w.id === id);
