# Zelda Piano

Learn to read music on a real piano with the Ocarina of Time songs. A static PWA for an
iPad on the music stand: it listens to the piano through the mic, and progress stays on
the device. Live at https://zelda-piano.paulisageek.com.

## How it plays

- **Start**: one big ▶. The tap unlocks sound and the mic (iOS needs a tap for both).
- **Calibration**: a hush (the room's noise sets the silence gate), then an A played three
  times (the piano's tuning offset).
- **Home**: a tile per song with its star or lock, and a 🎹 note game. Songs open in
  stages, one new key each (`src/progress.ts`).
- **Play**: the notes on a grand staff, the current one big and blue, and a keyboard
  picture whose hint fades per key as he learns it. In rhythm mode (after every song has
  its star) a one-bar count-in is the only click, then a ring closes on each note when it
  is due; when he is late it waits on the note.
- **Play-along** (the long songs, with a grown-up): this bar and the next, his melody above
  the grown-up's two hands. It moves on when his melody note sounds; ◀ ▶ step by bar.
- **Grown-ups**: hold the faint ⚙ on the home screen for 1.5 s: recalibrate, rhythm tempo,
  mic sensitivity, a live readout of what the mic hears, unlock everything, reset.

The child-facing screens carry no words: icons, notes, keys and stars. All art and sound
is drawn or synthesized here; nothing comes from the game.

## Develop

    npm ci
    npm run dev       # vite on :5175
    npm test          # pitch detection on synthesized piano tones
    npm run build     # typecheck, vite build to dist/, service worker
    npm run songs -- path/to/gen.py   # re-export src/songs.json from the songbook generator
    python3 scripts/make_icon.py   # redraw the icons

## Deploy

GitHub Pages, from `.github/workflows/ci.yml`: every push to `master` runs the tests and the
build, then publishes `dist/`. The site is served at the root of a custom domain
(`web/public/CNAME`); every URL in the app is relative, so it also works from any path.
