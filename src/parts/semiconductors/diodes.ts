import { basicReadout } from '../../sim/shared/readout.ts';
import { junction } from '../../sim/shared/junctions.ts';
import { powerThermal } from '../../sim/shared/resistance.ts';
import { formatSI } from '../../units.ts';
import type { ModelDef, ModelDefs, Result } from '../../sim/models.ts';
import type { PartDefs } from '../defs.ts';

// The values each of these parts carries: what the properties panel edits
// and the simulator reads (gathered into PropsByType in src/types.ts).
export interface PartProps {
  // Forward voltage is at 10 mA.
  diode: { forwardVoltage: number; maxCurrent: number; reverseVoltage: number };
  schottky: { forwardVoltage: number; maxCurrent: number; reverseVoltage: number };
  zener: { forwardVoltage: number; zenerVoltage: number; powerRating: number };
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

export const defs: PartDefs<'diode' | 'schottky' | 'zener'> = {
  // Pin 0 is the anode, pin 1 the cathode (the bar), as for the LED.
  diode: {
    name: 'Diode',
    letter: 'R',
    category: 'semiconductors',
    group: 'Diodes',
    pins: [{ x: -40, y: 0 }, { x: 40, y: 0 }],
    props: {
      forwardVoltage: { label: 'Forward voltage (10 mA)', unit: 'V', value: 0.7, min: 0.1 },
      maxCurrent: { label: 'Max current', unit: 'A', value: 1, min: 0.001 },
      reverseVoltage: { label: 'Max reverse voltage', unit: 'V', value: 100, min: 1 },
    },
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
      forwardVoltage: { label: 'Forward voltage (10 mA)', unit: 'V', value: 0.3, min: 0.05 },
      maxCurrent: { label: 'Max current', unit: 'A', value: 1, min: 0.001 },
      reverseVoltage: { label: 'Max reverse voltage', unit: 'V', value: 40, min: 1 },
    },
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
      forwardVoltage: { label: 'Forward voltage (10 mA)', unit: 'V', value: 0.7, min: 0.1 },
      zenerVoltage: { label: 'Zener voltage', unit: 'V', value: 5.1, min: 0.5 },
      powerRating: { label: 'Power rating', unit: 'W', value: 0.5, min: 0.001 },
    },
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
