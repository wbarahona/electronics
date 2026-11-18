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
    info: {
      summary: 'The circuit’s common 0 V reference; every ground symbol is the same node.',
      about: {
        how: 'The point every voltage in a circuit is measured from: 0 V. In real equipment it’s often connected to the chassis or to earth.',
        sim: 'Every Ground symbol is one node held at 0 V. A separate circuit without one is still given a reference, so it always has a solution.',
        uses: 'The common return of a circuit, and the reference for measuring voltages and logic levels.',
      },
    },
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
