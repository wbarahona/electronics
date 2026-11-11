import { basicReadout } from '../../sim/shared/readout.ts';
import { junction } from '../../sim/shared/junctions.ts';
import { powerThermal } from '../../sim/shared/resistance.ts';
import { formatSI } from '../../units.ts';
import type { ModelDef, ModelDefs, Result } from '../../sim/models.ts';
import { partNumberSpec, type Preset, type PartDefs } from '../defs.ts';
import type { PropsByType } from '../../types.ts';

// The values each of these parts carries: what the properties panel edits
// and the simulator reads (gathered into PropsByType in src/types.ts).
export interface PartProps {
  // Forward voltage is at 10 mA.
  diode: { partNumber: string; forwardVoltage: number; maxCurrent: number; reverseVoltage: number };
  schottky: { partNumber: string; forwardVoltage: number; maxCurrent: number; reverseVoltage: number };
  zener: { partNumber: string; forwardVoltage: number; zenerVoltage: number; powerRating: number };
}

// V an electrolytic takes the wrong way round
const DIODE_N = 1.8; // ideality of rectifier and zener junctions

// A two-pin diode-like part: stamps the linearised junction each iteration.
function diodeModel<P>(make: (p: P) => ReturnType<typeof junction>): Pick<ModelDef<P>, 'nonlinear' | 'stamp' | 'current'> {
  return {
    nonlinear: true,
    stamp(el, s) {
      const [a, b] = el.nodes;
      const d = make(el.props);
      const v = s.v(a) - s.v(b);
      const vd = d.limit(v, el.state.vd ?? 0);
      if (Math.abs(vd - v) > 1e-6) s.converged = false;
      el.state.vd = vd;
      const g = d.slope(vd) + 1e-12;
      s.conductance(a, b, g);
      s.current(a, b, d.current(vd) - g * vd);
    },
    current(el, s) {
      return make(el.props).current(s.v(el.nodes[0]) - s.v(el.nodes[1]));
    },
  };
}

// Going past a diode's reverse rating is catastrophic rather than a slow
// overload: stress climbs steeply (10 % over already exceeds the limit).
const reverseStress = (r: Result, p: { reverseVoltage: number }) => Math.max(0, -r.v / p.reverseVoltage) ** 4;

const diodeState = (r: Result, conducting: string) =>
  r.i > 1e-4 ? conducting : r.i < -1e-4 ? 'breakdown' : 'blocking';

// diode's part numbers (datasheet values; the default first in Europe).
const DIODE_PRESETS: Preset<PropsByType['diode']>[] = [
  { code: '1N4001', note: '50 V, 1 A general-purpose rectifier (DO-41)', values: { forwardVoltage: 0.65, maxCurrent: 1, reverseVoltage: 50 } },
  { code: '1N4002', note: '100 V, 1 A general-purpose rectifier (DO-41)', values: { forwardVoltage: 0.65, maxCurrent: 1, reverseVoltage: 100 } },
  { code: '1N4004', note: '400 V, 1 A rectifier (DO-41): 120 V mains', values: { forwardVoltage: 0.65, maxCurrent: 1, reverseVoltage: 400 } },
  { code: '1N4007', note: '1000 V, 1 A rectifier (DO-41): the everyday mains diode', values: { forwardVoltage: 0.65, maxCurrent: 1, reverseVoltage: 1000 } },
  { code: '1N5408', note: '1000 V, 3 A rectifier (DO-201)', values: { forwardVoltage: 0.6, maxCurrent: 3, reverseVoltage: 1000 } },
  { code: '1N4148', note: '100 V, 200 mA small-signal switching diode (DO-35)', values: { forwardVoltage: 0.75, maxCurrent: 0.2, reverseVoltage: 100 } },
  { code: '1N914', note: '100 V, 200 mA small-signal switching diode (DO-35)', values: { forwardVoltage: 0.75, maxCurrent: 0.2, reverseVoltage: 100 } },
];

// schottky's part numbers (datasheet values; the default first in Europe).
const SCHOTTKY_PRESETS: Preset<PropsByType['schottky']>[] = [
  { code: '1N5817', note: '20 V, 1 A Schottky rectifier (DO-41)', values: { forwardVoltage: 0.25, maxCurrent: 1, reverseVoltage: 20 } },
  { code: '1N5818', note: '30 V, 1 A Schottky rectifier (DO-41)', values: { forwardVoltage: 0.28, maxCurrent: 1, reverseVoltage: 30 } },
  { code: '1N5819', note: '40 V, 1 A Schottky rectifier (DO-41)', values: { forwardVoltage: 0.3, maxCurrent: 1, reverseVoltage: 40 } },
  { code: 'SB560', note: '60 V, 5 A Schottky rectifier (DO-201)', values: { forwardVoltage: 0.3, maxCurrent: 5, reverseVoltage: 60 } },
  { code: 'BAT85', note: '30 V, 200 mA small-signal Schottky (DO-35)', values: { forwardVoltage: 0.4, maxCurrent: 0.2, reverseVoltage: 30 } },
  { code: 'BAT54', note: '30 V, 200 mA small-signal Schottky (SOT-23)', values: { forwardVoltage: 0.35, maxCurrent: 0.2, reverseVoltage: 30 } },
];

