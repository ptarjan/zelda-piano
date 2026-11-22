"""Draw the app icon (our own art: a blue ocarina over piano keys) into web/public/.

Run by hand when the art changes: python3 scripts/make_icon.py. Needs Pillow.
"""

from pathlib import Path

from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "web" / "public"
S = 1024  # drawn large, scaled down for each size
FOREST, DEEP, PAPER, BLUE, LIGHT, GOLD, BLACK = "#1f5f3a", "#0f3a24", "#fffdf6", "#3b82c4", "#74b5ec", "#ffd43b", "#212529"


def draw() -> Image.Image:
    im = Image.new("RGB", (S, S), FOREST)
    d = ImageDraw.Draw(im)
    # Keys across the bottom: a maskable icon keeps its art inside the middle 80%.
    x0, w, top, bottom = 152, 103, 600, 880
    for i in range(7):
        d.rounded_rectangle((x0 + i * w, top, x0 + i * w + w - 8, bottom), 18, fill=PAPER, outline=DEEP, width=8)
    for i in (0, 1, 3, 4, 5):
        bx = x0 + (i + 1) * w - 34
        d.rounded_rectangle((bx, top, bx + 60, top + 170), 12, fill=BLACK)
    # Ocarina, drawn on its own layer and tilted.
    oc = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    o = ImageDraw.Draw(oc)
    cx, cy = 500, 400
    o.rounded_rectangle((cx + 230, cy - 45, cx + 340, cy + 45), 30, fill=BLUE, outline=DEEP, width=12)
    o.ellipse((cx - 270, cy - 165, cx + 270, cy + 165), fill=BLUE, outline=DEEP, width=12)
    o.ellipse((cx - 210, cy - 120, cx + 120, cy - 20), fill=LIGHT)
    for hx, hy in ((-150, 20), (-65, 50), (25, 50), (110, 20)):
        o.ellipse((cx + hx - 24, cy + hy - 24, cx + hx + 24, cy + hy + 24), fill=DEEP)
    oc = oc.rotate(12, center=(cx, cy), resample=Image.BICUBIC)
    im.paste(oc, (0, 0), oc)
    # A gold note at the top right.
    d.ellipse((700, 170, 790, 240), fill=GOLD, outline=DEEP, width=6)
    d.rectangle((772, 70, 790, 205), fill=GOLD)
    d.polygon(((790, 70), (860, 100), (860, 130), (790, 100)), fill=GOLD)
    return im


def main() -> None:
    big = draw()
    for size in (180, 192, 512):
        big.resize((size, size), Image.LANCZOS).save(OUT / f"icon-{size}.png", optimize=True)
    print(f"icons written to {OUT}")


if __name__ == "__main__":
    main()
