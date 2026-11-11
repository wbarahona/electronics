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
  thermal: { load: (r, p) => Math.abs(r.i) / p.maxCurrent, tau: 0.2, limit: 1.5 },
  failure: { label: 'contacts welded', open: false },
};

export const defs: PartDefs<'switch' | 'button' | 'buttonNC'> = {
  switch: {
    name: 'Switch',
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
  },
  // Normally-open push button: closed only while held down.
  button: {
    name: 'Push button (NO)',
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
  },
  // Normally-closed push button: conducts until held down. DIN break contact:
  // the blade rests against a stop on the fixed contact; pressing lifts it off.
  buttonNC: {
    name: 'Push button (NC)',
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
  },
};

export const models: ModelDefs<'switch' | 'button' | 'buttonNC'> = {
  switch: switchModel,
  // A push button is electrically a switch that is only closed while held.
  button: switchModel,
  // Conducts until pressed; overloaded contacts weld shut.
  buttonNC: {
    ...ohmic((p, el) => (p.pressed && !el.broken ? Infinity : R_SWITCH_ON)),
    thermal: { load: (r, p) => Math.abs(r.i) / p.maxCurrent, tau: 0.2, limit: 1.5 },
    failure: { label: 'contacts welded', open: false },
  },
};
