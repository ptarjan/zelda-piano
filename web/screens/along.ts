// Play-along: a long song with a grown-up. Two bars at a time, this one and the next; in
// each, his melody sits on its own staff above the grown-up's two hands. The song moves on
// when his melody note sounds. With the grown-up's chords in the room a single pitch
// estimate is unreliable, so besides the note tracker it checks, just after each strike,
// whether the melody note's partials stand out of the mix (presence()). ◀ ▶ step by bar.
import { matches, presence } from "../../src/pitch.ts";
import { recordSong, STAR_RATE, wholeById, wholeKey } from "../../src/progress.ts";
import { noteName, pitchesOf, struck, wholeTune } from "../../src/songs.ts";
import { barStaff, type BarVoice, type Look } from "../../src/staff.ts";
import { chime } from "../../src/synth.ts";
import { button, debugLine, h, listener, micMeter, progress, save, screen, settings, updateMeter } from "../app.ts";
import { home } from "./home.ts";

/** presence() at or above this, after a strike, counts as his note (test/pitch.test.ts: >2 present, <1.5 absent). */
const PRESENT = 2;
/** ...and it must have risen this much over just before the strike (not a note still ringing). */
const RISE = 1.3;
/** Seconds after a strike in which to look: long enough for the 8192-sample window to fill with it. */
const LOOK = [0.05, 0.4] as const;

export function along(id: string): void {
  const w = wholeById(id);
  if (!w) throw new Error(`no song ${id}`);
  const tune = wholeTune(w);
  const notes = tune.notes;
  const starts = tune.barStarts!;
  const targets = struck(notes);
  const song = pitchesOf(notes);
  const heard = new Set<number>();
  let k = 0;
  let onsetAt = -Infinity;
  let usedOnset = -Infinity;
  let before = 0;
  let finished = false;

  const barOf = (i: number) => {
    let b = 0;
    while (b + 1 < starts.length && starts[b + 1]! <= i) b++;
    return b;
  };

  const el = screen("along");
  const top = h("div", "top");
  const homeBtn = button("🏠", "round", home);
  homeBtn.setAttribute("aria-label", "Home");
  const prev = button("◀", "round", () => jump(-1));
  prev.setAttribute("aria-label", "Back a bar");
  const pips = h("div", "pips");
  w.bars.forEach(() => pips.append(h("span", "pip")));
  const next = button("▶", "round", () => jump(1));
  next.setAttribute("aria-label", "Next bar");
  const meter = micMeter();
  top.append(homeBtn, prev, pips, next, meter);
  const bars = h("div", "bars");
  const now = h("div", "bar card now");
  const after = h("div", "bar card soon");
  bars.append(now, after);
  el.append(top, bars);

  function barSvg(b: number, cur: number): string {
    const bar = w!.bars[b];
    if (!bar) return "";
    const first = starts[b]!;
    const melody: BarVoice = {
      clef: "treble",
      events: bar.map((n, j) => {
        const gi = first + j;
        const look: Look = gi < cur ? "done" : gi === cur ? "now" : "plain";
        return { names: n.midi === null ? [] : [noteName(n)], beats: n.beats, look };
      }),
    };
    const p = w!.partner?.[b];
    const systems: BarVoice[][] = [[melody]];
    if (p) {
      systems.push([
        { clef: "treble", events: p.rh.map((c) => ({ names: c.names, beats: c.beats, look: "plain" as const })) },
        { clef: "bass", events: p.lh.map((c) => ({ names: c.names, beats: c.beats, look: "plain" as const })) },
      ]);
    }
    return barStaff(systems, w!.meter, { showMeter: b === 0, width: 440 });
  }

  function draw(): void {
    const cur = targets[k] ?? notes.length;
    const b = barOf(Math.min(cur, notes.length - 1));
    now.innerHTML = barSvg(b, cur);
    after.innerHTML = barSvg(b + 1, cur);
    after.classList.toggle("empty", b + 1 >= w!.bars.length);
    pips.querySelectorAll(".pip").forEach((p, i) => p.classList.toggle("on", i < b));
    prev.disabled = b === 0;
  }

  function advance(byEar: boolean): void {
    if (finished) return;
    if (byEar) heard.add(k);
    k++;
    if (k >= targets.length) finish();
    else draw();
  }

  /** Move to the first melody note of the bar `dir` away from the current one. */
  function jump(dir: number): void {
    if (finished) return;
    const b = barOf(targets[k]!) + dir;
    if (b < 0) return;
    if (b >= w!.bars.length) return finish();
    const nk = targets.findIndex((i) => i >= starts[b]!);
    k = nk < 0 ? targets.length : nk;
    listener.reset();
    if (k >= targets.length) finish();
    else draw();
  }

  listener.onTick = (t) => {
    updateMeter(meter, t.pitch.rms, debugLine(t.pitch));
    if (finished) return;
    if (t.onset) onsetAt = t.at;
    const want = notes[targets[k]!]!.midi!;
    const p = presence(t.long, t.sampleRate, want, settings.tuningCents ?? 0);
    const since = t.at - onsetAt;
    if (since < LOOK[0]) {
      if (!t.onset) before = p;
      return;
    }
    if (since > LOOK[1] || onsetAt === usedOnset) {
      before = p;
      return;
    }
    if (t.pitch.rms >= listener.settings.gate && p >= PRESENT && p > before * RISE) {
      usedOnset = onsetAt;
      advance(true);
    }
  };
  listener.onNote = (e) => {
    if (finished || e.at <= usedOnset + 0.05) return;
    if (matches(notes[targets[k]!]!.midi!, e.midi, song)) {
      usedOnset = e.at;
      onsetAt = e.at;
      advance(true);
    }
  };

  function finish(): void {
    if (finished) return;
    finished = true;
    const rate = heard.size / targets.length;
    const earned = recordSong(progress, wholeKey(id), rate, "free");
    save();
    k = targets.length;
    draw();
    const over = h("div", "overlay");
    const row = h("div", `stars-row${earned ? " earned" : ""}`);
    const got = rate >= STAR_RATE;
    row.append(h("span", got ? "big-star on" : "big-star", got ? "⭐" : "☆"));
    const again = button("🔁", "round big", () => along(id));
    again.setAttribute("aria-label", "Again");
    const back = button("🏠", "round big", home);
    back.setAttribute("aria-label", "Home");
    const btns = h("div", "over-btns");
    btns.append(again, back);
    over.append(row, btns);
    el.append(over);
    if (got) void chime();
  }

  draw();
}
