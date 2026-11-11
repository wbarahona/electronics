import type { ChoiceSpec } from './defs.ts';
import type { MeterMode } from '../types.ts';

// Logic gates, DIN EN 60617-12 rectangular form: a box with the function's
// qualifier (&, ≥1, =1, 1) and a circle on the output for inversion. Inputs
// enter on the left, the output leaves on the right.
export const gateProps = {
  supply: { label: 'Logic supply', unit: 'V', value: 5, min: 1, max: 15, slider: { min: 1, max: 15, step: 0.5 } },
  maxCurrent: { label: 'Max output current', unit: 'A', value: 0.025, min: 0.001 },
};

// An IC drawn the DIN way: a box with each pin's name inside and its number
// outside (no number for generic logic symbols). `pins` lists
// [name, number, x, y] in the order the model uses; leads run from the pin to
// the box edge (`box` is the half-width/height).
export type ChipPin = [string, number | null, number, number];

export function chip(box: { w: number; h: number }, title: string, pins: ChipPin[]): string {
  const lead = ([, , x, y]: ChipPin) => {
    const ex = x < -box.w ? -box.w : x > box.w ? box.w : x;
    const ey = y < -box.h ? -box.h : y > box.h ? box.h : y;
    return `M ${x} ${y} L ${ex} ${ey}`;
  };
  // Name just inside the box, number just outside, both kept level.
  const text = ([name, num, x, y]: ChipPin) => {
    const side = x < -box.w ? 'l' : x > box.w ? 'r' : y < 0 ? 't' : 'b';
    const [nx, ny, anchor] =
      side === 'l' ? [-box.w + 3, y + 3, 'start'] : side === 'r' ? [box.w - 3, y + 3, 'end'] : side === 't' ? [x, -box.h + 9, 'middle'] : [x, box.h - 3, 'middle'];
    const [mx, my] = side === 'l' ? [x + 6, y - 3] : side === 'r' ? [x - 6, y - 3] : [x + 4, side === 't' ? y + 9 : y - 4];
    const cx = anchor === 'start' ? nx + 8 : anchor === 'end' ? nx - 8 : nx;
    const label = `<text class="chip-pin upright" x="${nx}" y="${ny}" text-anchor="${anchor}" data-x="${cx}" data-y="${ny - 3}">${name}</text>`;
    if (num === null) return label;
    return `${label}
      <text class="chip-num upright" x="${mx}" y="${my}" text-anchor="middle" data-x="${mx}" data-y="${my - 3}">${num}</text>`;
  };
  return `
    <path d="${pins.map(lead).join(' ')}" />
    <rect x="${-box.w}" y="${-box.h}" width="${box.w * 2}" height="${box.h * 2}" />
    <text class="chip-title upright" y="4" text-anchor="middle">${title}</text>
    ${pins.map(text).join('')}`;
}

// A meter's knob: DC (average) or AC (true RMS of the AC part).
export const METER_MODE: ChoiceSpec<MeterMode> = { label: 'Mode', value: 'DC', options: ['DC', 'AC'] };

// A small pin number or name beside a lead, kept level.
export const pinText = (text: string, x: number, y: number, anchor = 'start') =>
  `<text class="chip-num upright" x="${x}" y="${y}" text-anchor="${anchor}" data-x="${x}" data-y="${y - 3}">${text}</text>`;

// Arcs above a sounder while it sounds (shown when the part is .active).
export const SOUND_WAVES = `
  <path class="when-on waves" d="M 18 -14 A 10 10 0 0 1 18 -26 M 23 -10 A 16 16 0 0 1 23 -30" />`;
