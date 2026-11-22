// Playing a song, three ways:
//   free   — the notes wait for him; each right key moves on.
//   drill  — the same, with a short run of single notes from the keys he knows.
//   rhythm — a one-bar count-in (the only click), then a ring closes on each note when it
//            is due. Early or on time keeps the beat going; late, and the ring waits on the
//            note and the beat starts again from his strike.
// The keyboard picture lights the key as much as hintFor() says this note still needs.
import { keyboardSvg, keyRange } from "../../src/keyboard.ts";
import { matches } from "../../src/pitch.ts";
import {
  hintFor,
  LATE_HINT_S,
  noteDrill,
  phraseById,
  recordNote,
  recordSong,
  RHYTHM_RATE,
  SLIPS_BEFORE_LIGHT,
  STAGES,
  STAR_RATE,
  stagesOpen,
  type Hint,
} from "../../src/progress.ts";
import { nameOf, noteName, phraseTune, pitchesOf, struck, type Tune } from "../../src/songs.ts";
import { kidHead, kidStaff, type KidItem } from "../../src/staff.ts";
import { audio, chime, click, playNotes } from "../../src/synth.ts";
import { button, debugLine, h, listener, micMeter, progress, save, screen, settings, updateMeter } from "../app.ts";
import { home } from "./home.ts";

export type Mode = "free" | "drill" | "rhythm";

function tuneFor(mode: Mode, id?: string): Tune {
  if (mode === "drill") {
    const notes = noteDrill(progress).map((m) => ({ midi: m, name: nameOf(m), beats: 1 }));
    return { id: "drill", title: "", meter: "4/4", notes };
  }
  const p = id ? phraseById(id) : undefined;
  if (!p) throw new Error(`no song ${id}`);
  return phraseTune(p);
}

/** Beat position where each note starts. */
const starts = (t: Tune) => {
  let b = 0;
  return t.notes.map((n) => ((b += n.beats), b - n.beats));
};