// zener's part numbers (datasheet values; the default first in Europe).
const ZENER_PRESETS: Preset<PropsByType['zener']>[] = [
  { code: 'BZX55C3V3', note: '3.3 V, 500 mW zener (DO-35)', values: { forwardVoltage: 0.7, zenerVoltage: 3.3, powerRating: 0.5 } },
  { code: 'BZX55C5V1', note: '5.1 V, 500 mW zener (DO-35)', values: { forwardVoltage: 0.7, zenerVoltage: 5.1, powerRating: 0.5 } },
  { code: 'BZX55C6V2', note: '6.2 V, 500 mW zener (DO-35)', values: { forwardVoltage: 0.7, zenerVoltage: 6.2, powerRating: 0.5 } },
  { code: 'BZX55C9V1', note: '9.1 V, 500 mW zener (DO-35)', values: { forwardVoltage: 0.7, zenerVoltage: 9.1, powerRating: 0.5 } },
  { code: 'BZX55C12', note: '12 V, 500 mW zener (DO-35)', values: { forwardVoltage: 0.7, zenerVoltage: 12, powerRating: 0.5 } },
  { code: 'BZX55C15', note: '15 V, 500 mW zener (DO-35)', values: { forwardVoltage: 0.7, zenerVoltage: 15, powerRating: 0.5 } },
  { code: 'BZX85C5V1', note: '5.1 V, 1.3 W zener (DO-41)', values: { forwardVoltage: 0.7, zenerVoltage: 5.1, powerRating: 1.3 } },
  { code: 'BZX85C12', note: '12 V, 1.3 W zener (DO-41)', values: { forwardVoltage: 0.7, zenerVoltage: 12, powerRating: 1.3 } },
  { code: '1N4733A', note: '5.1 V, 1 W zener (DO-41)', values: { forwardVoltage: 0.7, zenerVoltage: 5.1, powerRating: 1 } },
  { code: '1N4742A', note: '12 V, 1 W zener (DO-41)', values: { forwardVoltage: 0.7, zenerVoltage: 12, powerRating: 1 } },
];

export const defs: PartDefs<'diode' | 'schottky' | 'zener'> = {
  // Pin 0 is the anode, pin 1 the cathode (the bar), as for the LED.
  diode: {
    name: 'Diode',
    letter: 'R',
    category: 'semiconductors',
    group: 'Diodes',
    pins: [{ x: -40, y: 0 }, { x: 40, y: 0 }],
    props: {
      partNumber: partNumberSpec(DIODE_PRESETS, '1N4007'),
      forwardVoltage: { label: 'Forward voltage (10 mA)', unit: 'V', value: 0.7, min: 0.1 },
      maxCurrent: { label: 'Max current', unit: 'A', value: 1, min: 0.001 },
      reverseVoltage: { label: 'Max reverse voltage', unit: 'V', value: 100, min: 1 },
    },
    presets: DIODE_PRESETS,
    draw: () => `
      <path d="M -40 0 H 40 M 10 -10 V 10 M -10 -10 V 10 L 10 0 Z" />`,
  },
  schottky: {
    name: 'Schottky diode',
    letter: 'R',
    category: 'semiconductors',
    group: 'Diodes',
    pins: [{ x: -40, y: 0 }, { x: 40, y: 0 }],
    props: {
      partNumber: partNumberSpec(SCHOTTKY_PRESETS, '1N5819'),
      forwardVoltage: { label: 'Forward voltage (10 mA)', unit: 'V', value: 0.3, min: 0.05 },
      maxCurrent: { label: 'Max current', unit: 'A', value: 1, min: 0.001 },
      reverseVoltage: { label: 'Max reverse voltage', unit: 'V', value: 40, min: 1 },
    },
    presets: SCHOTTKY_PRESETS,
    draw: () => `
      <path d="M -40 0 H 40 M -10 -10 V 10 L 10 0 Z M 15 -6 V -10 H 10 V 10 H 5 V 6" />`,
  },
  // Conducts forward like a diode; in reverse it breaks down at its zener
  // voltage and holds it there.
  zener: {
    name: 'Zener diode',
    letter: 'R',
    category: 'semiconductors',
    group: 'Diodes',
    pins: [{ x: -40, y: 0 }, { x: 40, y: 0 }],
    props: {
      partNumber: partNumberSpec(ZENER_PRESETS, 'BZX55C5V1'),
      forwardVoltage: { label: 'Forward voltage (10 mA)', unit: 'V', value: 0.7, min: 0.1 },
      zenerVoltage: { label: 'Zener voltage', unit: 'V', value: 5.1, min: 0.5 },
      powerRating: { label: 'Power rating', unit: 'W', value: 0.5, min: 0.001 },
    },
    presets: ZENER_PRESETS,
    tag: (p) => formatSI(p.zenerVoltage, 'V'),
    draw: () => `
      <path d="M -40 0 H 40 M -10 -10 V 10 L 10 0 Z M 5 -13 L 10 -10 V 10 L 15 13" />`,
  },
};

export const models: ModelDefs<'diode' | 'schottky' | 'zener'> = {
  diode: {
    ...diodeModel((p) => junction(p.forwardVoltage, DIODE_N)),
    readout: (r) => [...basicReadout(r), ['State', diodeState(r, 'conducting')]],
    // Over-current, or reverse voltage past its rating.
    thermal: { load: (r, p) => Math.max(Math.abs(r.i) / p.maxCurrent, reverseStress(r, p)), tau: 0.3, limit: 1.5 },
    failure: { label: 'burnt out', open: true },
  },
  schottky: {
    ...diodeModel((p) => junction(p.forwardVoltage, DIODE_N)),
    readout: (r) => [...basicReadout(r), ['State', diodeState(r, 'conducting')]],
    thermal: { load: (r, p) => Math.max(Math.abs(r.i) / p.maxCurrent, reverseStress(r, p)), tau: 0.3, limit: 1.5 },
    failure: { label: 'burnt out', open: true },
  },
  zener: {
    ...diodeModel((p) => junction(p.forwardVoltage, DIODE_N, p.zenerVoltage)),
    readout: (r) => [...basicReadout(r), ['State', diodeState(r, 'forward')]],
    thermal: powerThermal(0.5, 1.5),
    failure: { label: 'burnt out', open: true },
  },
};
