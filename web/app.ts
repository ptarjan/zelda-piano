// Shared app state: the root element, the listener, progress and settings, small DOM helpers.
import { Listener } from "../src/listen.ts";
import { DEFAULT_PITCH } from "../src/pitch.ts";
import { nameOf } from "../src/songs.ts";
import { loadProgress, loadSettings, saveProgress, saveSettings } from "./store.ts";

export const root = document.getElementById("app")!;
export const listener = new Listener();
export const progress = loadProgress();
export const settings = loadSettings();

export function applyListenSettings(): void {
  listener.settings = {
    gate: (settings.gate ?? DEFAULT_PITCH.gate) * settings.sensitivity,
    tuningCents: settings.tuningCents ?? 0,
  };
}
applyListenSettings();

export const save = () => saveProgress(progress);
export const saveSet = () => {
  saveSettings(settings);
  applyListenSettings();
};

/** Tear-down for the screen on show; replaced by the next screen. */
let teardown: (() => void) | undefined;
export function screen(cls: string, cleanup?: () => void): HTMLElement {
  teardown?.();
  teardown = cleanup;
  listener.onNote = undefined;
  listener.onTick = undefined;
  listener.reset();
  const el = document.createElement("div");
  el.className = `screen ${cls}`;
  root.replaceChildren(el);
  return el;
}
export const setTeardown = (f: () => void) => {
  teardown = f;
};

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", text = ""): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}

export function button(text: string, cls: string, onTap: () => void): HTMLButtonElement {
  const b = h("button", cls, text);
  b.addEventListener("click", onTap);
  return b;
}

/** Keep the screen on while he plays (iPad on the music stand). */
let lock: { release(): Promise<void> } | undefined;
export async function keepAwake(): Promise<void> {
  try {
    const wl = (navigator as Navigator & { wakeLock?: { request(t: "screen"): Promise<{ release(): Promise<void> }> } }).wakeLock;
    if (wl && !lock) lock = await wl.request("screen");
  } catch {
    /* not offered: the iPad's own auto-lock applies */
  }
}
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    lock = undefined;
    void keepAwake();
  }
});

/** A little live mic meter: shows the iPad is hearing the piano. */
export function micMeter(): HTMLElement {
  const m = h("div", "mic");
  const bar = h("div", "mic-bar");
  const dbg = h("div", "mic-debug");
  m.append(h("span", "", "🎤"), bar, dbg);
  return m;
}
export function updateMeter(m: HTMLElement, rms: number, info?: string): void {
  const bar = m.querySelector<HTMLElement>(".mic-bar");
  if (bar) bar.style.transform = `scaleX(${Math.min(1, Math.sqrt(rms * 12))})`;
  const dbg = m.querySelector<HTMLElement>(".mic-debug");
  if (dbg) dbg.textContent = settings.debug ? (info ?? "") : "";
}

/** Hold `el` for `ms` to run `fn` (the grown-up door: a child's tap never opens it). */
export function longPress(el: HTMLElement, ms: number, fn: () => void): void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const cancel = () => {
    clearTimeout(timer);
    timer = undefined;
    el.classList.remove("holding");
  };
  el.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    cancel();
    el.classList.add("holding");
    el.style.setProperty("--hold", `${ms}ms`);
    timer = setTimeout(() => {
      cancel();
      fn();
    }, ms);
  });
  for (const ev of ["pointerup", "pointerleave", "pointercancel"]) el.addEventListener(ev, cancel);
  el.addEventListener("contextmenu", (e) => e.preventDefault());
}

/** The debug line for a grown-up checking what the mic hears. */
export function debugLine(p: { freq: number; midi: number; clarity: number; rms: number }): string {
  const note = Number.isFinite(p.midi) ? `${nameOf(Math.round(p.midi))} ${p.freq.toFixed(1)} Hz ${Math.round((p.midi - Math.round(p.midi)) * 100)}c` : "-";
  return `${note} · clarity ${p.clarity.toFixed(2)} · level ${p.rms.toFixed(4)} / gate ${listener.settings.gate.toFixed(4)}`;
}
