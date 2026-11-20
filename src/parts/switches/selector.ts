import { contactsModel, poleCurrents } from '../../sim/shared/contacts.ts';
import { pinText } from '../symbols.ts';
import type { ModelDef, ModelDefs } from '../../sim/models.ts';
import type { PartDefs } from '../defs.ts';
import type { PropsByType } from '../../types.ts';
import { labelBelow, turned } from './poles.ts';

// The values each of these parts carries: what the properties panel edits
// and the simulator reads (gathered into PropsByType in src/types.ts).
export interface PartProps {
  // Selector (rotary, multi-position) switch: its common to one of
  // `positions` throws, the one `position` names (1 first).
  selectorSwitch: { position: number; positions: number; maxCurrent: number };
}

// How many throws a selector has, as a whole number from 2 to 8, and the one
// it's on.
export const throwCount = (p: { positions: number }) => Math.min(8, Math.max(2, Math.round(p.positions)));
const onThrow = (p: PropsByType['selectorSwitch']) => Math.min(throwCount(p), Math.max(1, Math.round(p.position)));

// The y of throw k (1 first): from the top down, 20 apart, so changing how
// many there are leaves the others (and their wires) in place.
const throwY = (k: number) => -20 + 20 * (k - 1);
const lastY = (p: { positions: number }) => throwY(throwCount(p));

// Common (0) to the throw it's on (pin k for throw k).
const selectorModel: ModelDef<PropsByType['selectorSwitch']> = {
  ...contactsModel<PropsByType['selectorSwitch']>(
    (el) => [[0, onThrow(el.props)]],
    (p) => [Array.from({ length: throwCount(p) + 1 }, (_, k) => k)],
    (r, p) => [['Position', String(onThrow(p))], ...poleCurrents(r, [0])],
  ),
  failure: { label: 'burnt out', open: true },
};

// Each throw's number beside its fixed contact.
const numbers = (p: { positions: number }) =>
  Array.from({ length: throwCount(p) }, (_, j) => pinText(String(j + 1), 26, throwY(j + 1) - 3)).join('');

export const defs: PartDefs<'selectorSwitch'> = {
  // DIN: the blade from the common (left) to one of the fixed contacts on the
  // right, numbered from the top.
  selectorSwitch: {
    name: 'Selector switch',
    info: {
      summary: 'A switch that connects its common to one of several contacts, one position at a time: a rotary or selector switch.',
      about: {
        how: 'A switch with one common terminal and several positions, each joining it to a different contact.',
        sim: 'Its common joined to the contact of the position it’s on, the others open; click its knob to step to the next position (after the last, back to 1).',
        uses: 'Choosing between sources, speeds, ranges or outputs: fan speed switches, meter ranges, Hand–Off–Auto.',
      },
    },
    letter: 'S',
    category: 'switches',
    group: 'Toggle',
    pins: (p) => [{ x: -40, y: 0 }, ...Array.from({ length: throwCount(p) }, (_, j) => ({ x: 40, y: throwY(j + 1) }))],
    props: {
      position: { label: 'Position', unit: '', value: 1, min: 1, max: 8 },
      positions: { label: 'Positions', unit: '', value: 3, min: 2, max: 8, slider: true },
      maxCurrent: { label: 'Max current', unit: 'A', value: 5, min: 0.001 },
    },
    actuator: { prop: 'position', momentary: false, positions: throwCount },
    hit: (p) => {
      const span = lastY(p) + 10 + 30;
      return { w: 80, h: span, y: -30 + span / 2 };
    },
    // The knob above the top contact, the label below the last, however it's turned.
    actuatorAt: (_vertical, _p, rotation) => turned({ x: 0, y: -40 }, rotation),
    labelAt: (_vertical, p, rotation) => labelBelow(lastY(p) + 28, rotation),
    draw: (p) => `
      <path d="M -40 0 H -14 L 14 ${throwY(onThrow(p))}" />
      <path d="${Array.from({ length: throwCount(p) }, (_, j) => `M 40 ${throwY(j + 1)} H 16`).join(' ')}" />
      <circle class="dot" cx="-14" r="2" />
      ${numbers(p)}`,
    // US: the blade between terminal circles.
    us: {
      draw: (p) => `
      <path d="M -40 0 H -17 ${Array.from({ length: throwCount(p) }, (_, j) => `M 40 ${throwY(j + 1)} H 17`).join(' ')} M -11 0 L 11 ${throwY(onThrow(p))}" />
      <circle class="dot-hollow" cx="-14" r="3" />
      ${Array.from({ length: throwCount(p) }, (_, j) => `<circle class="dot-hollow" cx="14" cy="${throwY(j + 1)}" r="3" />`).join('')}
      ${numbers(p)}`,
    },
  },
};

export const models: ModelDefs<'selectorSwitch'> = {
  selectorSwitch: selectorModel,
};
