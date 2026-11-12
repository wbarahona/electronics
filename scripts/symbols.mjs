// Writes schematic symbols as standalone SVG files to tmp/symbols (git-ignored),
// for designing with them in a vector app: drawn by the parts' own code, with
// the app's CSS classes turned into plain attributes so any editor shows them
// as the app does (light theme). `npm run symbols`, or name the part types:
// `npm run symbols -- led resistor`.
import { mkdir, writeFile } from 'node:fs/promises';
import { PARTS, defaults, hitOf, symbolMarkup } from '../src/components.ts';
import { LIGHT_COLORS } from '../src/parts/defs.ts';

const OUT = new URL('../tmp/symbols/', import.meta.url);
const INK = '#191c22';
const PAPER = '#ffffff';
const FONT = "'Google Sans', 'D-DIN', sans-serif";
const MARGIN = 12;

// The symbols, with any settings that differ from a new part's.
const SYMBOLS = [
  ['led', {}],
  ['led-lit', { type: 'led', lit: true }],
  ['resistor', {}],
  ['capacitor', {}],
  ['electrolytic', {}],
  ['battery', {}],
  ['rail', {}],
  ['ground', {}],
  ['and', {}],
  ['dff', {}],
];

// What each class of the app's stylesheet (src/style.css, .part …) looks like.
const text = (size, weight = 400) => `fill: ${INK}; stroke: none; font-family: ${FONT}; font-size: ${size}px; font-weight: ${weight}`;
const CLASS_STYLE = {
  pin: `fill: ${PAPER}; stroke: ${INK}; stroke-width: 1.5`,
  thick: 'stroke-width: 4',
  fill: `fill: ${INK}; stroke: none`,
  'dot-hollow': `fill: ${PAPER}`,
  'sym-text': text(9),
  'gate-text': text(13, 600),
  'chip-title': text(10, 600),
  'chip-pin': text(7),
};

function inline(markup, { lit = false, glow } = {}) {
  return markup
    .replace(/ data-[\w-]+="[^"]*"/g, '')
    .replace(/ class="([^"]*)"/g, (_, classes) => {
      const list = classes.split(' ');
      const styles = list.flatMap((c) => (CLASS_STYLE[c] ? [CLASS_STYLE[c]] : []));
      if (list.includes('bulb')) styles.push(`fill: ${glow}; fill-opacity: ${lit ? 1 : list.includes('tinted') ? 0.2 : 0}`);
      return styles.length ? ` style="${styles.join('; ')}"` : '';
    });
}

const only = process.argv.slice(2);
await mkdir(OUT, { recursive: true });
for (const [file, { type = file, lit }] of SYMBOLS) {
  if (only.length && !only.includes(file) && !only.includes(type)) continue;
  const props = defaults(type);
  const part = PARTS[type];
  const glow = part.glow ? LIGHT_COLORS[part.glow.color(props)] : INK;
  const { w = 80, h = 40, x = 0 } = hitOf(type, props) ?? {};
  // The grab box plus room for strokes, light arrows and pin names.
  const [left, top, width, height] = [x - w / 2 - MARGIN, -h / 2 - MARGIN, w + 2 * MARGIN, h + 2 * MARGIN];
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<!-- Ampage schematic symbol: ${part.name} (DIN EN 60617). Pins are the small circles on the grid (20 px). -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${left} ${top} ${width} ${height}" width="${width * 4}" height="${height * 4}">
  <g fill="none" stroke="${INK}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    ${inline(symbolMarkup(type, props), { lit, glow }).trim()}
  </g>
</svg>
`;
  await writeFile(new URL(`${file}.svg`, OUT), svg);
  console.log(`tmp/symbols/${file}.svg`);
}
