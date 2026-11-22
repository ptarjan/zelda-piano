#!/usr/bin/env python3
"""Export the songbook's melodies to src/songs.json.

    python3 scripts/export_songs.py <path/to/gen.py>

gen.py (the LilyPond songbook generator) is the single source of the notes:
S (the 12 ocarina phrases), WHOLE (each song's longer theme) and INTER (the
grown-up's two-hand play-along part). This imports it and writes every note
as a MIDI number with its length in quarter-note beats, so pitches and
octaves are exactly the songbook's and never transposed or retyped.
"""

from __future__ import annotations

import importlib.util
import json
import re
import sys
from fractions import Fraction
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "src" / "songs.json"


def load(path: str):
    spec = importlib.util.spec_from_file_location("songbook_gen", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)  # module level only defines data; __main__ guard skips the build
    return mod


def slug(title: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", title.lower().replace("'", "")).strip("-")


def beats(d: str) -> float:
    """LilyPond duration ('4', '2.', '8') -> quarter-note beats."""
    v = Fraction(3, 2) / int(d[:-1]) if d.endswith(".") else Fraction(1, int(d))
    return float(v * 4)


def spell(g, p: str) -> str:
    """LilyPond pitch -> written name with octave, keeping its sharp or flat ("bes''" -> "Bb5")."""
    return g.letter(p) + str(3 + p.count("'") - p.count(","))


def phrase(g, s) -> dict:
    title, _place, _tip, _notes, meter, _letters, _icons, seq = g.song(s)
    rhythm, fingers = s[3], s[5]
    keys = iter(zip(seq, fingers))
    notes = []
    for r in rhythm:
        if r.startswith("r"):
            notes.append({"midi": None, "beats": beats(r[1:])})
            continue
        b, f = next(keys)
        p = g.B[b][0]
        notes.append({"midi": g.midi(p), "name": spell(g, p), "beats": beats(r), "finger": int(f)})
    return {"id": slug(title), "title": title, "meter": meter, "notes": notes}


def whole(g, title: str) -> dict | None:
    w = g.WHOLE[title]
    if w.get("none"):
        return None
    bars = g.parse(w["bars"], w["meter"])
    out = []
    for bar in bars:
        out.append([
            {"midi": None, "beats": beats(d)} if p == "r" else
            {"midi": g.midi(p), "name": spell(g, p), "beats": beats(d), **({"tie": True} if tie else {})}
            for p, d, _f, tie in bar
        ])
    return {"id": slug(title), "title": title, "meter": w["meter"], "bars": out}


def chord_bar(g, toks: list[str]) -> list[dict]:
    out = []
    for t in toks:
        m = g.TOKEN.match(t)
        assert m, t
        pitches = m.group(1).split() if m.group(1) else [m.group(2)]
        notes = [] if pitches == ["r"] else sorted(pitches, key=g.midi)
        out.append({"midis": [g.midi(p) for p in notes], "names": [spell(g, p) for p in notes], "beats": beats(m.group(3)), **({"tie": True} if m.group(4) == "~" else {})})
    return out


def inter(g, title: str) -> list[dict]:
    """The grown-up's part, bar by bar: right hand (melody + harmony) and left hand.
    Rebuilt with gen.py's own inter() logic so it is the songbook's exact part."""
    i = g.INTER[title]
    kid = g.parse(g.WHOLE[title]["bars"], g.WHOLE[title]["meter"])
    rh, idx = [], 0
    for bar in kid:
        toks = []
        for p, d, _f, tie in bar:
            if p == "r":
                toks.append("r" + d)
                continue
            tok = f"<{i['harm'][idx][1]} {p}>{d}" if idx in i["harm"] else f"{p}{d}"
            toks.append(tok + ("~" if tie else ""))
            idx += 1
        rh.append(toks)
    lh = []
    for bar in i["lh"].split("|"):
        toks, cur = [], ""
        for t in bar.split():
            cur = f"{cur} {t}" if cur else t
            if cur.startswith("<") and ">" not in cur:
                continue
            toks.append(cur)
            cur = ""
        lh.append(toks)
    assert len(rh) == len(lh), title
    return [{"rh": chord_bar(g, r), "lh": chord_bar(g, l)} for r, l in zip(rh, lh)]


def main() -> None:
    if len(sys.argv) < 2:
        sys.exit("usage: export_songs.py <path/to/gen.py>")
    g = load(sys.argv[1])
    phrases = [phrase(g, s) for s in g.S[:12]]
    wholes = []
    for p in phrases:
        if p["title"] not in g.WHOLE:
            continue
        w = whole(g, p["title"])
        if not w:
            continue
        if p["title"] in g.INTER:
            w["partner"] = inter(g, p["title"])
        wholes.append(w)
    data = {
        "source": "Exported from the family Ocarina Songbook generator (gen.py) by scripts/export_songs.py. Do not edit by hand.",
        "phrases": phrases,
        "whole": wholes,
    }
    OUT.write_text(json.dumps(data, indent=1) + "\n")
    print(f"wrote {OUT}: {len(phrases)} phrases, {len(wholes)} whole songs, "
          f"{sum(1 for w in wholes if 'partner' in w)} with a play-along part")


if __name__ == "__main__":
    main()
