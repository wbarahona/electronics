import { fmt } from '../../sim/shared/readout.ts';
import type { ModelDefs } from '../../sim/models.ts';
import type { PartDefs } from '../defs.ts';
import type { PropsByType } from '../../types.ts';

// The values each of these parts carries: what the properties panel edits
// and the simulator reads (gathered into PropsByType in src/types.ts).
export interface PartProps {
  // A named net: every net label with the same name is one node, as if wired
  // together (see buildNets), so a supply or signal needn't be drawn across
  // the sheet.
  netLabel: { name: string };
}

const CHAR_W = 6; // a 10px label character, roughly
const escape = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

// The name that joins nets: as typed, without surrounding spaces. An empty
// name joins nothing (and shows as "?").
export const netName = (p: PropsByType['netLabel']) => p.name.trim();

// The tag: a short lead from the pin, then a pennant pointing at it, as wide
// as the name. Its right end and middle, for the hit box and the text.
function tag(p: PropsByType['netLabel']) {
  const w = Math.max(20, (netName(p) || '?').length * CHAR_W + 12);
  const end = w - 4;
  return { end, middle: (end - 4) / 2 };
}

export const defs: PartDefs<'netLabel'> = {
  netLabel: {
    name: 'Net label',
    letter: 'W',
    category: 'sources',
    group: 'Reference',
    pins: [{ x: -20, y: 0 }],
    props: {
      name: { label: 'Net name', value: 'NET1', text: true, maxLength: 16 },
    },
    noLabel: true,
    hit: (p) => {
      const { end } = tag(p);
      return { w: end + 24, h: 24, x: (end - 20) / 2 };
    },
    draw: (p) => {
      const { end, middle } = tag(p);
      return `
        <path d="M -20 0 H -12 L -4 -9 H ${end} V 9 H -4 Z" />
        <text class="sym-text net-name upright" x="${middle}" y="0" text-anchor="middle" dominant-baseline="central" data-x="${middle}" data-y="0">${escape(netName(p) || '?')}</text>`;
    },
  },
};

export const models: ModelDefs<'netLabel'> = {
  // No electrical part of its own: it only names its net.
  netLabel: {
    stamp() {},
    current: () => 0,
    pinCurrents: () => [0],
    readout: (r, p) => [
      ['Net', netName(p) || '?'],
      ['Voltage', fmt(r.pinV[0], 'V')],
    ],
  },
};
