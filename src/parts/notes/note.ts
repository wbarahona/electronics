import type { ModelDefs } from '../../sim/models.ts';
import type { PartDefs } from '../defs.ts';
import type { PropsByType } from '../../types.ts';
import { THEMES } from '../../themes.ts';

// The values each of these parts carries: what the properties panel edits
// and the simulator reads (gathered into PropsByType in src/types.ts).
export interface PartProps {
  // A note on the board: text to explain a circuit or mark its sections, on
  // a card in one of the theme colours. Not part of the circuit.
  note: { text: string; color: NoteColor };
}

export type NoteColor = (typeof THEMES)[number]['id'];

const LINE_H = 14; // px between lines
const CHAR_W = 6.2; // an 11px character, roughly
const WRAP = 36; // characters before a line wraps
const PAD = 10;
const escape = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

// The text as drawn: its own line breaks, long lines wrapped between words.
function lines(p: PropsByType['note']): string[] {
  return (p.text.trim() || '…').split('\n').flatMap((line) => {
    const out: string[] = [];
    let current = '';
    for (const word of line.split(' ')) {
      if (current && (current + ' ' + word).length > WRAP) {
        out.push(current);
        current = word;
      } else current = current ? `${current} ${word}` : word;
    }
    return [...out, current];
  });
}

// The card's size, centred on the part's position.
function size(p: PropsByType['note']) {
  const text = lines(p);
  const w = Math.max(80, Math.ceil((Math.max(...text.map((l) => l.length)) * CHAR_W + 2 * PAD) / 20) * 20);
  const h = Math.max(40, Math.ceil((text.length * LINE_H + 2 * PAD) / 20) * 20);
  return { text, w, h };
}

const colorOf = (p: PropsByType['note']) => (THEMES.find((t) => t.id === p.color) ?? THEMES[0]).seed;

export const defs: PartDefs<'note'> = {
  note: {
    name: 'Note',
    letter: 'N',
    category: 'notes',
    pins: [],
    props: {
      text: { label: 'Text', value: 'Note', text: true, multiline: true, maxLength: 500 },
      color: { label: 'Colour', value: 'amber', options: THEMES.map((t) => t.id) },
    },
    noLabel: true,
    hit: (p) => {
      const { w, h } = size(p);
      return { w, h };
    },
    draw: (p) => {
      const { text, w, h } = size(p);
      const top = -h / 2 + PAD + LINE_H / 2;
      return `
        <g class="note" style="--note: ${colorOf(p)}">
          <rect class="note-card" x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" rx="6" />
          <text class="note-text" x="${-w / 2 + PAD}" y="${top}" dominant-baseline="central">${text
            .map((line, k) => `<tspan x="${-w / 2 + PAD}" dy="${k ? LINE_H : 0}">${escape(line) || ' '}</tspan>`)
            .join('')}</text>
        </g>`;
    },
  },
};

export const models: ModelDefs<'note'> = {
  // Nothing electrical.
  note: {
    stamp() {},
    current: () => 0,
    pinCurrents: () => [],
    readout: () => [],
  },
};
