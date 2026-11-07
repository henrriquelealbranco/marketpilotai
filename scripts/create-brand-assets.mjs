import { mkdir, writeFile, copyFile } from 'node:fs/promises';
const root = new URL('../apps/web/public/brand/', import.meta.url);
await mkdir(root, { recursive: true });
const defs =
  '<defs><linearGradient id="m" x1="15" y1="8" x2="62" y2="60" gradientUnits="userSpaceOnUse"><stop stop-color="#D9A3FF"/><stop offset=".42" stop-color="#A855F7"/><stop offset=".74" stop-color="#7C3AED"/><stop offset="1" stop-color="#4C168D"/></linearGradient></defs>';
const shape = (color = 'url(#m)') =>
  `<path d="M12 49 27 15Q28 12 30 15L44 36 69 14Q72 11 71 15L62 47" fill="none" stroke="${color}" stroke-width="15" stroke-linecap="round" stroke-linejoin="round"/>`;
const svg = (body, view = '0 0 82 62') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${view}" role="img" aria-label="MarketPilot AI">${body}</svg>`;
await writeFile(new URL('mark.svg', root), svg(defs + shape()));
await writeFile(new URL('mark-white.svg', root), svg(shape('#F5F5FA')));
for (const [theme, color] of [
  ['dark', '#F5F5FA'],
  ['light', '#21182F'],
]) {
  await writeFile(
    new URL(`logo-${theme}.svg`, root),
    svg(
      `${defs}${shape()}<text x="95" y="44" font-family="Inter,Arial,sans-serif" font-size="36" font-weight="700" letter-spacing="-1.4" fill="${color}">MarketPilot<tspan fill="#A855F7" dx="7">AI</tspan></text>`,
      '0 0 378 64',
    ),
  );
}
await writeFile(
  new URL('app-icon.svg', root),
  svg(
    `<rect x="1" y="1" width="126" height="126" rx="30" fill="#181825" stroke="#A855F7" stroke-opacity=".35"/>${defs}<g transform="translate(21 31) scale(1.05)">${shape()}</g>`,
    '0 0 128 128',
  ),
);
await writeFile(new URL('favicon.svg', root), svg(defs + shape()));
await copyFile(
  new URL('favicon.svg', root),
  new URL('../apps/web/src/app/icon.svg', import.meta.url),
);
console.log('Ativos SVG da marca criados.');
