import { chip } from '../symbols.ts';
import { cmos } from '../../sim/shared/logic.ts';
import type { ModelDefs } from '../../sim/models.ts';
import type { PartDefs } from '../defs.ts';
import type { PropsByType } from '../../types.ts';

// The values each of these parts carries: what the properties panel edits
// and the simulator reads (gathered into PropsByType in src/types.ts).
export interface PartProps {
  // CMOS logic chips with their own VDD/VSS pins; maxCurrent is per output.
  cd4511: { maxCurrent: number }; // BCD to 7-segment latch/decoder/driver
}

// A pin name with a bar over it (active low).
const OVER = (name: string) => `<tspan text-decoration="overline">${name}</tspan>`;

// CD4511 segments a–g for 0–9 (6 and 9 without tails); anything above 9 blanks.
const BCD_SEGMENTS = ['1111110', '0110000', '1101101', '1111001', '0110011', '1011011', '0011111', '1110000', '1111111', '1110011'];

// Pins (index = pin − 1): inputs A, B, C, D, L̄T̄, B̄L̄, LE; outputs a–g.
const cd4511Model = cmos<PropsByType['cd4511']>({
  vdd: 15,
  vss: 7,
  inputs: [6, 0, 1, 5, 2, 3, 4],
  outputs: [12, 11, 10, 9, 8, 14, 13],
  rOut: 100,
  logic(state, [a, b, c, d, lt, bl, le]) {
    if (!le || state.count === undefined) state.count = +a + 2 * +b + 4 * +c + 8 * +d;
    if (!lt) return Array(7).fill(true);
    if (!bl || state.count > 9) return Array(7).fill(false);
    return [...BCD_SEGMENTS[state.count]].map((x) => x === '1');
  },
  readout: (state) => [
    ['Value', state.count === undefined ? '–' : state.count > 9 ? `${state.count} (blank)` : String(state.count)],
    ['Segments', 'abcdefg'.split('').filter((_, k) => state.outs?.[k]).join(' ') || 'none'],
  ],
});

export const defs: PartDefs<'cd4511'> = {
  // CD4511: BCD in (A–D), latch enable LE, lamp test L̄T̄ and blanking B̄L̄
  // (active low); segment outputs a–g that source current for a common-
  // cathode display. Pins in DIP order 1–16.
  cd4511: {
    name: 'CD4511 decoder',
    letter: 'K',
    category: 'chips',
    group: 'Counters & decoders',
    pins: [
      { x: -60, y: -40 }, { x: -60, y: -20 }, { x: -60, y: 20 }, { x: -60, y: 40 }, { x: -60, y: 60 }, { x: -60, y: 0 },
      { x: -60, y: -60 }, { x: 0, y: 80 }, { x: 60, y: 20 }, { x: 60, y: 0 }, { x: 60, y: -20 }, { x: 60, y: -40 },
      { x: 60, y: -60 }, { x: 60, y: 60 }, { x: 60, y: 40 }, { x: 0, y: -80 },
    ],
    props: { maxCurrent: { label: 'Max output current', unit: 'A', value: 0.025, min: 0.001 } },
    tag: () => 'CD4511',
    hit: { w: 120, h: 160 },
    labelAt: () => [44, -84, 'start'],
    draw: () =>
      chip({ w: 40, h: 70 }, '4511', [
        ['B', 1, -60, -40], ['C', 2, -60, -20], [OVER('LT'), 3, -60, 20], [OVER('BL'), 4, -60, 40], ['LE', 5, -60, 60],
        ['D', 6, -60, 0], ['A', 7, -60, -60], ['VSS', 8, 0, 80], ['e', 9, 60, 20], ['d', 10, 60, 0], ['c', 11, 60, -20],
        ['b', 12, 60, -40], ['a', 13, 60, -60], ['g', 14, 60, 60], ['f', 15, 60, 40], ['VDD', 16, 0, -80],
      ]),
  },
};

export const models: ModelDefs<'cd4511'> = {
  cd4511: cd4511Model,
};
