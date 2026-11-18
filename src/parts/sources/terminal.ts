import { fmt } from '../../sim/shared/readout.ts';
import type { ModelDefs } from '../../sim/models.ts';
import type { PartDefs } from '../defs.ts';
import type { PropsByType } from '../../types.ts';

// The values each of these parts carries: what the properties panel edits
// and the simulator reads (gathered into PropsByType in src/types.ts).
export interface PartProps {
  // A connection point: a wire can end here and wait for later connections.
  // `name` (a number or a signal, optional) shows beside it. On a module
  // frame's edge it will be one of the module's pins.
  terminal: { name: string };
}

const CHAR_W = 6; // a 10px label character, roughly
const R = 4; // the circle's radius
const escape = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

const terminalName = (p: PropsByType['terminal']) => p.name.trim();

export const defs: PartDefs<'terminal'> = {
  // DIN EN 60617 (and IEEE 315): a small open circle, its pin at the centre,
  // so wires run up to it from any side; its name to the right.
  terminal: {
    name: 'Terminal',
    info: {
      summary: 'A connection point a wire can end on; on a module frame’s edge it becomes one of the module’s pins.',
      about: {
        how: 'A point where wires connect, like a screw terminal on a terminal strip.',
        sim: 'An open end with no effect on the circuit; its readout shows the voltage there, so it also works as a test point. On a frame’s edge it becomes a pin when the frame is made into a module.',
        uses: 'Leaving a wire ready for later, test points, and the pins of a module.',
      },
    },
    letter: 'X',
    category: 'sources',
    group: 'Reference',
    pins: [{ x: 0, y: 0 }],
    props: {
      name: { label: 'Terminal name', value: '', text: true, maxLength: 16 },
    },
    noLabel: true,
    hit: (p) => {
      const w = terminalName(p).length * CHAR_W;
      return { w: 2 * R + 12 + (w ? w + 6 : 0), h: 20, x: w ? (w + 6) / 2 : 0 };
    },
    // The name is turned upright about its own middle, so turning the part
    // moves it round the circle: right, below, left, above.
    draw: (p) => {
      const name = terminalName(p);
      const middle = R + 4 + (name.length * CHAR_W) / 2;
      return `
        <circle class="dot-hollow" r="${R}" />
        ${name ? `<text class="sym-text upright" x="${middle}" y="0" text-anchor="middle" dominant-baseline="central" data-x="${middle}" data-y="0">${escape(name)}</text>` : ''}`;
    },
  },
};

export const models: ModelDefs<'terminal'> = {
  // No electrical part of its own: an open end, showing its net's voltage.
  terminal: {
    stamp() {},
    current: () => 0,
    pinCurrents: () => [0],
    readout: (r) => [['Voltage', fmt(r.pinV[0], 'V')]],
  },
};
