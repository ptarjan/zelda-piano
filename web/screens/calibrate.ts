// Calibration, in two pictures: a hush (the app measures the room's noise for its silence
// gate) and an A to play three times (it measures how far the piano sits from A440).
import { keyboardSvg } from "../../src/keyboard.ts";
import { gateFromNoise, tuningFrom } from "../../src/pitch.ts";
import { kidStaff } from "../../src/staff.ts";
import { chime } from "../../src/synth.ts";
import { button, debugLine, h, listener, micMeter, saveSet, screen, settings, updateMeter } from "../app.ts";
import { home } from "./home.ts";

const HUSH_S = 2.5;
const A4 = 69;
const STRIKES = 3;

export function calibrate(): void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const el = screen("calibrate", () => clearTimeout(timer));
  const skip = button("⏭", "corner", () => home());
  skip.setAttribute("aria-label", "Skip");
  const meter = micMeter();
  const stage = h("div", "cal-stage card");
  el.append(skip, stage, meter);
  hush();

  function hush(): void {
    stage.innerHTML = `<div class="cal-icon">🤫</div><div class="cal-ring"><div class="cal-fill"></div></div>`;
    const fill = stage.querySelector<HTMLElement>(".cal-fill")!;
    const levels: number[] = [];
    let t0: number | undefined;
    listener.onTick = (t) => {
      updateMeter(meter, t.pitch.rms, debugLine(t.pitch));
      t0 ??= t.at;
      levels.push(t.pitch.rms);
      const done = Math.min(1, (t.at - t0) / HUSH_S);
      fill.style.transform = `scaleX(${done})`;
      if (done >= 1) {
        settings.gate = gateFromNoise(levels);
        settings.tuningCents = 0;
        saveSet();
        playA();
      }
    };
  }

  function playA(): void {
    listener.reset();
    stage.innerHTML = "";
    const staff = h("div", "cal-staff");
    staff.innerHTML = kidStaff([{ name: "A4", beats: 1, look: "now", letter: true }], {});
    const keys = h("div", "cal-keys");
    keys.innerHTML = keyboardSvg(60, 76);
    keys.querySelector(`[data-midi="${A4}"]`)?.classList.add("lit", "letter");
    const dots = h("div", "dots big");
    for (let i = 0; i < STRIKES; i++) dots.append(h("span", "dot"));
    stage.append(staff, dots, keys);
    const heard: number[] = [];
    listener.onTick = (t) => updateMeter(meter, t.pitch.rms, debugLine(t.pitch));
    listener.onNote = (e) => {
      if (Math.abs(e.midi - A4) > 1) return;
      heard.push(e.midi + e.cents / 100);
      dots.children[heard.length - 1]?.classList.add("on");
      if (heard.length < STRIKES) return;
      listener.onNote = undefined;
      settings.tuningCents = tuningFrom(A4, heard) ?? 0;
      saveSet();
      stage.innerHTML = `<div class="cal-icon pop">✅</div>`;
      void chime();
      timer = setTimeout(home, 1400);
    };
  }
}
