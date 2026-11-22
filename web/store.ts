// Everything is kept on this device (localStorage): his progress and the room/piano calibration.
import { fresh, type Progress } from "../src/progress.ts";

const KEY = "zelda-piano.progress";
const SETTINGS = "zelda-piano.settings";

export interface Settings {
  /** Silence gate measured from the room (RMS). */
  gate?: number;
  /** The piano's tuning offset, cents. */
  tuningCents?: number;
  /** Grown-up's sensitivity: multiplies the gate (lower = hears softer playing). */
  sensitivity: number;
  /** Rhythm level tempo, quarter notes per minute. */
  bpm: number;
  /** Show the detected note and level (for a grown-up checking the listening). */
  debug: boolean;
}

const DEFAULTS: Settings = { sensitivity: 1, bpm: 66, debug: false };

function read<T>(key: string): T | undefined {
  try {
    const s = localStorage.getItem(key);
    return s ? (JSON.parse(s) as T) : undefined;
  } catch {
    return undefined;
  }
}

export function loadProgress(): Progress {
  const p = read<Progress>(KEY);
  return p && p.version === 1 ? { ...fresh(), ...p } : fresh();
}
export function saveProgress(p: Progress): void {
  localStorage.setItem(KEY, JSON.stringify(p));
}
export function loadSettings(): Settings {
  return { ...DEFAULTS, ...read<Partial<Settings>>(SETTINGS) };
}
export function saveSettings(s: Settings): void {
  localStorage.setItem(SETTINGS, JSON.stringify(s));
}

/** Ask Safari not to clear this site's storage (granted most readily to a home-screen app). */
export function persist(): void {
  void navigator.storage?.persist?.().catch(() => undefined);
}
