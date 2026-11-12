import { formatSI } from '../../units.ts';
import { ohmic } from '../../sim/shared/resistance.ts';
import type { ModelDefs } from '../../sim/models.ts';
import type { PartDefs } from '../defs.ts';
import { toleranceProps, type Tolerance } from '../tolerance.ts';

// The values each of these parts carries: what the properties panel edits
// and the simulator reads (gathered into PropsByType in src/types.ts).
export interface PartProps {
  resistor: { resistance: number; powerRating: number } & Tolerance;
}

export const defs: PartDefs<'resistor'> = {
  resistor: {
    name: 'Resistor',
    letter: 'R',
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
    thermal: { load: (r, p) => Math.abs(r.p) / p.powerRating, tau: 2, limit: 2 },
    failure: { label: 'burnt out', open: true },
    tolerance: ['resistance'],
  },
};
