import { getNorm } from './norm.ts';

const PREFIXES: [number, string][] = [
  [1e9, 'G'], [1e6, 'M'], [1e3, 'k'], [1, ''],
  [1e-3, 'm'], [1e-6, 'µ'], [1e-9, 'n'], [1e-12, 'p'],
];

const MULTIPLIERS: Record<string, number> = {
  p: 1e-12, n: 1e-9, u: 1e-6, µ: 1e-6, m: 1e-3, '': 1, R: 1, k: 1e3, K: 1e3, M: 1e6, G: 1e9,
};

// The decimal mark numbers are written with ('.' or ','), set from Settings;
// `onDecimalMark` listeners redraw what shows numbers when it changes. Typed
// numbers may use either (see parseSI).
let mark = '.';
const markListeners: (() => void)[] = [];

export function setDecimalMark(next: '.' | ',') {
  if (next === mark) return;
  mark = next;
  for (const listener of markListeners) listener();
}

export const onDecimalMark = (redraw: () => void) => markListeners.push(redraw);

// A number's text with the decimal mark in use.
export const withMark = (text: string): string => (mark === '.' ? text : text.replace('.', mark));

// 4700 -> "4.7k" (or "4,7k"), 0.02 -> "20m"
export function formatNumber(v: number): string {
  if (Math.abs(v) < 1e-12) return '0';
  const [f, p] = PREFIXES.find(([f]) => Math.abs(v) >= f) ?? PREFIXES[PREFIXES.length - 1];
  return withMark(`${+(v / f).toPrecision(3)}${p}`);
}

// 4700, "Ω" -> "4.7 kΩ"
export function formatSI(v: number, unit: string): string {
  return formatNumber(v).replace(/([^\d.,-]*)$/, ' $1') + unit;
}

// Engineering notation, as typed in Europe or anywhere: "4.7k", "4,7k", "4k7",
// "4R7", "20mA", "1 MΩ", "100n". Returns NaN when it can't be read.
export function parseSI(text: string): number {
  const s = text
    .trim()
    .replace(',', '.')
    .replace(/\s+/g, '')
    .replace(/(°[CF]?|ohms?|Ω|V|Ah|A|W|F|H|Hz)$/i, '');
  let m = s.match(/^([+-]?(?:\d+\.?\d*|\.\d+))([pnuµmkKMGR]?)$/);
  if (m) return Number(m[1]) * MULTIPLIERS[m[2]];
  m = s.match(/^(\d+)([pnuµmkKMGR])(\d+)$/); // RKM code: the prefix is the decimal point
  if (m) return Number(`${m[1]}.${m[3]}`) * MULTIPLIERS[m[2]];
  return NaN;
}

// --- Temperatures -------------------------------------------------------------
// Kept in °C everywhere (parts' values, files, the simulation); under the US
// standard they are shown and typed in °F. Every other unit is the same in
// both standards.

const fahrenheit = (unit: string) => unit === '°C' && getNorm() === 'us';

// The unit a value of `unit` is shown in.
export const shownUnit = (unit: string): string => (fahrenheit(unit) ? '°F' : unit);

// A value of `unit` as shown, and a shown (typed) value back as it's kept.
export const toShown = (v: number, unit: string): number => (fahrenheit(unit) ? +((v * 9) / 5 + 32).toFixed(1) : v);
export const fromShown = (v: number, unit: string): number => (fahrenheit(unit) ? +(((v - 32) * 5) / 9).toFixed(2) : v);

// 25 -> "25.0 °C", or "77.0 °F" under the US standard.
export const formatTemp = (celsius: number, digits = 1): string => `${withMark(toShown(celsius, '°C').toFixed(digits))} ${shownUnit('°C')}`;

// A text's temperatures as shown: "Resistance at 25 °C" reads "at 77 °F"
// under the US standard.
export const shownTemps = (text: string): string =>
  getNorm() === 'us' ? text.replace(/(-?\d+(?:\.\d+)?) °C/g, (_, c: string) => `${toShown(Number(c), '°C')} °F`) : text;
