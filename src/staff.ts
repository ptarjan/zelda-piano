// Staff drawing as SVG strings (pure, so it can be checked without a browser).
// Coordinates: 10 units between staff lines. Treble lines y = 40..80 (F5 top, E4 bottom),
// bass lines y = 120..160 (A3 top, G2 bottom). Steps count diatonic notes from C4 = 0.

import { spelling } from "./songs.ts";

export type Clef = "treble" | "bass";
export type Look = "done" | "now" | "next" | "far" | "plain" | "miss";

const TREBLE_BOTTOM = 80;
const BASS_TOP = 120;
export const yOf = (step: number, clef: Clef) => (clef === "treble" ? TREBLE_BOTTOM - (step - 2) * 5 : BASS_TOP - (step + 2) * 5);

const COLOR: Record<Look, string> = { done: "#2f9e44", now: "#1971c2", next: "#343a40", far: "#343a40", plain: "#212529", miss: "#e8590c" };
const OPACITY: Record<Look, number> = { done: 0.55, now: 1, next: 0.5, far: 0.22, plain: 1, miss: 1 };

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

function staffLines(x0: number, x1: number, clef: Clef): string {
  const top = clef === "treble" ? 40 : BASS_TOP;
  let s = "";
  for (let i = 0; i < 5; i++) s += `<line x1="${x0}" x2="${x1}" y1="${top + i * 10}" y2="${top + i * 10}" stroke="#495057" stroke-width="1.3"/>`;
  return s;
}

// A drawn treble clef (stroke path; no music font needed) and bass clef.
const TREBLE_CLEF = `<path d="M24 72 C18 72 16 64 22 62 C30 60 34 70 28 76 C20 82 10 74 12 64 C14 52 26 46 30 36 C33 28 30 21 26 23 C20 27 20 40 24 56 L29 93 C30 100 23 102 19 97" fill="none" stroke="#212529" stroke-width="2.6" stroke-linecap="round"/><circle cx="20" cy="96" r="3" fill="#212529"/>`;
const BASS_CLEF = `<path d="M12 129 C11 119 31 116 32 130 C33 145 20 154 9 158" fill="none" stroke="#212529" stroke-width="3" stroke-linecap="round"/><circle cx="13" cy="129" r="3.5" fill="#212529"/><circle cx="39" cy="125" r="2.2" fill="#212529"/><circle cx="39" cy="135" r="2.2" fill="#212529"/>`;

function timeSig(x: number, meter: string, clef: Clef): string {
  const [a, b] = meter.split("/");
  const mid = clef === "treble" ? 60 : 140;
  return `<text x="${x}" y="${mid - 2}" font-size="22" font-weight="800" text-anchor="middle" font-family="Georgia,serif">${a}</text><text x="${x}" y="${mid + 18}" font-size="22" font-weight="800" text-anchor="middle" font-family="Georgia,serif">${b}</text>`;
}

function ledgers(x: number, step: number, clef: Clef, color: string): string {
  let s = "";
  const line = (st: number) => (s += `<line x1="${x - 11}" x2="${x + 11}" y1="${yOf(st, clef)}" y2="${yOf(st, clef)}" stroke="${color}" stroke-width="1.4"/>`);
  if (clef === "treble") {
    for (let st = 0; st >= step; st -= 2) line(st);
    for (let st = 12; st <= step; st += 2) line(st);
  } else {
    for (let st = 0; st <= step; st += 2) line(st);
    for (let st = -12; st >= step; st -= 2) line(st);
  }
  return s;
}

/** The shape of a note value: hollow head, stem, flags, dot. */
function valueOf(beats: number): { hollow: boolean; stem: boolean; flags: number; dot: boolean } {
  const dot = [3, 1.5, 0.75, 6].includes(beats);
  const base = dot ? beats / 1.5 : beats;
  return { hollow: base >= 2, stem: base < 4, flags: base <= 0.25 ? 2 : base <= 0.5 ? 1 : 0, dot };
}

export interface DrawOpts {
  look?: Look;
  /** Letter name under the note (the first hint level). */
  letter?: boolean;
  scale?: number;
  cls?: string;
}

