const PREFIXES = [
  [1e9, 'G'], [1e6, 'M'], [1e3, 'k'], [1, ''],
  [1e-3, 'm'], [1e-6, 'µ'], [1e-9, 'n'], [1e-12, 'p'],
];

const MULTIPLIERS = {
  p: 1e-12, n: 1e-9, u: 1e-6, µ: 1e-6, m: 1e-3, '': 1, R: 1, k: 1e3, K: 1e3, M: 1e6, G: 1e9,
};

// 4700 -> "4.7k", 0.02 -> "20m"
export function formatNumber(v) {
  if (Math.abs(v) < 1e-12) return '0';
  const [f, p] = PREFIXES.find(([f]) => Math.abs(v) >= f) ?? PREFIXES.at(-1);
  return `${+(v / f).toPrecision(3)}${p}`;
}

// 4700, "Ω" -> "4.7 kΩ"
export function formatSI(v, unit) {
  return formatNumber(v).replace(/([^\d.-]*)$/, ' $1') + unit;
}

// Engineering notation, as typed in Europe or anywhere: "4.7k", "4,7k", "4k7",
// "4R7", "20mA", "1 MΩ", "100n". Returns NaN when it can't be read.
export function parseSI(text) {
  const s = text
    .trim()
    .replace(',', '.')
    .replace(/\s+/g, '')
    .replace(/(ohms?|Ω|V|A|W|F|H|Hz|°)$/i, '');
  let m = s.match(/^([+-]?(?:\d+\.?\d*|\.\d+))([pnuµmkKMGR]?)$/);
  if (m) return Number(m[1]) * MULTIPLIERS[m[2]];
  m = s.match(/^(\d+)([pnuµmkKMGR])(\d+)$/); // RKM code: the prefix is the decimal point
  if (m) return Number(`${m[1]}.${m[3]}`) * MULTIPLIERS[m[2]];
  return NaN;
}
