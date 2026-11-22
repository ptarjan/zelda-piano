// Entry: the start screen, the offline service worker, and getting audio back after the
// iPad sleeps (iOS suspends the AudioContext; any tap resumes it).
import { audio } from "../src/synth.ts";
import { listener } from "./app.ts";
import { start } from "./screens/start.ts";

start();

document.addEventListener("pointerdown", () => {
  if (listener.running) audio();
});

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  void navigator.serviceWorker.register("./sw.js").catch(() => undefined);
}