/** One note or chord (names on one clef) at x, with its stem, flags, ledgers and accidentals. */
export function drawNote(x: number, names: string[], beats: number, clef: Clef, o: DrawOpts = {}): string {
  const look = o.look ?? "plain";
  const color = COLOR[look];
  const sc = o.scale ?? 1;
  const v = valueOf(beats);
  const sp = names.map(spelling).sort((a, b) => a.step - b.step);
  const steps = sp.map((p) => p.step);
  const mid = clef === "treble" ? 6 : -6;
  const avg = steps.reduce((a, b) => a + b, 0) / steps.length;
  const up = avg < mid;
  let g = "";
  for (const st of [Math.min(...steps), Math.max(...steps)]) g += ledgers(x, st, clef, color);
  sp.forEach((p, i) => {
    // A second (adjacent steps) shifts one head to the other side of the stem.
    const clash = i > 0 && p.step - sp[i - 1]!.step === 1 && !(sp[i - 1] as { shifted?: boolean }).shifted;
    if (clash) (p as { shifted?: boolean }).shifted = true;
    const hx = clash ? x + (up ? 12 : -12) : x;
    const y = yOf(p.step, clef);
    g += v.hollow
      ? `<ellipse cx="${hx}" cy="${y}" rx="6.4" ry="4.6" transform="rotate(-20 ${hx} ${y})" fill="#fffdf6" stroke="${color}" stroke-width="2.4"/>`
      : `<ellipse cx="${hx}" cy="${y}" rx="6.6" ry="4.8" transform="rotate(-20 ${hx} ${y})" fill="${color}"/>`;
    if (v.dot) g += `<circle cx="${x + 12}" cy="${p.step % 2 === 0 ? y - 5 : y}" r="2.2" fill="${color}"/>`;
    if (p.accidental) g += `<text x="${x - 13}" y="${y + 6}" font-size="20" text-anchor="end" fill="${color}" font-family="Georgia,'Times New Roman',serif">${p.accidental === "#" ? "♯" : "♭"}</text>`;
  });
  if (v.stem) {
    const lo = yOf(steps[0]!, clef), hi = yOf(steps[steps.length - 1]!, clef);
    const sx = up ? x + 6 : x - 6;
    const end = up ? hi - 34 : lo + 34;
    g += `<line x1="${sx}" x2="${sx}" y1="${up ? lo : hi}" y2="${end}" stroke="${color}" stroke-width="1.8"/>`;
    for (let f = 0; f < v.flags; f++) {
      const fy = end + (up ? f * 8 : -f * 8);
      g += up
        ? `<path d="M${sx} ${fy} C${sx + 2} ${fy + 8} ${sx + 12} ${fy + 10} ${sx + 9} ${fy + 22}" fill="none" stroke="${color}" stroke-width="2.4"/>`
        : `<path d="M${sx} ${fy} C${sx + 2} ${fy - 8} ${sx + 12} ${fy - 10} ${sx + 9} ${fy - 22}" fill="none" stroke="${color}" stroke-width="2.4"/>`;
    }
  }
  if (o.letter) {
    const ly = clef === "treble" ? Math.max(104, yOf(steps[0]!, clef) + 22) : 182;
    g += `<text x="${x}" y="${ly}" font-size="20" font-weight="800" text-anchor="middle" fill="${color}" font-family="ui-rounded,system-ui,sans-serif">${esc(sp.map((p) => p.letter + (p.accidental === "#" ? "♯" : p.accidental === "b" ? "♭" : "")).join(" "))}</text>`;
  }
  const t = sc === 1 ? "" : ` transform="translate(${x} ${clef === "treble" ? 60 : 140}) scale(${sc}) translate(${-x} ${clef === "treble" ? -60 : -140})"`;
  return `<g class="${o.cls ?? ""}" opacity="${OPACITY[look]}"${t}>${g}</g>`;
}

export function drawRest(x: number, beats: number, clef: Clef, look: Look = "plain"): string {
  const c = COLOR[look];
  const top = clef === "treble" ? 40 : BASS_TOP;
  let g: string;
  if (beats >= 3) g = `<rect x="${x - 7}" y="${top + 10}" width="14" height="5" fill="${c}"/>`;
  else if (beats >= 2) g = `<rect x="${x - 7}" y="${top + 15}" width="14" height="5" fill="${c}"/>`;
  else if (beats >= 1) g = `<path d="M${x - 3} ${top + 6} L${x + 4} ${top + 15} L${x - 3} ${top + 22} L${x + 4} ${top + 30} C${x - 6} ${top + 26} ${x - 6} ${top + 34} ${x} ${top + 36}" fill="none" stroke="${c}" stroke-width="3" stroke-linejoin="round"/>`;
  else g = `<circle cx="${x - 3}" cy="${top + 15}" r="3" fill="${c}"/><path d="M${x - 3} ${top + 17} C${x + 1} ${top + 18} ${x + 4} ${top + 16} ${x + 6} ${top + 13} L${x} ${top + 34}" fill="none" stroke="${c}" stroke-width="2.2"/>`;
  return `<g opacity="${OPACITY[look]}">${g}</g>`;
}

