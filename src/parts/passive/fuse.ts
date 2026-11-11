import { formatSI } from '../../units.ts';
import { ohmic } from '../../sim/shared/resistance.ts';
import type { ModelDefs } from '../../sim/models.ts';
import type { PartDefs } from '../defs.ts';

// The values each of these parts carries: what the properties panel edits
// and the simulator reads (gathered into PropsByType in src/types.ts).
export interface PartProps {
  fuse: { ratedCurrent: number };
}

// S; Ground holds its net at 0 V this firmly
const R_FUSE = 0.01;

export const defs: PartDefs<'fuse'> = {
  fuse: {
    name: 'Fuse',
    letter: 'F',
    category: 'passive',
    group: 'Protection',
    pins: [{ x: -40, y: 0 }, { x: 40, y: 0 }],
    props: {
      ratedCurrent: { label: 'Rated current', unit: 'A', value: 0.5, min: 0.001 },
    },
    tag: (p) => formatSI(p.ratedCurrent, 'A'),
    draw: () => `
      <path d="M -40 0 H 40" />
      <rect x="-14" y="-6" width="28" height="12" />`,
  },
};

export const models: ModelDefs<'fuse'> = {
  // Nearly a wire until it carries well over its rating, then it blows fast.
  fuse: {
    ...ohmic(() => R_FUSE),
    thermal: { load: (r, p) => Math.abs(r.i) / p.ratedCurrent, tau: 0.1, limit: 1.5 },
    failure: { label: 'blown', open: true },
  },
};
