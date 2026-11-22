// Home: a tile per song. A picture, a star when he has earned it, a lock while it is shut,
// a drum once rhythm is open. The newest songs glow. The grown-up door is a long press.
import { EMOJI, PHRASES } from "../../src/songs.ts";
import { newestSongs, phraseOpen, rhythmOpen, STAGES, wholeInOrder, wholeKey, wholeOpen } from "../../src/progress.ts";
import { button, h, longPress, progress, screen } from "../app.ts";
import { along } from "./along.ts";
import { grownUp } from "./grownup.ts";
import { play } from "./play.ts";

const titleOf = (id: string) => PHRASES.find((p) => p.id === id)?.title ?? id;

export function home(): void {
  const el = screen("home");
  const gear = h("button", "gear", "⚙︎");
  gear.setAttribute("aria-label", "Grown-ups (hold)");
  longPress(gear, 1500, grownUp);

  const drill = button("", "tile drill", () => play("drill"));
  drill.setAttribute("aria-label", "Note game");
  drill.innerHTML = `<span class="pic">🎹</span><span class="pic small">🎵</span>`;

  const row = h("div", "tiles");
  row.append(drill);
  const newest = new Set(newestSongs(progress));
  STAGES.forEach((st, i) => {
    const group = h("div", `stage stage-${i + 1}`);
    for (const id of st.songs) group.append(songTile(id, newest.has(id)));
    row.append(group);
  });

  el.append(gear, row);
  // The long songs (with a grown-up) appear once the first of them opens.
  if (!wholeInOrder().some((w) => wholeOpen(progress, w.id))) return;
  const long = h("div", "tiles long");
  for (const w of wholeInOrder()) {
    const open = wholeOpen(progress, w.id);
    const t = button("", `tile whole${open ? "" : " locked"}`, () => open && along(w.id));
    t.setAttribute("aria-label", `${w.title} with a grown-up`);
    t.innerHTML = `<span class="pic">${EMOJI[w.id] ?? "🎵"}</span><span class="badge">🤝</span>${stars(!!progress.songs[wholeKey(w.id)]?.star)}${open ? "" : `<span class="lock">🔒</span>`}`;
    long.append(t);
  }
  el.append(long);
}

function songTile(id: string, isNew: boolean): HTMLElement {
  const open = phraseOpen(progress, id);
  const s = progress.songs[id] ?? {};
  const t = h("div", `tile song${open ? "" : " locked"}${open && isNew && !s.star ? " new" : ""}`);
  t.setAttribute("role", "button");
  t.setAttribute("aria-label", titleOf(id));
  t.innerHTML = `<span class="pic">${EMOJI[id] ?? "🎵"}</span>${stars(!!s.star)}${open ? "" : `<span class="lock">🔒</span>`}`;
  if (open) t.addEventListener("click", () => play("free", id));
  if (open && rhythmOpen(progress, id)) {
    const drum = button(s.rhythm ? "🥁⭐" : "🥁", "drum", () => play("rhythm", id));
    drum.setAttribute("aria-label", `${titleOf(id)} in rhythm`);
    drum.addEventListener("click", (e) => e.stopPropagation());
    t.append(drum);
  }
  return t;
}

const stars = (earned: boolean) => `<span class="star${earned ? " on" : ""}">${earned ? "⭐" : "☆"}</span>`;
