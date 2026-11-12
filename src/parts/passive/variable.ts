import { basicReadout, fmt, pct } from '../../sim/shared/readout.ts';
import { ohmic, powerThermal } from '../../sim/shared/resistance.ts';
import { formatSI } from '../../units.ts';
import type { ModelDefs } from '../../sim/models.ts';
import type { PartDefs } from '../defs.ts';
import { toleranceProps, type Tolerance } from '../tolerance.ts';
import type { PropsByType } from '../../types.ts';

// The values each of these parts carries: what the properties panel edits
// and the simulator reads (gathered into PropsByType in src/types.ts).
export interface PartProps {
  // Positions and ambient light are percentages, 0..100.
  potentiometer: { resistance: number; position: number; powerRating: number } & Tolerance;
  rheostat: { resistance: number; position: number; powerRating: number } & Tolerance;
}

// S; a 10 MΩ probe input
const R_MIN = 1e-3; // a wiper or setting at its very end still has a little resistance

// The two halves of a potentiometer's track either side of the wiper.
const halves = (p: PropsByType['potentiometer']) => [
  Math.max(R_MIN, (p.resistance * p.position) / 100),
  Math.max(R_MIN, (p.resistance * (100 - p.position)) / 100),
];

export const defs: PartDefs<'potentiometer' | 'rheostat'> = {
  // Track between pins 0 and 1, wiper on pin 2. `position` 0 puts the wiper
  // at pin 0, 100 at pin 1.
  potentiometer: {
    name: 'Potentiometer',
    letter: 'R',
    category: 'passive',
    group: 'Resistors',
    pins: [{ x: -40, y: 0 }, { x: 40, y: 0 }, { x: 0, y: -40 }],
    props: {
      resistance: { label: 'Resistance', unit: 'Ω', value: 10e3, min: 1 },
      position: { label: 'Wiper position', unit: '%', value: 50, min: 0, max: 100, slider: true },
      powerRating: { label: 'Power rating', unit: 'W', value: 0.5, min: 0.001 },
      ...toleranceProps(20),
    },
    tag: (p) => `${formatSI(p.resistance, 'Ω')} ${Math.round(p.position)} %`,
    labelBelow: true,
    draw: () => `
      <path d="M -40 0 H -18 M 18 0 H 40 M 0 -40 V -9" />
      <path class="fill" d="M 0 -6 L -4 -13 H 4 Z" />
      <rect x="-18" y="-6" width="36" height="12" />`,
  },
  // Resistance between the pins is `position` % of the maximum.
  rheostat: {
    name: 'Variable resistor',
    letter: 'R',
    category: 'passive',
    group: 'Resistors',
    pins: [{ x: -40, y: 0 }, { x: 40, y: 0 }],
    props: {
      resistance: { label: 'Max resistance', unit: 'Ω', value: 1000, min: 1 },
      position: { label: 'Setting', unit: '%', value: 50, min: 0, max: 100, slider: true },
      powerRating: { label: 'Power rating', unit: 'W', value: 0.5, min: 0.001 },
      ...toleranceProps(20),
    },
    tag: (p) => formatSI((p.resistance * p.position) / 100, 'Ω'),
    draw: () => `
      <path d="M -40 0 H -18 M 18 0 H 40 M -16 14 L 14 -12" />
      <path class="fill" d="M 18 -15.5 L 9.5 -12.5 L 14.5 -7 Z" />
      <rect x="-18" y="-6" width="36" height="12" />`,
  },
};

export const models: ModelDefs<'potentiometer' | 'rheostat'> = {
  // Two resistors sharing the wiper: track pin 0 → wiper → pin 1.
  potentiometer: {
    tolerance: ['resistance'],
    stamp(el, s) {
      const [a, b, w] = el.nodes;
      const [r1, r2] = halves(el.props);
      s.conductance(a, w, 1 / r1);
      s.conductance(w, b, 1 / r2);
    },
    current(el, s) {
      return this.pinCurrents!(el, s)[0];
    },
    pinCurrents(el, s) {
      const [a, b, w] = el.nodes;
      const [r1, r2] = halves(el.props);
      const ia = (s.v(a) - s.v(w)) / r1;
      const ib = (s.v(b) - s.v(w)) / r2;
      return [ia, ib, -ia - ib];
    },
    power(el, s) {
      const [ia, ib] = this.pinCurrents!(el, s);
      const [r1, r2] = halves(el.props);
      return ia * ia * r1 + ib * ib * r2;
    },
    readout: (r, p) => [
      ['Track voltage', fmt(Math.abs(r.v), 'V')],
      ['Wiper voltage', `${fmt(r.pinV[2] - r.pinV[1], 'V')} (to pin 2 end)`],
      ['Wiper current', fmt(Math.abs(r.pins[2]), 'A')],
      ['Power', fmt(Math.abs(r.p), 'W')],
      ['Position', pct(p.position / 100)],
    ],
    thermal: powerThermal(2, 2),
    failure: { label: 'burnt out', open: true },
  },
  rheostat: {
    tolerance: ['resistance'],
    ...ohmic(
      (p) => Math.max(R_MIN, (p.resistance * p.position) / 100),
      (r, p) => [...basicReadout(r), ['Resistance', fmt(Math.max(R_MIN, (p.resistance * p.position) / 100), 'Ω')]],
    ),
    thermal: powerThermal(2, 2),
    failure: { label: 'burnt out', open: true },
  },
};