export interface KidItem {
  name: string | null; // null = rest
  beats: number;
  look: Look;
  letter?: boolean;
  barBefore?: boolean;
  cls?: string;
}

/**
 * The child's view: a grand staff with a short run of notes, evenly spaced, the current
 * one big. Middle C and up sit on the treble staff; anything lower on the bass staff.
 */
export const KID_GAP = 78;
/** Centre x of item `i` in kidStaff (for anything the page lays over a note). */
export const kidX = (i: number, meter: boolean, gap = KID_GAP) => (meter ? 96 : 70) + gap * i + gap / 2;
/** Where kidStaff draws a note's head (the current note is drawn 1.3x about the staff middle). */
export function kidHead(i: number, name: string, meter: boolean, now: boolean): { x: number; y: number } {
  const step = spelling(name).step;
  const clef: Clef = step >= 0 ? "treble" : "bass";
  const mid = clef === "treble" ? 60 : 140;
  const y = yOf(step, clef);
  return { x: kidX(i, meter), y: now ? mid + (y - mid) * 1.3 : y };
}

export function kidStaff(items: KidItem[], opts: { meter?: string; gap?: number; extra?: string } = {}): string {
  const gap = opts.gap ?? KID_GAP;
  const x0 = opts.meter ? 96 : 70;
  const width = x0 + gap * Math.max(4, items.length) + 20;
  let body = staffLines(4, width - 6, "treble") + staffLines(4, width - 6, "bass");
  body += `<line x1="4" x2="4" y1="40" y2="160" stroke="#495057" stroke-width="2"/><line x1="${width - 6}" x2="${width - 6}" y1="40" y2="160" stroke="#495057" stroke-width="1.3"/>`;
  body += TREBLE_CLEF + BASS_CLEF;
  if (opts.meter) body += timeSig(62, opts.meter, "treble") + timeSig(62, opts.meter, "bass");
  items.forEach((it, i) => {
    const x = kidX(i, !!opts.meter, gap);
    if (it.barBefore) body += `<line x1="${x - gap / 2}" x2="${x - gap / 2}" y1="40" y2="160" stroke="#868e96" stroke-width="1.3"/>`;
    if (it.name === null) {
      body += drawRest(x, it.beats, "treble", it.look);
      return;
    }
    const clef: Clef = spelling(it.name).step >= 0 ? "treble" : "bass";
    body += drawNote(x, [it.name], it.beats, clef, { look: it.look, letter: it.letter, scale: it.look === "now" ? 1.3 : 1, cls: it.cls });
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} 190" preserveAspectRatio="xMidYMid meet" role="img">${body}${opts.extra ?? ""}</svg>`;
}

export interface BarVoice {
  clef: Clef;
  events: { names: string[]; beats: number; look?: Look }[];
}

/**
 * One bar laid out by time, for play-along: any number of staves (the child's melody on
 * top, the grown-up's right and left hands under it), notes lined up by beat.
 */
export function barStaff(voices: BarVoice[][], meter: string, opts: { width?: number; showMeter?: boolean } = {}): string {
  const [num, den] = meter.split("/").map(Number) as [number, number];
  const barBeats = (num * 4) / den;
  const width = opts.width ?? 420;
  const x0 = opts.showMeter ? 92 : 64;
  const usable = width - x0 - 24;
  let y = 0;
  let out = "";
  for (const staves of voices) {
    // A system: one staff (melody) or a grand staff (two clefs), stacked downward.
    const grand = staves.some((v) => v.clef === "bass");
    const h = grand ? 190 : 120;
    let g = staffLines(4, width - 6, "treble");
    g += TREBLE_CLEF;
    if (grand) g += staffLines(4, width - 6, "bass") + BASS_CLEF + `<line x1="4" x2="4" y1="40" y2="160" stroke="#495057" stroke-width="2"/>`;
    g += `<line x1="${width - 6}" x2="${width - 6}" y1="40" y2="${grand ? 160 : 80}" stroke="#495057" stroke-width="1.5"/>`;
    if (opts.showMeter) {
      g += timeSig(62, meter, "treble");
      if (grand) g += timeSig(62, meter, "bass");
    }
    for (const v of staves) {
      let t = 0;
      for (const e of v.events) {
        const x = x0 + (t / barBeats) * usable + 14;
        g += e.names.length ? drawNote(x, e.names, e.beats, v.clef, { look: e.look ?? "plain" }) : drawRest(x, e.beats, v.clef, e.look ?? "plain");
        t += e.beats;
      }
    }
    out += `<g transform="translate(0 ${y})">${g}</g>`;
    y += h;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${y}" preserveAspectRatio="xMidYMid meet" role="img">${out}</svg>`;
}
