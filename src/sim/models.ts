// How each part type behaves electrically.
//
// Every model works on an element (see Element below) and a stamper (see
// Stamper and engine.ts) for the current time step:
//   stamp(el, s)    add the part's equations; called every Newton iteration
//   current(el, s)  current through the part from pin 0 to pin 1, once solved
//   branches(props) extra unknowns it needs (a voltage source's own current)
//   nonlinear       needs Newton iterations (diodes, transistors); its stamp
//                   sets s.converged = false while it is still limiting its step
//   dynamic         depends on time or on the previous step, so the circuit
//                   must keep being stepped (AC sources, capacitors, inductors)
//   accept(el, s)   commit per-step state once a time step has converged
//   readout(r, props)  [label, text] lines to show for a solved part
//   brightness(r, props)  light output for parts that glow: 0 dark, 1 at rating
//   maxStep(props)  longest time step that still follows the part (AC sources)
//   thermal         { load(r, props), tau, limit }: how hard the part is being
//                   driven (1 = at its rating), how fast it heats (s) and the
//                   heat at which it fails
//   failure         { label, open }: what a failed part has become; `open`
//                   parts conduct nothing, others handle `el.broken` themselves
//
// An AC generator, for instance, is a voltage source whose value comes from
// s.t and is marked `dynamic`; a capacitor would stamp a companion model from
// s.dt and the voltage kept in el.state by accept().

import type { PartType, Props, PropsByType } from '../types.ts';
import { formatSI } from '../units.ts';

// A solved part. v, i, p are instantaneous (pin 0 → pin 1); vrms, irms, pavg
// are running averages; `ac` is set when the circuit is time-dependent, in
// which case readouts show RMS and average values.
export interface Result {
  v: number;
  i: number;
  p: number;
  vrms: number;
  irms: number;
  pavg: number;
  heat: number; // 1 = at its rating; fails past the model's thermal limit
  load: number; // how hard it's driven right now, 1 = at its rating
  ac: boolean;
}

// What a part remembers between steps and rebuilds.
export interface PartState {
  heat?: number;
  vd?: number; // last diode voltage, the Newton starting point
  broken?: boolean;
  avg?: { v2: number; i2: number; p: number };
}

// A part as the engine sees it.
export interface Element<P = Props> {
  id: string;
  props: P;
  model: Model;
  broken: boolean;
  open: boolean; // failed and now conducting nothing
  nodes: number[]; // net index of each pin
  branch: number; // its own current unknown, or -1
  state: PartState;
}

// Adds a part's equations to the system for one Newton iteration.
export interface Stamper {
  t: number; // simulated time at the end of this step
  dt: number;
  converged: boolean;
  v(n: number): number; // present guess of a net's voltage
  x(k: number): number; // present guess of a branch current
  conductance(a: number, c: number, g: number): void;
  current(a: number, c: number, i: number): void;
  voltage(a: number, c: number, k: number, volts: number): void;
  idle(k: number): void;
}

export type Lines = [string, string][];

interface Thermal<P> {
  load(r: Result, p: P): number;
  tau: number;
  limit: number;
}

// One part type's model, checked against its values P.
interface ModelDef<P> {
  stamp(el: Element<P>, s: Stamper): void;
  current(el: Element<P>, s: Stamper): number;
  branches?(p: P): number;
  nonlinear?: boolean;
  dynamic?: boolean;
  accept?(el: Element<P>, s: Stamper): void;
  readout(r: Result, p: P): Lines;
  brightness?(r: Result, p: P): number;
  maxStep?(p: P): number;
  thermal?: Thermal<P>;
  failure?: { label: string; open: boolean };
}

// A model seen by code that handles any part type.
export type Model = ModelDef<Props>;

export const THERMAL_VOLTAGE = 0.025852; // kT/q at 27 °C
const R_SWITCH_ON = 1e-3;

