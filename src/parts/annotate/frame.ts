import type { ModelDefs } from '../../sim/models.ts';
import { formatAirflow, formatSI, formatTemp } from '../../units.ts';
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
  //
  // As an `enclosure` it is also a box round its parts: they share its
  // inside air, which their heat warms and its `walls` and the fans on its
  // edge cool (see enclosures in src/sim/engine.ts).
  frame: { text: string; width: number; height: number; color: NoteColor; enclosure: boolean; walls: Walls };
}

export type Walls = 'Sealed' | 'Vented' | 'Open (no walls)';

// Heat lost through an enclosure's walls per m² and kelvin: still air on a
// closed box, a box with vent slots, a frame with no real walls.
export const WALL_CONDUCTANCE: Record<Walls, number> = { Sealed: 5, Vented: 20, 'Open (no walls)': 100 }; // W/(m²·K)

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
    info: {
      summary: 'A frame round a section of a circuit, with a title; it can also be an enclosure that warms up inside, or become a module.',
      about: {
        how: 'A frame round a section of a circuit, to show that its parts belong together.',
        sim: 'Not part of the circuit, but it carries what’s inside when moved. As an enclosure, its parts share its inside air, which their heat warms and its walls and fans cool. Make module turns it into a reusable block.',
        uses: 'Organising drawings, enclosures that heat up, and making modules.',
      },
      example: 'enclosure-cooling',
    },
    letter: 'N',
    category: 'annotate',
    pins: [],
    props: {
      text: { label: 'Title', value: 'Section', text: true, maxLength: 60 },
      width: { label: 'Width', unit: 'px', value: 240, min: FRAME_MIN },
      height: { label: 'Height', unit: 'px', value: 160, min: FRAME_MIN },
      color: { label: 'Colour', value: 'blue', options: THEMES.map((t) => t.id) },
      enclosure: { label: 'Enclosure', value: false },
      walls: { label: 'Walls', value: 'Vented', options: ['Sealed', 'Vented', 'Open (no walls)'] },
    },
    noLabel: true,
    draw: (p) => {
      const { w, h } = frameSize(p);
      const title = p.text.trim();
      // An enclosure's tab also shows its inside air (filled in while it
      // runs, see paintDisplay in src/editor.ts).
      const shown = title.length + (p.enclosure ? 8 : 0);
      const tab = Math.min(w - 2 * GRID, shown * CHAR_W + 2 * TAB_PAD);
      return `
        <g class="frame${p.enclosure ? ' enclosure' : ''}" style="--note: ${colorOf(p)}">
          <rect class="frame-fill" width="${w}" height="${h}" rx="12" />
          <rect class="frame-edge" width="${w}" height="${h}" rx="12" />
          ${p.enclosure && p.walls === 'Vented' ? `<path class="frame-vents" d="${[0, 1, 2, 3].map((k) => `M ${w - 3 * GRID + 8 * k} 8 V 22`).join(' ')}" />` : ''}
          <rect class="frame-grab" width="${w}" height="${h}" rx="12" />
          ${title || p.enclosure ? `<g class="frame-title">
            <rect class="frame-tab" x="${GRID}" y="${-TAB_H / 2}" width="${tab}" height="${TAB_H}" rx="${TAB_H / 2}" />
            <text class="frame-text" x="${GRID + TAB_PAD}" y="0" dominant-baseline="central">${escape(title)}${p.enclosure ? `<tspan class="frame-reading">${title ? ' · ' : ''}–</tspan>` : ''}</text>
          </g>` : ''}
          ${CORNERS.map((c) => `<g class="frame-handle ${c}" data-corner="${c}" transform="translate(${c[1] === 'e' ? w : 0} ${c[0] === 's' ? h : 0})">
            <circle class="frame-handle-hit" r="12" /><circle class="frame-handle-dot" r="5" />
          </g>`).join('')}
        </g>`;
    },
  },
};

// Inside-air temperatures, for the Thermal view's tint of an enclosure: 0 at
// 20 °C up to 1 at 85 °C, the usual top rating of electronics around it.
const TINT_COLD = 20;
const TINT_HOT = 85;

export const models: ModelDefs<'frame'> = {
  // Nothing electrical. As an enclosure, the engine keeps its inside air in
  // its state.
  frame: {
    stamp() {},
    current: () => 0,
    pinCurrents: () => [],
    readout: (r, p) =>
      p.enclosure && r.state.air !== undefined
        ? [
            ['Inside air', formatTemp(r.state.air)],
            ['Heat inside', formatSI(r.state.inside ?? 0, 'W')],
            ['Fans on its walls', formatAirflow(r.state.exchange ?? 0)],
          ]
        : [],
    reading: (r, p) => (p.enclosure && r.state.air !== undefined ? formatTemp(r.state.air, 0) : undefined),
    tint: (r, p) => (p.enclosure && r.state.air !== undefined ? (r.state.air - TINT_COLD) / (TINT_HOT - TINT_COLD) : undefined),
  },
};
