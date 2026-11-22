// A picture of the keys (SVG string), white keys from C to E around the song's range.
// Keys carry data-midi so the page can light them: .lit (play this), .ok, .oops.

const WHITE = [0, 2, 4, 5, 7, 9, 11];
const LETTER: Record<number, string> = { 0: "C", 2: "D", 4: "E", 5: "F", 7: "G", 9: "A", 11: "B" };
const isWhite = (m: number) => WHITE.includes(((m % 12) + 12) % 12);

/** Range to draw: at least C4..E5, widened to whole C..E spans around the notes. */
export function keyRange(midis: number[]): [number, number] {
  let lo = Math.min(60, ...midis);
  let hi = Math.max(76, ...midis);
  while (lo % 12 !== 0) lo--;
  while (hi % 12 !== 4 && hi % 12 !== 11) hi++;
  return [lo, hi];
}

export function keyboardSvg(lo: number, hi: number): string {
  const whites: number[] = [];
  for (let m = lo; m <= hi; m++) if (isWhite(m)) whites.push(m);
  const w = 40, h = 160, bw = 24, bh = 100;
  let s = "";
  whites.forEach((m, i) => {
    s += `<g class="key white" data-midi="${m}"><rect x="${i * w + 1}" y="1" width="${w - 2}" height="${h}" rx="5"/>`;
    s += `<text x="${i * w + w / 2}" y="${h - 14}" text-anchor="middle" class="kl">${LETTER[m % 12]}</text>`;
    if (m === 60) s += `<circle cx="${i * w + w / 2}" cy="${h - 40}" r="4" class="mc"/>`;
    s += `</g>`;
  });
  whites.forEach((m, i) => {
    const b = m + 1;
    if (b <= hi && !isWhite(b)) s += `<g class="key black" data-midi="${b}"><rect x="${(i + 1) * w - bw / 2}" y="1" width="${bw}" height="${bh}" rx="3"/></g>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${whites.length * w + 2} ${h + 2}" preserveAspectRatio="xMidYMid meet">${s}</svg>`;
}
