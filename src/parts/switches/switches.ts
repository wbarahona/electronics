import { ohmic, R_SWITCH_ON } from '../../sim/shared/resistance.ts';
import type { ModelDef, ModelDefs } from '../../sim/models.ts';
import type { PartDefs } from '../defs.ts';
import type { PropsByType } from '../../types.ts';

// The values each of these parts carries: what the properties panel edits
// and the simulator reads (gathered into PropsByType in src/types.ts).
export interface PartProps {
  switch: { closed: boolean; maxCurrent: number };
  button: { closed: boolean; maxCurrent: number };
  buttonNC: { pressed: boolean; maxCurrent: number }; // conducts until pressed
}

// Overloaded contacts weld shut: a failed switch conducts whatever its setting.
const switchModel: ModelDef<PropsByType['switch']> = {
  ...ohmic((p, el) => (p.closed || el.broken ? R_SWITCH_ON : Infinity)),
  thermal: { load: (r, p) => Math.abs(r.i) / p.maxCurrent, tau: 0.2, limit: 1.5, rise: 40 }, // °C at its rating: contacts
  failure: { label: 'contacts welded', open: false },
};

// The terminal circles of the US symbols: a switch's, and a push button's
// (closer together, under or over its bar).
const TERMINALS = '<circle class="dot-hollow" cx="-14" r="3" /><circle class="dot-hollow" cx="14" r="3" />';
const TERMINALS_NEAR = '<circle class="dot-hollow" cx="-10" r="3" /><circle class="dot-hollow" cx="10" r="3" />';

