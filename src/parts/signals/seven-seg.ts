import { chip } from '../symbols.ts';
import { ledGroup } from '../../sim/shared/leds.ts';
import type { ModelDefs } from '../../sim/models.ts';
import type { PartDefs } from '../defs.ts';
import type { LedColor, PropsByType } from '../../types.ts';

// The values each of these parts carries: what the properties panel edits
// and the simulator reads (gathered into PropsByType in src/types.ts).
export interface PartProps {
  // Eight LEDs (segments a–g and the dot) sharing one common pin. Forward
  // voltage and max current are per segment.
  sevenSeg: { color: LedColor; common: 'cathode' | 'anode'; forwardVoltage: number; maxCurrent: number };
}

// Seven-segment display: segments a–g, then the dot, as [path or circle].
const SEGMENTS = [
  'M -8 -22 H 8', // a
  'M 10 -20 V -6', // b
  'M 10 -2 V 12', // c
  'M -8 14 H 8', // d
  'M -10 -2 V 12', // e
  'M -10 -20 V -6', // f
  'M -8 -4 H 8', // g
];

const segmentMarkup = (cls: string, lit: boolean) =>
  SEGMENTS.map((d, k) => `<path class="${cls}" d="${d}"${lit ? ` data-seg="${k}" style="opacity: 0"` : ''} />`).join('') +
  `<circle class="${cls} dot" cx="16" cy="14" r="2"${lit ? ' data-seg="7" style="opacity: 0"' : ''} />`;

export const defs: PartDefs<'sevenSeg'> = {
  // Pins: segments a–g and the dot (dp), then the common pin.
  sevenSeg: {
    name: '7-segment display',
    letter: 'P',
    category: 'signals',
    group: 'Displays',
    pins: [
      ...[-30, -10, 10, 30].map((y) => ({ x: -60, y })),
      ...[-30, -10, 10, 30].map((y) => ({ x: 60, y })),
      { x: 0, y: 60 },
    ],
    props: {
      color: { label: 'Colour', value: 'red', options: ['red', 'yellow', 'green', 'blue', 'white'] },
      common: { label: 'Common', value: 'cathode', options: ['cathode', 'anode'] },
      forwardVoltage: { label: 'Forward voltage', unit: 'V', value: 2, min: 0.1 },
      maxCurrent: { label: 'Max current (segment)', unit: 'A', value: 0.02, min: 0.0001 },
    },
    glow: { color: (p) => p.color, radius: 44 },
    hit: { w: 120, h: 100 },
    labelAt: (vertical) => (vertical ? [64, -44, 'start'] : [44, -46, 'start']),
    draw: (p) =>
      chip({ w: 40, h: 40 }, '', [
        ['a', null, -60, -30], ['b', null, -60, -10], ['c', null, -60, 10], ['d', null, -60, 30],
        ['e', null, 60, -30], ['f', null, 60, -10], ['g', null, 60, 10], ['dp', null, 60, 30],
        [p.common === 'cathode' ? 'K' : 'A', null, 0, 60],
      ]) +
      `<g class="segments">${segmentMarkup('seg-off', false)}${segmentMarkup('seg-lit', true)}</g>`,
  },
};

export const models: ModelDefs<'sevenSeg'> = {
  sevenSeg: ledGroup<PropsByType['sevenSeg']>(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'dp'], (p) => p.forwardVoltage),
};