// Values below a nanounit are GMIN leakage, not real readings.
const fmt = (v: number, unit: string) => formatSI(Math.abs(v) < 1e-9 ? 0 : v, unit);
const basicReadout = (r: Result): Lines =>
  r.ac
    ? [
        ['Voltage', `${fmt(r.vrms, 'V')} rms`],
        ['Current', `${fmt(r.irms, 'A')} rms`],
        ['Power', `${fmt(Math.abs(r.pavg), 'W')} avg`],
      ]
    : [
        ['Voltage', fmt(Math.abs(r.v), 'V')],
        ['Current', fmt(Math.abs(r.i), 'A')],
        ['Power', fmt(Math.abs(r.p), 'W')],
      ];

// A plain resistance between the two pins; Infinity means an open circuit.
// `resistance(props, el)` may look at el.broken.
function ohmic<P>(
  resistance: (p: P, el: Element<P>) => number,
  readout: (r: Result, p: P) => Lines = basicReadout,
): Pick<ModelDef<P>, 'stamp' | 'current' | 'readout'> {
  return {
    stamp(el, s) {
      const r = resistance(el.props, el);
      if (r !== Infinity) s.conductance(el.nodes[0], el.nodes[1], 1 / r);
    },
    current(el, s) {
      const r = resistance(el.props, el);
      return r === Infinity ? 0 : (s.v(el.nodes[0]) - s.v(el.nodes[1])) / r;
    },
    readout,
  };
}

// A filament is too slow to follow AC, so it shines by average power.
const lampLight = (r: Result, p: PropsByType['lamp']) => Math.abs(r.ac ? r.pavg : r.p) / p.ratedPower;

// Shockley diode, I = Is·(e^(V/nVt) − 1), fitted so it passes exactly
// `maxCurrent` at `forwardVoltage`.
const LED_IDEALITY = 2;

function diode(props: { maxCurrent: number; forwardVoltage: number }) {
  const nVt = LED_IDEALITY * THERMAL_VOLTAGE;
  const is = props.maxCurrent / Math.expm1(props.forwardVoltage / nVt);
  const vcrit = nVt * Math.log(nVt / (Math.SQRT2 * is));
  const current = (v: number) => is * Math.expm1(Math.min(v / nVt, 80));
  return { nVt, is, vcrit, current };
}

// SPICE's junction voltage limiting: stops Newton from jumping so far up the
// exponential that it overflows or oscillates.
function limitJunction(vnew: number, vold: number, nVt: number, vcrit: number): number {
  if (vnew > vcrit && Math.abs(vnew - vold) > 2 * nVt) {
    if (vold > 0) {
      const arg = 1 + (vnew - vold) / nVt;
      return arg > 0 ? vold + nVt * Math.log(arg) : vcrit;
    }
    return nVt * Math.log(vnew / nVt);
  }
  return vnew;
}

// An ideal source of `volts(props, t)` in series with its internal resistance:
// a Norton equivalent when that resistance is non-zero, a true voltage source
// when it is zero.
function source<P extends { internalResistance: number }>(
  volts: (p: P, t: number) => number,
): Pick<ModelDef<P>, 'branches' | 'stamp' | 'current'> {
  return {
    branches: (p) => (p.internalResistance > 0 ? 0 : 1),
    stamp(el, s) {
      const [a, b] = el.nodes;
      const v = volts(el.props, s.t);
      const r = el.props.internalResistance;
      if (r > 0) {
        s.conductance(a, b, 1 / r);
        s.current(a, b, -v / r);
      } else {
        s.voltage(a, b, el.branch, v);
      }
    },
    current(el, s) {
      const [a, b] = el.nodes;
      const r = el.props.internalResistance;
      return r > 0 ? (s.v(a) - s.v(b) - volts(el.props, s.t)) / r : s.x(el.branch);
    },
  };
}

const sourceThermal: Thermal<{ maxCurrent: number }> = {
  load: (r, p) => Math.abs(r.i) / p.maxCurrent,
  tau: 1,
  limit: 1.5,
};

// Overloaded contacts weld shut: a failed switch conducts whatever its setting.
const switchModel: ModelDef<PropsByType['switch']> = {
  ...ohmic((p, el) => (p.closed || el.broken ? R_SWITCH_ON : Infinity)),
  thermal: { load: (r, p) => Math.abs(r.i) / p.maxCurrent, tau: 0.2, limit: 1.5 },
  failure: { label: 'contacts welded', open: false },
};

