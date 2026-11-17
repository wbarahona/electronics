import type { ModelDefs } from '../../sim/models.ts';
import type { PartDefs } from '../defs.ts';
import type { PropsByType } from '../../types.ts';
import { THEMES } from '../../themes.ts';
import { GRID } from '../../board.ts';
import { escape, type NoteColor } from './note.ts';

// The values each of these parts carries: what the properties panel edits
// and the simulator reads (gathered into PropsByType in src/types.ts).
export interface PartProps {
  // A frame round a section of the circuit, with a title on a tab: a power
  // supply, a timer stage. Not part of the circuit. Unlike other parts its
  // position is its top-left corner, so it resizes on the grid; it lies
  // behind the wires, takes presses only on its edge and title, and carries
  // what's inside it when moved (see src/editor.ts). Like a note's, a part's
  // EU reference in braces ({R1}) in its title reads as that part's
  // reference in the drawing standard in use.
  frame: { text: string; width: number; height: number; color: NoteColor };
}

export const FRAME_MIN = 2 * GRID; // px, its smallest width and height

const TAB_H = 20;
const TAB_PAD = 10;
const CHAR_W = 6.6; // a 12px character, roughly

// Its size as drawn: whole grid steps, never under FRAME_MIN.
export const frameSize = (p: PropsByType['frame']) => ({
  w: Math.max(FRAME_MIN, Math.round(p.width / GRID) * GRID),
  h: Math.max(FRAME_MIN, Math.round(p.height / GRID) * GRID),
});

const colorOf = (p: PropsByType['frame']) => (THEMES.find((t) => t.id === p.color) ?? THEMES[0]).seed;

// A grab handle on each corner, shown while it's selected.
const CORNERS = ['nw', 'ne', 'sw', 'se'] as const;
export type Corner = (typeof CORNERS)[number];

export const defs: PartDefs<'frame'> = {
  frame: {
    name: 'Frame',
    letter: 'N',
    category: 'annotate',
    pins: [],
    props: {
      text: { label: 'Title', value: 'Section', text: true, maxLength: 60 },
      width: { label: 'Width', unit: 'px', value: 240, min: FRAME_MIN },
      height: { label: 'Height', unit: 'px', value: 160, min: FRAME_MIN },
      color: { label: 'Colour', value: 'blue', options: THEMES.map((t) => t.id) },
    },
    noLabel: true,
    draw: (p) => {
      const { w, h } = frameSize(p);
      const title = p.text.trim();
      const tab = Math.min(w - 2 * GRID, title.length * CHAR_W + 2 * TAB_PAD);
      return `
        <g class="frame" style="--note: ${colorOf(p)}">
          <rect class="frame-fill" width="${w}" height="${h}" rx="12" />
          <rect class="frame-edge" width="${w}" height="${h}" rx="12" />
          <rect class="frame-grab" width="${w}" height="${h}" rx="12" />
          ${title ? `<g class="frame-title">
            <rect class="frame-tab" x="${GRID}" y="${-TAB_H / 2}" width="${tab}" height="${TAB_H}" rx="${TAB_H / 2}" />
            <text class="frame-text" x="${GRID + TAB_PAD}" y="0" dominant-baseline="central">${escape(title)}</text>
          </g>` : ''}
          ${CORNERS.map((c) => `<g class="frame-handle ${c}" data-corner="${c}" transform="translate(${c[1] === 'e' ? w : 0} ${c[0] === 's' ? h : 0})">
            <circle class="frame-handle-hit" r="12" /><circle class="frame-handle-dot" r="5" />
          </g>`).join('')}
        </g>`;
    },
  },
};

export const models: ModelDefs<'frame'> = {
  // Nothing electrical.
  frame: {
    stamp() {},
    current: () => 0,
    pinCurrents: () => [],
    readout: () => [],
  },
};