export const defs: PartDefs<'switch' | 'button' | 'buttonNC'> = {
  switch: {
    name: 'Switch',
    info: {
      summary: 'An on/off switch: click its control to open or close it.',
      about: {
        how: 'A contact that is either open or closed until you change it.',
        sim: 'Open, or closed with a tiny resistance; its contacts heat past their rated current. Click its control on the board to flip it.',
        uses: 'Turning circuits on and off, and setting inputs by hand.',
      },
    },
    letter: 'S',
    category: 'switches',
    group: 'Toggle',
    pins: [{ x: -40, y: 0 }, { x: 40, y: 0 }],
    props: {
      closed: { label: 'Closed', value: false },
      maxCurrent: { label: 'Max current', unit: 'A', value: 5, min: 0.001 },
    },
    actuator: { prop: 'closed', momentary: false },
    // Welded contacts stay shut, with a blob where they fused.
    draw: ({ closed }, broken) => `
      <path d="M -40 0 H -14 L ${closed || broken ? '14 0' : '16 -12'} M 14 0 H 40" />
      ${broken ? '<circle class="weld" cx="14" r="3.5" />' : ''}`,
    // US: the blade between two terminal circles.
    us: {
      draw: ({ closed }, broken) => `
      <path d="M -40 0 H -17 M 17 0 H 40 M -11 0 L ${closed || broken ? '11 0' : '13 -13'}" />
      ${TERMINALS}
      ${broken ? '<circle class="weld" cx="14" r="3.5" />' : ''}`,
    },
  },
  // Normally-open push button: closed only while held down.
  button: {
    name: 'Push button (NO)',
    info: {
      summary: 'A push button that closes only while it’s held (normally open).',
      about: {
        how: 'A momentary switch: its contact closes only while you press it, and springs open again (normally open, NO).',
        sim: 'Closed while held: press and hold its control on the board.',
        uses: 'Start buttons, doorbells, and logic inputs.',
      },
      example: 'doorbell',
    },
    letter: 'S',
    category: 'switches',
    group: 'Push buttons',
    pins: [{ x: -40, y: 0 }, { x: 40, y: 0 }],
    props: {
      closed: { label: 'Pressed', value: false, hidden: true },
      maxCurrent: { label: 'Max current', unit: 'A', value: 5, min: 0.001 },
    },
    actuator: { prop: 'closed', momentary: true },
    // DIN make contact with a push actuator linked to the blade by a dashed line.
    draw: ({ closed }, broken) => {
      const shut = closed || broken;
      const head = closed ? -14 : -20;
      return `
        <path d="M -40 0 H -14 L ${shut ? '14 0' : '16 -12'} M 14 0 H 40" />
        <path d="M -6 ${head - 4} V ${head} H 8 V ${head - 4}" />
        <path class="link" d="M 1 ${head} V ${shut ? 0 : -6}" />
        ${broken ? '<circle class="weld" cx="14" r="3.5" />' : ''}`;
    },
    // US (NEMA): a bar on a stem above two terminals, pushed down onto them.
    us: {
      draw: ({ closed }, broken) => {
        const bar = closed || broken ? -3 : -9;
        return `
        <path d="M -40 0 H -13 M 13 0 H 40 M -15 ${bar} H 15 M 0 ${bar} V ${bar - 12} M -5 ${bar - 12} H 5" />
        ${TERMINALS_NEAR}
        ${broken ? '<circle class="weld" cx="10" cy="-3" r="3.5" />' : ''}`;
      },
    },
  },
  // Normally-closed push button: conducts until held down. DIN break contact:
  // the blade rests against a stop on the fixed contact; pressing lifts it off.
  buttonNC: {
    name: 'Push button (NC)',
    info: {
      summary: 'A push button that opens only while it’s held (normally closed): a stop button.',
      about: {
        how: 'A momentary switch whose contact is closed at rest and opens while you press it (normally closed, NC).',
        sim: 'Open while held: press and hold its control on the board.',
        uses: 'Stop buttons and safety circuits, which must break the circuit when pressed.',
      },
      example: 'motor-starter',
    },
    letter: 'S',
    category: 'switches',
    group: 'Push buttons',
    pins: [{ x: -40, y: 0 }, { x: 40, y: 0 }],
    props: {
      pressed: { label: 'Pressed', value: false, hidden: true },
      maxCurrent: { label: 'Max current', unit: 'A', value: 5, min: 0.001 },
    },
    actuator: { prop: 'pressed', momentary: true },
    draw: ({ pressed }, broken) => {
      const open = pressed && !broken;
      const tip = open ? -20 : -10; // blade end height
      const head = open ? -32 : -24;
      return `
        <path d="M -40 0 H -14 L 18 ${tip} M 40 0 H 14 V -10" />
        <path d="M -6 ${head - 4} V ${head} H 8 V ${head - 4}" />
        <path class="link" d="M 1 ${head} V ${open ? -14 : -7}" />
        ${broken ? '<circle class="weld" cx="14" cy="-9" r="3.5" />' : ''}`;
    },
    // US (NEMA): the bar rests under the two terminals, joining them, and is
    // pushed down off them.
    us: {
      draw: ({ pressed }, broken) => {
        const bar = pressed && !broken ? 9 : 3;
        return `
        <path d="M -40 0 H -13 M 13 0 H 40 M -15 ${bar} H 15 M 0 ${bar} V ${bar - 18} M -5 ${bar - 18} H 5" />
        ${TERMINALS_NEAR}
        ${broken ? '<circle class="weld" cx="10" cy="3" r="3.5" />' : ''}`;
      },
    },
  },
};

export const models: ModelDefs<'switch' | 'button' | 'buttonNC'> = {
  switch: switchModel,
  // A push button is electrically a switch that is only closed while held.
  button: switchModel,
  // Conducts until pressed; overloaded contacts weld shut.
  buttonNC: {
    ...ohmic((p, el) => (p.pressed && !el.broken ? Infinity : R_SWITCH_ON)),
    thermal: { load: (r, p) => Math.abs(r.i) / p.maxCurrent, tau: 0.2, limit: 1.5, rise: 40 }, // °C at its rating: contacts
    failure: { label: 'contacts welded', open: false },
  },
};