export function play(mode: Mode, id?: string): void {
  const tune = tuneFor(mode, id);
  const notes = tune.notes;
  const targets = struck(notes);
  const song = pitchesOf(notes);
  const pos = starts(tune);
  const [num, den] = tune.meter.split("/").map(Number) as [number, number];
  const barBeats = (num * 4) / den;
  const showMeter = mode !== "drill";

  let k = 0; // index into targets
  let firstRight = 0;
  let onBeat = 0;
  let hint: Hint = "letter";
  let lit = false;
  let slips = 0;
  let answered = false;
  let finished = false;
  let lateTimer: ReturnType<typeof setTimeout> | undefined;
  let raf = 0;
  const timers: ReturnType<typeof setTimeout>[] = [];

  // Rhythm clock (AudioContext seconds): note i is due at anchorT + (pos[i] - anchorBeat) * beat.
  const beat = 60 / settings.bpm;
  const tol = Math.max(0.12, 0.3 * beat);
  let counting = mode === "rhythm";
  let anchorT = 0;
  let anchorBeat = 0;
  const due = (i: number) => anchorT + (pos[i]! - anchorBeat) * beat;

  const el = screen(`play mode-${mode}`, () => {
    clearTimeout(lateTimer);
    timers.forEach(clearTimeout);
    cancelAnimationFrame(raf);
  });
  const top = h("div", "top");
  const homeBtn = button("🏠", "round", home);
  homeBtn.setAttribute("aria-label", "Home");
  const pips = h("div", "pips");
  targets.forEach(() => pips.append(h("span", "pip")));
  const hear = button("🔊", "round", () => void demo());
  hear.setAttribute("aria-label", "Hear it");
  const meter = micMeter();
  top.append(homeBtn, pips, hear, meter);
  const staff = h("div", "staff card");
  const keys = h("div", "keys card");
  const [lo, hi] = keyRange(song);
  keys.innerHTML = keyboardSvg(lo, hi);
  el.append(top, staff, keys);

  const target = () => notes[targets[k]!]!.midi!;

  function drawStaff(): void {
    const cur = targets[k] ?? notes.length;
    let beats = 0;
    const items: KidItem[] = notes.map((n, i) => {
      const barBefore = i > 0 && Math.abs(beats / barBeats - Math.round(beats / barBeats)) < 1e-6 && mode !== "drill";
      beats += n.beats;
      const look = i < cur ? "done" : i === cur ? "now" : "next";
      return { name: n.midi === null ? null : noteName(n), beats: n.beats, look, letter: i === cur && hint === "letter", barBefore };
    });
    const ring = mode === "rhythm" && !finished ? ringSvg(cur) : "";
    staff.innerHTML = kidStaff(items, { meter: showMeter ? tune.meter : undefined, extra: ring });
    pips.querySelectorAll(".pip").forEach((p, i) => p.classList.toggle("on", i < k));
  }

  function ringSvg(cur: number): string {
    const n = notes[cur];
    if (!n || n.midi === null) return "";
    const { x, y } = kidHead(cur, noteName(n), showMeter, true);
    return `<circle class="ring" cx="${x}" cy="${y}" r="0"/>`;
  }

  function drawKeys(): void {
    keys.querySelectorAll(".key").forEach((g) => g.classList.remove("lit", "letter"));
    if (finished || !lit) return;
    const g = keys.querySelector(`[data-midi="${target()}"]`);
    g?.classList.add("lit");
    if (hint === "letter") g?.classList.add("letter");
  }

  function flash(midi: number, cls: "ok" | "oops"): void {
    const g = keys.querySelector(`[data-midi="${midi}"]`);
    if (!g) return;
    g.classList.add(cls);
    timers.push(setTimeout(() => g.classList.remove(cls), 450));
  }

  /** Set up the note now due: how much help it gets. */
  function enter(): void {
    clearTimeout(lateTimer);
    hint = hintFor(progress, target());
    lit = SLIPS_BEFORE_LIGHT[hint] === 0;
    slips = 0;
    answered = false;
    if (hint === "late") {
      lateTimer = setTimeout(() => {
        lit = true;
        drawKeys();
      }, LATE_HINT_S * 1000);
    }
    drawStaff();
    drawKeys();
  }

  listener.onTick = (t) => updateMeter(meter, t.pitch.rms, debugLine(t.pitch));
  listener.onNote = (e) => {
    if (finished || counting) return;
    const want = target();
    const ok = matches(want, e.midi, song);
    if (!answered) {
      answered = true;
      recordNote(progress, want, ok, lit);
      if (ok) firstRight++;
      save();
    }
    if (!ok) {
      slips++;
      flash(e.midi, "oops");
      staff.classList.remove("shake");
      void staff.offsetWidth; // restart the animation
      staff.classList.add("shake");
      if (slips >= SLIPS_BEFORE_LIGHT[hint] && !lit) {
        lit = true;
        drawKeys();
      }
      return;
    }
    flash(want, "ok");
    if (mode === "rhythm") {
      const i = targets[k]!;
      const d = due(i);
      if (Math.abs(e.at - d) <= tol) onBeat++;
      // Late: the beat starts again from his strike. Otherwise it stays on the grid.
      if (e.at - d > tol) {
        anchorT = e.at;
        anchorBeat = pos[i]!;
      }
    }
    k++;
    if (k >= targets.length) finish();
    else enter();
  };

  async function demo(): Promise<void> {
    if (mode === "rhythm" && anchorT) return; // the beat has started: the app keeps quiet
    hear.disabled = true;
    const bpm = mode === "rhythm" ? settings.bpm : Math.max(settings.bpm, 80);
    const spb = 60000 / bpm;
    targets.forEach((i) => {
      timers.push(setTimeout(() => flash(notes[i]!.midi!, "ok"), pos[i]! * spb + 80));
    });
    await playNotes(notes, bpm);
    listener.reset();
    hear.disabled = false;
  }

  function startRhythm(): void {
    const go = button("🥁 ▶", "big-go overlay-go", () => {
      go.remove();
      const c = audio();
      const count = Math.round(barBeats);
      const t0 = c.currentTime + 0.4;
      for (let j = 0; j < count; j++) click(t0 + j * beat, j === 0);
      anchorT = t0 + count * beat;
      anchorBeat = pos[targets[0]!]!;
      const dots = h("div", "dots count");
      for (let j = 0; j < count; j++) dots.append(h("span", "dot"));
      staff.append(dots);
      const frame = () => {
        const now = c.currentTime;
        if (counting) {
          const n = Math.floor((now - t0) / beat) + 1;
          dots.querySelectorAll(".dot").forEach((d, j) => d.classList.toggle("on", j < n));
          // Notes struck in the last moment of the count-in can be early for the downbeat.
          if (now >= anchorT - tol) {
            counting = false;
            dots.remove();
            listener.reset();
          }
        }
        if (!finished) {
          const ring = staff.querySelector<SVGCircleElement>(".ring");
          if (ring && targets[k] !== undefined) {
            const left = due(targets[k]!) - now;
            ring.setAttribute("r", String(10 + 42 * Math.min(1, Math.max(0, left / beat))));
            ring.classList.toggle("wait", left < -tol);
            ring.classList.toggle("due", Math.abs(left) <= tol);
          }
          raf = requestAnimationFrame(frame);
        }
      };
      raf = requestAnimationFrame(frame);
    });
    go.setAttribute("aria-label", "Start the beat");
    staff.append(go);
  }

  function finish(): void {
    finished = true;
    clearTimeout(lateTimer);
    drawStaff();
    drawKeys();
    const rate = mode === "rhythm" ? onBeat / targets.length : firstRight / targets.length;
    const bar = mode === "rhythm" ? RHYTHM_RATE : STAR_RATE;
    let earned = false;
    let opened: number[] = [];
    if (mode !== "drill" && id) {
      const before = stagesOpen(progress);
      earned = recordSong(progress, id, rate, mode === "rhythm" ? "rhythm" : "free");
      const after = stagesOpen(progress);
      if (after > before) opened = STAGES[after - 1]!.add;
      save();
    }
    const count = rate >= bar ? 3 : rate >= 0.5 ? 2 : 1;
    const over = h("div", "overlay");
    const row = h("div", `stars-row${earned ? " earned" : ""}`);
    for (let i = 0; i < 3; i++) row.append(h("span", i < count ? "big-star on" : "big-star", i < count ? "⭐" : "☆"));
    over.append(row);
    if (opened.length) {
      const nk = h("div", "new-key");
      nk.innerHTML =
        `<span class="pic">🔓</span>` +
        kidStaff(
          opened.map((m) => ({ name: nameOf(m), beats: 1, look: "now" as const, letter: true })),
          {},
        );
      over.append(nk);
    }
    const again = button("🔁", "round big", () => play(mode, id));
    again.setAttribute("aria-label", "Again");
    const back = button("🏠", "round big", home);
    back.setAttribute("aria-label", "Home");
    const btns = h("div", "over-btns");
    btns.append(again, back);
    over.append(btns);
    el.append(over);
    if (count >= 2) void chime();
  }

  enter();
  if (mode === "rhythm") startRhythm();
}
