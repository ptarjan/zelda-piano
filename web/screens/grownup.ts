// The grown-up panel (behind a long press on the gear): words are fine here.
import { fresh } from "../../src/progress.ts";
import { button, debugLine, h, listener, progress, root, save, saveSet, settings } from "../app.ts";
import { calibrate } from "./calibrate.ts";
import { home } from "./home.ts";

/** Sensitivity slider 1..9 <-> gate multiplier: 5 is 1x, each step a factor of sqrt(2); higher hears softer playing. */
const toMult = (v: number) => 2 ** ((5 - v) / 2);
const toSlider = (m: number) => Math.round(5 - 2 * Math.log2(m));

export function grownUp(): void {
  const panel = h("div", "grownup");
  const card = h("div", "gu-card");
  panel.append(card);

  const close = () => {
    listener.onTick = undefined;
    panel.remove();
    home();
  };
  const x = button("✕", "corner", close);
  x.setAttribute("aria-label", "Close");
  card.append(x, h("h2", "", "Grown-ups"));

  const row = (label: string, ...kids: HTMLElement[]) => {
    const r = h("div", "gu-row");
    r.append(h("span", "gu-label", label), ...kids);
    card.append(r);
    return r;
  };

  row("Listening", button("Recalibrate", "gu-btn", () => {
    panel.remove();
    calibrate();
  }));

  const tempoVal = h("span", "gu-val", `${settings.bpm} ♩/min`);
  const tempo = slider(40, 120, 2, settings.bpm, (v) => {
    settings.bpm = v;
    tempoVal.textContent = `${v} ♩/min`;
    saveSet();
  });
  row("Rhythm tempo", tempo, tempoVal);

  const sensVal = h("span", "gu-val", `${toSlider(settings.sensitivity)}`);
  const sens = slider(1, 9, 1, toSlider(settings.sensitivity), (v) => {
    settings.sensitivity = toMult(v);
    sensVal.textContent = String(v);
    saveSet();
  });
  row("Mic sensitivity (higher hears softer playing)", sens, sensVal);

  const readout = h("div", "gu-readout");
  row("Show what the mic hears", toggle(settings.debug, (on) => {
    settings.debug = on;
    saveSet();
  }));
  card.append(readout);
  listener.onTick = (t) => {
    readout.textContent = debugLine(t.pitch);
  };
  const cal = h("div", "gu-note", `Gate ${settings.gate?.toFixed(4) ?? "not measured"} · tuning ${settings.tuningCents ?? 0} cents`);
  card.append(cal);

  row("Unlock everything", toggle(!!progress.unlockAll, (on) => {
    progress.unlockAll = on || undefined;
    save();
  }));

  let armed = false;
  const reset = button("Reset progress", "gu-btn danger", () => {
    if (!armed) {
      armed = true;
      reset.textContent = "Tap again to erase all progress";
      return;
    }
    delete progress.unlockAll;
    Object.assign(progress, fresh());
    save();
    reset.textContent = "Progress erased";
    reset.disabled = true;
  });
  row("Start over", reset);

  card.append(h("div", "gu-note", `Build ${__BUILD__}`));
  root.append(panel);
}

function slider(min: number, max: number, step: number, value: number, on: (v: number) => void): HTMLInputElement {
  const s = h("input", "gu-slider");
  s.type = "range";
  s.min = String(min);
  s.max = String(max);
  s.step = String(step);
  s.value = String(value);
  s.addEventListener("input", () => on(Number(s.value)));
  return s;
}

function toggle(value: boolean, on: (v: boolean) => void): HTMLInputElement {
  const t = h("input", "gu-toggle");
  t.type = "checkbox";
  t.checked = value;
  t.addEventListener("change", () => on(t.checked));
  return t;
}
