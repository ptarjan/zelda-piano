// Our own pictures (SVG strings): a blue clay ocarina over piano keys. Nothing from the game.

export function logo(): string {
  const keys = Array.from({ length: 7 }, (_, i) => `<rect x="${30 + i * 40}" y="150" width="38" height="90" rx="6" fill="#fffdf6" stroke="#0f3a24" stroke-width="3"/>`).join("");
  const blacks = [0, 1, 3, 4, 5].map((i) => `<rect x="${58 + i * 40}" y="150" width="22" height="56" rx="4" fill="#212529"/>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 340 250" role="img" aria-label="Zelda Piano">
  ${keys}${blacks}
  <g transform="translate(170 92) rotate(-12)">
    <ellipse cx="0" cy="0" rx="92" ry="56" fill="#3b82c4" stroke="#0f3a24" stroke-width="4"/>
    <ellipse cx="-14" cy="-18" rx="56" ry="20" fill="#74b5ec" opacity="0.6"/>
    <rect x="78" y="-14" width="40" height="28" rx="10" fill="#3b82c4" stroke="#0f3a24" stroke-width="4"/>
    <circle cx="-50" cy="6" r="8" fill="#0f3a24"/><circle cx="-22" cy="16" r="8" fill="#0f3a24"/>
    <circle cx="8" cy="16" r="8" fill="#0f3a24"/><circle cx="36" cy="6" r="8" fill="#0f3a24"/>
    <circle cx="-8" cy="-30" r="5" fill="#0f3a24"/>
  </g>
  <g fill="#ffd43b" stroke="#0f3a24" stroke-width="2.5">
    <ellipse cx="44" cy="58" rx="13" ry="10" transform="rotate(-20 44 58)"/><path d="M55 54 V14 L72 22" fill="none" stroke-width="5" stroke="#ffd43b"/>
    <ellipse cx="292" cy="40" rx="13" ry="10" transform="rotate(-20 292 40)"/><path d="M303 36 V2" fill="none" stroke-width="5" stroke="#ffd43b"/>
  </g>
</svg>`;
}