const DEFINITIONS: { [T in PartType]: ModelDef<PropsByType[T]> } = {
  battery: {
    ...source((p) => p.voltage),
    // Current out of the + terminal, power delivered to the circuit.
    readout: (r) =>
      r.ac
        ? [
            ['Voltage', fmt(r.v, 'V')],
            ['Current', `${fmt(r.irms, 'A')} rms`],
            ['Power', `${fmt(-r.pavg, 'W')} avg`],
          ]
        : [
            ['Voltage', fmt(r.v, 'V')],
            ['Current', fmt(-r.i, 'A')],
            ['Power', fmt(-r.p, 'W')],
          ],
    thermal: sourceThermal,
    failure: { label: 'damaged', open: true },
  },

  // v(t) = Vrms·√2·sin(2πft + φ). Steps must stay well inside one period.
  generator: {
    ...source((p, t) => p.voltage * Math.SQRT2 * Math.sin(2 * Math.PI * p.frequency * t + (p.phase * Math.PI) / 180)),
    dynamic: true,
    maxStep: (p) => 1 / (20 * p.frequency),
    readout: (r, p) => [
      ['Voltage', `${fmt(r.vrms, 'V')} rms`],
      ['Current', `${fmt(r.irms, 'A')} rms`],
      ['Power', `${fmt(-r.pavg, 'W')} avg`],
      ['Frequency', fmt(p.frequency, 'Hz')],
      ['Now', `${fmt(r.v, 'V')}, ${fmt(-r.i, 'A')}`],
    ],
    thermal: sourceThermal,
    failure: { label: 'damaged', open: true },
  },

  resistor: {
    ...ohmic((p) => p.resistance),
    thermal: { load: (r, p) => Math.abs(r.p) / p.powerRating, tau: 2, limit: 2 },
    failure: { label: 'burnt out', open: true },
  },

  // Filament treated as its hot resistance, V²/P at the rated values.
  lamp: {
    ...ohmic(
      (p) => p.ratedVoltage ** 2 / p.ratedPower,
      (r, p) => [...basicReadout(r), ['Brightness', `${Math.round(lampLight(r, p) * 100)} %`]],
    ),
    brightness: (r, p) => lampLight(r, p),
    thermal: { load: (r, p) => Math.abs(r.p) / p.ratedPower, tau: 0.3, limit: 1.5 },
    failure: { label: 'filament blown', open: true },
  },

  switch: switchModel,

  // A push button is electrically a switch that is only closed while held.
  button: switchModel,

  led: {
    nonlinear: true,
    stamp(el, s) {
      const [a, b] = el.nodes;
      const d = diode(el.props);
      const v = s.v(a) - s.v(b);
      const vd = limitJunction(v, el.state.vd ?? 0, d.nVt, d.vcrit);
      if (Math.abs(vd - v) > 1e-6) s.converged = false;
      el.state.vd = vd;
      // Linearise around vd: I ≈ gd·v + (id − gd·vd).
      const id = d.current(vd);
      const gd = (d.is * Math.exp(Math.min(vd / d.nVt, 80))) / d.nVt;
      s.conductance(a, b, gd);
      s.current(a, b, id - gd * vd);
    },
    current(el, s) {
      return diode(el.props).current(s.v(el.nodes[0]) - s.v(el.nodes[1]));
    },
    // Light output roughly follows forward current.
    brightness: (r, p) => Math.max(0, r.i) / p.maxCurrent,
    // On AC the instantaneous current swings, so judge by its RMS.
    readout: (r, p) => {
      const i = r.ac ? r.irms : r.i;
      let status = 'off';
      if (i > p.maxCurrent * 1.1) status = 'over max current!';
      else if (i > p.maxCurrent * 0.01) status = 'on';
      return [...basicReadout(r), ['State', status]];
    },
    thermal: { load: (r, p) => Math.max(0, r.i) / p.maxCurrent, tau: 0.05, limit: 1.5 },
    failure: { label: 'burnt out', open: true },
  },
};

// Every part type's model, seen generally (each is checked against its own
// values above).
export const MODELS = DEFINITIONS as unknown as Record<PartType, Model>;
