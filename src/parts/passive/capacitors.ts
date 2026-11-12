import { basicReadout, fmt, pct } from '../../sim/shared/readout.ts';
import { formatSI } from '../../units.ts';
import type { Element, ModelDef, ModelDefs, Result, Stamper } from '../../sim/models.ts';
import type { PartDefs } from '../defs.ts';
import { toleranceProps, type Tolerance } from '../tolerance.ts';

// The values each of these parts carries: what the properties panel edits
// and the simulator reads (gathered into PropsByType in src/types.ts).
export interface PartProps {
  capacitor: { capacitance: number; ratedVoltage: number } & Tolerance;
  electrolytic: { capacitance: number; ratedVoltage: number } & Tolerance;
}

// K
const REVERSE_TOLERANCE = 1; // V an electrolytic takes the wrong way round

// A capacitor: i = C·dv/dt. Over a step it is a conductance C/dt in parallel
// with a current source holding the previous voltage. `load` judges stress
// from the voltage across it.
function capacitor<P extends { capacitance: number; ratedVoltage: number }>(
  load: (v: number, p: P) => number,
): ModelDef<P> {
  const g = (el: Element<P>, s: Stamper) => el.props.capacitance / s.dt;
  const level = (r: Result, p: P) => Math.min(1, Math.abs(r.v) / p.ratedVoltage);
  return {
    dynamic: true,
    stamp(el, s) {
      const [a, b] = el.nodes;
      s.conductance(a, b, g(el, s));
      s.current(a, b, -g(el, s) * (el.state.v ?? 0));
    },
    current(el, s) {
      return g(el, s) * (s.v(el.nodes[0]) - s.v(el.nodes[1]) - (el.state.v ?? 0));
    },
    accept(el, s) {
      el.state.v = s.v(el.nodes[0]) - s.v(el.nodes[1]);
    },
    level,
    readout: (r, p) => [
      ...basicReadout(r),
      ['Charge', fmt(p.capacitance * Math.abs(r.v), 'C')],
      ['Level', pct(level(r, p))],
    ],
    thermal: { load: (r, p) => load(r.v, p), tau: 0.05, limit: 1.5 },
    failure: { label: 'blown', open: true },
  };
}

export const defs: PartDefs<'capacitor' | 'electrolytic'> = {
  capacitor: {
    name: 'Capacitor',
    letter: 'C',
    category: 'passive',
    group: 'Capacitors & inductors',
    pins: [{ x: -40, y: 0 }, { x: 40, y: 0 }],
    props: {
      capacitance: { label: 'Capacitance', unit: 'F', value: 10e-6, min: 1e-12 },
      ratedVoltage: { label: 'Rated voltage', unit: 'V', value: 25, min: 0.1 },
      ...toleranceProps(10),
    },
    tag: (p) => formatSI(p.capacitance, 'F'),
    gauge: true,
    draw: () => `
      <path d="M -40 0 H -4 M 4 0 H 40" />
      <path class="thick" d="M -4 -14 V 14 M 4 -14 V 14" />`,
  },
  // Polarised: pin 0 is +. The + plate is drawn hollow (DIN EN 60617).
  electrolytic: {
    name: 'Electrolytic cap',
    letter: 'C',
    category: 'passive',
    group: 'Capacitors & inductors',
    pins: [{ x: -40, y: 0 }, { x: 40, y: 0 }], // +, −
    props: {
      capacitance: { label: 'Capacitance', unit: 'F', value: 470e-6, min: 1e-9 },
      ratedVoltage: { label: 'Rated voltage', unit: 'V', value: 16, min: 0.1 },
      ...toleranceProps(20),
    },
    tag: (p) => `${formatSI(p.capacitance, 'F')} ${formatSI(p.ratedVoltage, 'V')}`,
    gauge: true,
    draw: () => `
      <path d="M -40 0 H -7 M 5 0 H 40 M -16 -14 H -10 M -13 -17 V -11" />
      <rect x="-7" y="-14" width="4" height="28" />
      <path class="thick" d="M 5 -14 V 14" />`,
  },
};

export const models: ModelDefs<'capacitor' | 'electrolytic'> = {
  // Stressed by voltage beyond its rating, either way round.
  capacitor: { ...capacitor((v, p) => Math.abs(v) / p.ratedVoltage), tolerance: ['capacitance'] },
  // Also stressed by reverse voltage: past about a volt the wrong way it
  // heats up and blows.
  electrolytic: { ...capacitor((v, p) => (v >= 0 ? v / p.ratedVoltage : -v / REVERSE_TOLERANCE)), tolerance: ['capacitance'] },
};
