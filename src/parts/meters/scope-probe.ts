import { fmt } from '../../sim/shared/readout.ts';
import type { ModelDefs } from '../../sim/models.ts';
import type { PartDefs } from '../defs.ts';

// The values each of these parts carries: what the properties panel edits
// and the simulator reads (gathered into PropsByType in src/types.ts).
export interface PartProps {
  // An oscilloscope probe: its point's voltage against the board's 0 V, shown
  // as that channel's trace.
  scopeProbe: { channel: 'CH1' | 'CH2' };
}

const G_SCOPE = 1e-7; // S; a 10 MΩ probe input

export const defs: PartDefs<'scopeProbe'> = {
  // A probe tip touching its pin, the channel written above it in the
  // trace's colour.
  scopeProbe: {
    name: 'Scope probe',
    letter: 'P',
    category: 'meters',
    group: 'Oscilloscope',
    pins: [{ x: 0, y: 20 }],
    props: {
      channel: { label: 'Channel', value: 'CH1', options: ['CH1', 'CH2'] },
    },
    noLabel: true,
    draw: (p) => `
      <g class="scope-probe ${p.channel.toLowerCase()}">
        <path d="M 0 20 V 10" />
        <path class="probe-body" d="M -5 10 L 0 16 L 5 10 V -8 H -5 Z" />
        <text class="sym-text upright" y="-13" text-anchor="middle" data-y="-16">${p.channel}</text>
      </g>`,
  },
};

export const models: ModelDefs<'scopeProbe'> = {
  // Barely loads its point (like a 10 MΩ scope input) to the board's 0 V.
  scopeProbe: {
    stamp(el, s) {
      s.draw(el.nodes[0], [[el.nodes[0], G_SCOPE]], 0);
    },
    current: (el, s) => G_SCOPE * s.v(el.nodes[0]),
    pinCurrents: (el, s) => [G_SCOPE * s.v(el.nodes[0])],
    readout: (r, p) => [[p.channel, fmt(r.pinV[0], 'V')]],
  },
};
