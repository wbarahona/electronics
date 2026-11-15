import type { ModelDefs } from '../../sim/models.ts';
import type { PartDefs } from '../defs.ts';
import type { PropsByType } from '../../types.ts';
import { escape } from './note.ts';

// The values each of these parts carries: what the properties panel edits
// and the simulator reads (gathered into PropsByType in src/types.ts).
export interface PartProps {
  // Plain text on the board, with no card: a section's name, a value, a
  // heading. Not part of the circuit. Like a note's, a part's EU reference
  // in braces ({R1}) reads as that part's reference in the drawing standard
  // in use.
  textLabel: { text: string; size: LabelSize; bold: boolean };
}

export type LabelSize = 'Small' | 'Medium' | 'Large';

const FONT: Record<LabelSize, number> = { Small: 11, Medium: 15, Large: 22 }; // px
const CHAR_W = 0.58; // a character's width, roughly, as a share of the font size

// The grab box: the text's size, rounded up to the grid.
function size(p: PropsByType['textLabel']) {
  const font = FONT[p.size];
  const text = p.text.trim() || '…';
  const w = Math.max(40, Math.ceil((text.length * font * CHAR_W * (p.bold ? 1.08 : 1) + 12) / 20) * 20);
  const h = Math.max(20, Math.ceil((font * 1.5) / 20) * 20);
  return { text, font, w, h };
}

export const defs: PartDefs<'textLabel'> = {
  textLabel: {
    name: 'Text label',
    letter: 'N',
    category: 'annotate',
    pins: [],
    props: {
      text: { label: 'Text', value: 'Label', text: true, maxLength: 80 },
      size: { label: 'Size', value: 'Medium', options: ['Small', 'Medium', 'Large'] },
      bold: { label: 'Bold', value: true },
    },
    noLabel: true,
    hit: (p) => {
      const { w, h } = size(p);
      return { w, h };
    },
    draw: (p) => {
      const { text, font } = size(p);
      return `
        <text class="text-label" text-anchor="middle" dominant-baseline="central" style="font-size: ${font}px; font-weight: ${p.bold ? 600 : 400}">${escape(text)}</text>`;
    },
  },
};

export const models: ModelDefs<'textLabel'> = {
  // Nothing electrical.
  textLabel: {
    stamp() {},
    current: () => 0,
    pinCurrents: () => [],
    readout: () => [],
  },
};
