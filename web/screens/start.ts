// The first screen: one big play button. The tap is what lets iOS start sound and the mic.
import { audio } from "../../src/synth.ts";
import { persist } from "../store.ts";
import { button, h, keepAwake, listener, screen, settings } from "../app.ts";
import { calibrate } from "./calibrate.ts";
import { home } from "./home.ts";
import { logo } from "./art.ts";

export function start(): void {
  const el = screen("start");
  const art = h("div", "logo");
  art.innerHTML = logo();
  const go = button("▶", "big-go", () => void begin());
  go.setAttribute("aria-label", "Start");
  const err = h("div", "mic-err");
  el.append(art, go, err);

  async function begin(): Promise<void> {
    audio(); // must happen inside the tap
    go.disabled = true;
    try {
      await listener.start();
    } catch {
      // Mic refused or missing: show a crossed mic and let him (or a grown-up) try again.
      err.textContent = "🎤 ✖";
      go.disabled = false;
      return;
    }
    persist();
    void keepAwake();
    if (settings.gate === undefined) calibrate();
    else home();
  }
}
