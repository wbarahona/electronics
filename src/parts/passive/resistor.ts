import { formatSI } from '../../units.ts';
import { ohmic } from '../../sim/shared/resistance.ts';
import type { ModelDefs } from '../../sim/models.ts';
import type { PartDefs } from '../defs.ts';
import { ZIGZAG } from '../symbols.ts';
import { toleranceProps, type Tolerance } from '../tolerance.ts';

// The values each of these parts carries: what the properties panel edits
// and the simulator reads (gathered into PropsByType in src/types.ts).
export interface PartProps {
  resistor: { resistance: number; powerRating: number } & Tolerance;
}

export const defs: PartDefs<'resistor'> = {
  resistor: {
    name: 'Resistor',
    info: {
      summary: 'Limits current in proportion to the voltage across it (Ohm’s law) and heats with the power it takes; burns out past its rating.',
      about: {
        how: 'A component that resists current: the current through it is the voltage across it divided by its resistance (Ohm’s law), and the power it takes turns into heat.',
        sim: 'An ideal resistance that heats with the power it dissipates and burns out past its power rating. With Settings › Real spread chosen, each one is a little off its marked value, within its tolerance, as real ones are.',
        uses: 'Limiting current (for example an LED’s), dividing voltages, pulling inputs up or down, and setting the timing of RC circuits.',
      },
      example: '555-blinker',
    },
    letter: 'R',
    us: {
      draw: () => `
        <path d="${ZIGZAG}" />`,
    },
    category: 'passive',
    group: 'Resistors',
    pins: [{ x: -40, y: 0 }, { x: 40, y: 0 }],
    props: {
      resistance: { label: 'Resistance', unit: 'Ω', value: 1000, min: 0.001 },
      powerRating: { label: 'Power rating', unit: 'W', value: 0.25, min: 0.001 },
      ...toleranceProps(5),
    },
    tag: (p) => formatSI(p.resistance, 'Ω'),
    draw: () => `
      <path d="M -40 0 H -18 M 18 0 H 40" />
      <rect x="-18" y="-6" width="36" height="12" />`,
  },
};

export const models: ModelDefs<'resistor'> = {
  resistor: {
    ...ohmic((p) => p.resistance),
    thermal: { load: (r, p) => Math.abs(r.p) / p.powerRating, tau: 2, limit: 2, rise: 70 }, // °C at its rating: a small film resistor at its rating
    failure: { label: 'burnt out', open: true },
    tolerance: ['resistance'],
  },
};
