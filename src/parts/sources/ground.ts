import { fmt } from '../../sim/shared/readout.ts';
import type { ModelDefs } from '../../sim/models.ts';
import type { PartDefs } from '../defs.ts';

// The values each of these parts carries: what the properties panel edits
// and the simulator reads (gathered into PropsByType in src/types.ts).
export interface PartProps {
  // The board's common 0 V. Every Ground part is the same node.
  ground: Record<string, never>;
}

const G_GROUND = 1e6; // S; Ground holds its net at 0 V this firmly

export const defs: PartDefs<'ground'> = {
  // The common 0 V (DIN EN 60617 earth symbol). Carries no reference.
  ground: {
    name: 'Ground',
    letter: 'X',
    category: 'sources',
    group: 'Reference',
    pins: [{ x: 0, y: -20 }],
    props: {},
    noLabel: true,
    draw: () => `
      <path d="M 0 -20 V 0 M -12 0 H 12 M -7 5 H 7 M -2 10 H 2" />`,
  },
};

export const models: ModelDefs<'ground'> = {
  // Holds its net at 0 V; all grounds are one node through 0 V.
  ground: {
    groundTie: true,
    stamp(el, s) {
      s.draw(el.nodes[0], [[el.nodes[0], G_GROUND]], 0);
    },
    current: (el, s) => G_GROUND * s.v(el.nodes[0]),
    pinCurrents: (el, s) => [G_GROUND * s.v(el.nodes[0])],
    readout: (r) => [['Current to ground', fmt(Math.abs(r.pins[0]), 'A')]],
  },
};
