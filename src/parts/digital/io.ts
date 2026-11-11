import { driveOutput, G_LOGIC_IN, G_LOGIC_OUT, HIGH_LEVEL, LOW_LEVEL } from '../../sim/shared/logic.ts';
import { fmt } from '../../sim/shared/readout.ts';
import { formatSI } from '../../units.ts';
import type { Element, ModelDef, ModelDefs, Stamper } from '../../sim/models.ts';
import type { PartDefs } from '../defs.ts';

// The values each of these parts carries: what the properties panel edits
// and the simulator reads (gathered into PropsByType in src/types.ts).
export interface PartProps {
  logicSwitch: { high: boolean; supply: number };
  clock: { frequency: number; duty: number; supply: number }; // duty in %
  probe: { supply: number };
}

// S (25 Ω output)
const LOGIC_SOURCE_MAX = 0.05; // A a logic switch or clock output can give

type LogicProps = { supply: number };

// A one-pin source of a logic level, `high(props, t)`.
function logicSource<P extends LogicProps>(
  high: (p: P, t: number) => boolean,
): Pick<ModelDef<P>, 'grounded' | 'stamp' | 'current' | 'pinCurrents' | 'thermal' | 'failure'> {
  const out = (el: Element<P>, s: Stamper) => G_LOGIC_OUT * (s.v(el.nodes[0]) - (high(el.props, s.t) ? el.props.supply : 0));
  return {
    grounded: true,
    stamp(el, s) {
      driveOutput(s, el.nodes[0], high(el.props, s.t) ? el.props.supply : 0);
    },
    current: out,
    pinCurrents: (el, s) => [out(el, s)],
    thermal: { load: (r) => Math.abs(r.pins[0]) / LOGIC_SOURCE_MAX, tau: 0.2, limit: 1.5 },
    failure: { label: 'burnt out', open: true },
  };
}

export const defs: PartDefs<'logicSwitch' | 'clock' | 'probe'> = {
  // A logic level set by hand: its toggle switches the output between 1 and 0.
  logicSwitch: {
    name: 'Logic switch',
    letter: 'S',
    category: 'digital',
    group: 'Input/Output',
    pins: [{ x: 40, y: 0 }],
    props: {
      high: { label: 'Output high', value: false },
      supply: { label: 'Logic supply', unit: 'V', value: 5, min: 1, max: 15 },
    },
    actuator: { prop: 'high', momentary: false },
    draw: ({ high }) => `
      <path d="M 14 0 H 40" />
      <rect x="-14" y="-12" width="28" height="24" />
      <text class="gate-text upright" y="5" text-anchor="middle">${high ? 1 : 0}</text>`,
  },
  // Square-wave clock (the box shows a pulse).
  clock: {
    name: 'Clock',
    letter: 'G',
    category: 'digital',
    group: 'Input/Output',
    pins: [{ x: 40, y: 0 }],
    props: {
      frequency: { label: 'Frequency', unit: 'Hz', value: 1, min: 0.01, max: 1000 },
      duty: { label: 'Duty cycle', unit: '%', value: 50, min: 1, max: 99, slider: true },
      supply: { label: 'Logic supply', unit: 'V', value: 5, min: 1, max: 15 },
    },
    tag: (p) => formatSI(p.frequency, 'Hz'),
    draw: () => `
      <path d="M 20 0 H 40" />
      <rect x="-20" y="-16" width="40" height="32" />
      <path d="M -12 6 H -6 V -6 H 2 V 6 H 8 V -6 H 12" />`,
  },
  // Shows a logic level: lights red for 1; its display reads 1 or 0.
  probe: {
    name: 'Logic probe',
    letter: 'P',
    category: 'digital',
    group: 'Input/Output',
    pins: [{ x: -40, y: 0 }],
    props: {
      supply: { label: 'Logic supply', unit: 'V', value: 5, min: 1, max: 15 },
    },
    glow: { color: () => 'red', radius: 24 },
    display: true,
    draw: () => `
      <path d="M -40 0 H -12" />
      <circle class="bulb tinted" r="12" />`,
  },
};

export const models: ModelDefs<'logicSwitch' | 'clock' | 'probe'> = {
  logicSwitch: {
    ...logicSource((p) => p.high),
    readout: (r, p) => [['Output', `${p.high ? 1 : 0} (${fmt(r.pinV[0], 'V')})`], ['Current', fmt(Math.abs(r.pins[0]), 'A')]],
  },
  // High for the first `duty` % of each period.
  clock: {
    ...logicSource((p, t) => (t * p.frequency) % 1 < p.duty / 100),
    dynamic: true,
    maxStep: (p) => 1 / (20 * p.frequency),
    readout: (r, p) => [['Output', `${r.pinV[0] > p.supply / 2 ? 1 : 0} (${fmt(r.pinV[0], 'V')})`], ['Frequency', fmt(p.frequency, 'Hz')]],
  },
  probe: {
    grounded: true,
    stamp(el, s) {
      s.draw(el.nodes[0], [[el.nodes[0], G_LOGIC_IN]], 0);
    },
    current: (el, s) => G_LOGIC_IN * s.v(el.nodes[0]),
    pinCurrents: (el, s) => [G_LOGIC_IN * s.v(el.nodes[0])],
    brightness: (r, p) => (r.pinV[0] > p.supply * HIGH_LEVEL ? 1 : 0),
    reading: (r, p) => (r.pinV[0] > p.supply / 2 ? '1' : '0'),
    readout: (r, p) => [
      ['Level', r.pinV[0] > p.supply * HIGH_LEVEL ? '1' : r.pinV[0] < p.supply * LOW_LEVEL ? '0' : 'undefined'],
      ['Voltage', fmt(r.pinV[0], 'V')],
    ],
  },
};
