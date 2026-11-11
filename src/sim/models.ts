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
//   alternating     an AC source: its circuit's readouts show RMS values
//   accept(el, s)   commit per-step state once a time step has converged
//   readout(r, props)  [label, text] lines to show for a solved part
//   brightness(r, props)  light output for parts that glow: 0 dark, 1 at rating
//   maxStep(props)  longest time step that still follows the part (AC sources)
//   thermal         { load(r, props), tau, limit }: how hard the part is being
//                   driven (1 = at its rating), how fast it heats (s) and the
//                   heat at which it fails
//   failure         { label, open }: what a failed part has become; `open`
//                   parts conduct nothing, others handle `el.broken` themselves
//   pinCurrents(el, s)  current into the part at each pin, for parts with
//                   more than two pins (otherwise [i, −i])
//   power(el, s)    power it takes in, when that isn't simply v·i
//   respond(el, env, r, dt)  react to the surroundings after a solved step
//                   (light reaching an LDR, a thermistor warming up, a gate
//                   reading its inputs); dt is null when settling instantly
//                   after an edit. Returns whether anything changed.
//   grounded        draws its supply from the hidden logic supply, which
//                   returns through 0 V (logic parts)
//   groundTie       holds its net at 0 V itself (Ground)
//   groups          pins that are electrically connected inside the part,
//                   when not all are (a transformer's isolated windings)
//   extras(r)       further values to keep RMS averages of (r.extraRms)
//   reading(r)      what a meter's display shows
//   level(r, props) how full an energy store is, 0..1 (the board's gauge)
//   drain(el, r, dt)  use up stored energy over dt seconds of simulated time;
//                   returns whether it is still draining
//
// Parts that store energy (capacitors, inductors) use backward-Euler companion
// models: over a step of dt they act like a conductance plus a current source
// built from what they held at the end of the previous step. accept() records
// the new value once the step is solved. Backward Euler stays stable at any
// step size, which matters when the simulation is run fast.
//
// An AC generator, for instance, is a voltage source whose value comes from
// s.t and is marked `dynamic`; a capacitor would stamp a companion model from
// s.dt and the voltage kept in el.state by accept().

import type { PartType, Props, PropsByType } from '../types.ts';
import { formatSI } from '../units.ts';

// A solved part. v, i, p are instantaneous (v and i between pins 0 and 1;
// `pins` has the current into the part at every pin, `pinV` each pin's
// voltage against the circuit's reference); vrms, irms, pavg
// are running averages; `ac` is set when an AC source drives the circuit, in
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
  level?: number; // how full an energy store is, 0..1
  ac: boolean;
  pins: number[];
  pinV: number[];
  extraRms: number[]; // RMS of the model's extras(), in the same order
  state: PartState; // what the part is sensing (light, temperature)
}

// What a part remembers between steps and rebuilds.
export interface PartState {
  heat?: number;
  vd?: number; // last diode voltage, the Newton starting point
  v?: number; // capacitor voltage at the end of the last step
  i?: number; // inductor current at the end of the last step
  light?: number; // light an LDR is getting, 0..1
  rise?: number; // a thermistor's temperature above ambient, K
  ins?: boolean[]; // a logic part's input levels and output
  out?: boolean;
  edges?: number; // rising clock edges a flip-flop has seen
  edgeAt?: number; // a 555's last rising edge (s) and the period it measured
  period?: number;
  mode?: 'regulating' | 'dropout'; // a regulator's region at the last iteration
  vbe?: number; // transistor junction voltages at the last iteration
  vbc?: number;
  vgs?: number;
  vds?: number;
  broken?: boolean;
  avg?: { v2: number; i2: number; p: number; x2: number[] };
  i1?: number; // transformer winding currents at the end of the last step
  i2?: number;
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
  draw(node: number, terms: [number, number][], i0: number): void;
}

export type Lines = [string, string][];

// What a part can sense around it.
export interface Env {
  readonly time: number; // simulated time, s
  light(el: Element): number; // light reaching it from glowing parts, 0..1+
}

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
  alternating?: boolean;
  accept?(el: Element<P>, s: Stamper): void;
  readout(r: Result, p: P): Lines;
  brightness?(r: Result, p: P): number;
  maxStep?(p: P): number;
  thermal?: Thermal<P>;
  failure?: { label: string; open: boolean; display?: string }; // display: what a broken meter shows
  level?(r: Result, p: P): number;
  drain?(el: Element<P>, r: Result, dt: number): boolean;
  pinCurrents?(el: Element<P>, s: Stamper): number[];
  groups?: number[][];
  extras?(r: Result): number[];
  reading?(r: Result, p: P): string;
  power?(el: Element<P>, s: Stamper): number;
  respond?(el: Element<P>, env: Env, r: Result, dt: number | null): boolean | void;
  grounded?: boolean;
  groundTie?: boolean;
}

// A model seen by code that handles any part type.
export type Model = ModelDef<Props>;

export const THERMAL_VOLTAGE = 0.025852; // kT/q at 27 °C
const R_SWITCH_ON = 1e-3;
const G_GROUND = 1e6; // S; Ground holds its net at 0 V this firmly
const R_FUSE = 0.01;
const R_MIN = 1e-3; // a wiper or setting at its very end still has a little resistance
const LDR_TAU = 0.05; // s; LDRs follow light with a short lag
const KELVIN = 273.15;
const NTC_RTH = 100; // K/W: warming per watt dissipated (10 mW/K dissipation constant)
const NTC_TAU = 3; // s to warm up or cool down
// A thermistor is destroyed long before this; the cap just keeps the B
// equation from running off to nonsense during thermal runaway.
const NTC_MAX_RISE = 300; // K
const REVERSE_TOLERANCE = 1; // V an electrolytic takes the wrong way round
const DIODE_N = 1.8; // ideality of rectifier and zener junctions

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

// The two halves of a potentiometer's track either side of the wiper.
const halves = (p: PropsByType['potentiometer']) => [
  Math.max(R_MIN, (p.resistance * p.position) / 100),
  Math.max(R_MIN, (p.resistance * (100 - p.position)) / 100),
];

// An LDR's resistance falls from dark to bright on a log scale as light
// (0..1) rises.
const ldrResistance = (p: PropsByType['ldr'], light: number) =>
  p.darkResistance * (p.lightResistance / p.darkResistance) ** Math.min(1, Math.max(0, light));

// B-parameter thermistor equation, from its resistance at 25 °C.
const ntcResistance = (p: PropsByType['ntc'], rise: number) =>
  p.resistance * Math.exp(p.beta * (1 / (p.ambient + rise + KELVIN) - 1 / (25 + KELVIN)));

const powerThermal = <P extends { powerRating: number }>(tau: number, limit: number): Thermal<P> => ({
  load: (r, p) => Math.abs(r.p) / p.powerRating,
  tau,
  limit,
});

const meterReading = (r: Result, unit: 'V' | 'A') => {
  if (r.ac) return `${fmt(unit === 'V' ? r.vrms : r.irms, unit)} ~`;
  return fmt(unit === 'V' ? r.v : r.i, unit);
};

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

// A diode fitted to pass 10 mA at its forward voltage, with an optional
// reverse breakdown at `vz` (zener): I = Is·(e^(v/nVt) − 1) − Ir·e^(−(v+vz)/nVtz).
const DIODE_IREF = 0.01;
const ZENER_KNEE = 0.005; // A drawn in breakdown right at the zener voltage
const ZENER_NVT = 0.05; // V; sharpness of the breakdown knee

function junction(forwardVoltage: number, n: number, vz?: number) {
  const nVt = n * THERMAL_VOLTAGE;
  const is = DIODE_IREF / Math.expm1(forwardVoltage / nVt);
  const vcrit = nVt * Math.log(nVt / (Math.SQRT2 * is));
  const vcritz = ZENER_NVT * Math.log(ZENER_NVT / (Math.SQRT2 * ZENER_KNEE));
  const ex = (u: number) => Math.exp(Math.min(u, 80));
  const current = (v: number) => is * Math.expm1(Math.min(v / nVt, 80)) - (vz === undefined ? 0 : ZENER_KNEE * ex(-(v + vz) / ZENER_NVT));
  const slope = (v: number) =>
    (is * ex(v / nVt)) / nVt + (vz === undefined ? 0 : (ZENER_KNEE * ex(-(v + vz) / ZENER_NVT)) / ZENER_NVT);
  // Newton limiting on whichever exponential is in play.
  const limit = (vnew: number, vold: number) => {
    if (vz === undefined || vnew >= 0) return limitJunction(vnew, vold, nVt, vcrit);
    return -limitJunction(-vnew - vz, -vold - vz, ZENER_NVT, vcritz) - vz;
  };
  return { current, slope, limit };
}

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

// Bipolar transistor, Ebers–Moll transport model. Pins: base, collector,
// emitter. `sign` is +1 for NPN, −1 for PNP (every voltage and current flips).
const BJT_IS = 1e-14;
const BJT_BETA_R = 1;

function bjt(sign: 1 | -1): ModelDef<PropsByType['npn']> {
  const vt = THERMAL_VOLTAGE;
  const vcrit = vt * Math.log(vt / (Math.SQRT2 * BJT_IS));
  const ex = (u: number) => Math.exp(Math.min(u / vt, 80));
  // Currents into collector and base (in the NPN frame) and their slopes.
  function solve(vbe: number, vbc: number, beta: number) {
    const ef = ex(vbe);
    const er = ex(vbc);
    const iF = BJT_IS * (ef - 1);
    const iR = BJT_IS * (er - 1);
    const gf = (BJT_IS * ef) / vt;
    const gr = (BJT_IS * er) / vt;
    return {
      ic: iF - iR - iR / BJT_BETA_R,
      ib: iF / beta + iR / BJT_BETA_R,
      dIcBe: gf,
      dIcBc: -gr * (1 + 1 / BJT_BETA_R),
      dIbBe: gf / beta,
      dIbBc: gr / BJT_BETA_R,
    };
  }
  const pinCurrents = (el: Element<PropsByType['npn']>, s: Stamper) => {
    const [b, c, e] = el.nodes;
    const j = solve(sign * (s.v(b) - s.v(e)), sign * (s.v(b) - s.v(c)), el.props.gain);
    const ib = sign * j.ib;
    const ic = sign * j.ic;
    return [ib, ic, -ib - ic];
  };
  return {
    nonlinear: true,
    stamp(el, s) {
      const [b, c, e] = el.nodes;
      const rawBe = sign * (s.v(b) - s.v(e));
      const rawBc = sign * (s.v(b) - s.v(c));
      const vbe = limitJunction(rawBe, el.state.vbe ?? 0, vt, vcrit);
      const vbc = limitJunction(rawBc, el.state.vbc ?? 0, vt, vcrit);
      if (Math.abs(vbe - rawBe) > 1e-6 || Math.abs(vbc - rawBc) > 1e-6) s.converged = false;
      el.state.vbe = vbe;
      el.state.vbc = vbc;
      const j = solve(vbe, vbc, el.props.gain);
      // Linearised: I = dBe·(Vb − Ve) + dBc·(Vb − Vc) + sign·(I0 − dBe·vbe − dBc·vbc).
      const terms = (dBe: number, dBc: number): [number, number][] => [[b, dBe + dBc], [e, -dBe], [c, -dBc]];
      const i0c = sign * (j.ic - j.dIcBe * vbe - j.dIcBc * vbc);
      const i0b = sign * (j.ib - j.dIbBe * vbe - j.dIbBc * vbc);
      s.draw(c, terms(j.dIcBe, j.dIcBc), i0c);
      s.draw(b, terms(j.dIbBe, j.dIbBc), i0b);
      s.draw(e, terms(-j.dIcBe - j.dIbBe, -j.dIcBc - j.dIbBc), -i0c - i0b);
      s.conductance(b, e, 1e-12);
      s.conductance(b, c, 1e-12);
    },
    current: (el, s) => pinCurrents(el, s)[0],
    pinCurrents,
    readout: (r) => {
      const [ib, ic] = r.pins.map((x) => sign * x);
      const vce = sign * (r.pinV[1] - r.pinV[2]);
      const vbe = sign * (r.pinV[0] - r.pinV[2]);
      let region = 'off';
      if (ic > 1e-6) region = vce < 0.2 ? 'saturated' : 'active';
      return [
        ['Collector current', fmt(Math.abs(r.pins[1]), 'A')],
        ['Base current', fmt(Math.abs(r.pins[0]), 'A')],
        ['V CE', fmt(Math.abs(vce), 'V')],
        ['V BE', fmt(Math.abs(vbe), 'V')],
        ['Gain now', ib > 1e-9 ? (ic / ib).toFixed(0) : '–'],
        ['Region', region],
        ['Power', fmt(Math.abs(r.p), 'W')],
      ];
    },
    thermal: {
      load: (r, p) => Math.max(Math.abs(r.p) / p.powerRating, Math.abs(r.pins[1]) / p.maxCurrent),
      tau: 0.5,
      limit: 1.5,
    },
    failure: { label: 'burnt out', open: true },
  };
}

// N-channel enhancement MOSFET, square-law model. Pins: gate, drain, source.
// k comes from the on-resistance at Vgs = 10 V; the channel works either way
// round, so drain and source swap when Vds goes negative.
const MOS_LAMBDA = 0.01; // 1/V, channel-length modulation
const MOS_STEP = 1; // V; largest change per Newton iteration

function mosfet(): ModelDef<PropsByType['nmos']> {
  const k = (p: PropsByType['nmos']) => 1 / (p.onResistance * Math.max(0.1, 10 - p.thresholdVoltage));
  // Drain current for vds ≥ 0 and its slopes.
  function channel(vgs: number, vds: number, p: PropsByType['nmos']) {
    const vov = vgs - p.thresholdVoltage;
    if (vov <= 0) return { id: 0, gm: 0, gds: 0 };
    const kk = k(p);
    const clm = 1 + MOS_LAMBDA * vds;
    if (vds < vov) {
      const id = kk * (vov * vds - (vds * vds) / 2) * clm;
      return { id, gm: kk * vds * clm, gds: kk * (vov - vds) * clm + kk * (vov * vds - (vds * vds) / 2) * MOS_LAMBDA };
    }
    const id = (kk / 2) * vov * vov * clm;
    return { id, gm: kk * vov * clm, gds: (kk / 2) * vov * vov * MOS_LAMBDA };
  }
  const step = (vnew: number, vold: number) =>
    Math.abs(vnew - vold) > MOS_STEP ? vold + Math.sign(vnew - vold) * MOS_STEP : vnew;
  // Which pins act as drain and source right now.
  const orient = (el: Element<PropsByType['nmos']>, v: (n: number) => number) => {
    const [g, d, src] = el.nodes;
    return v(d) >= v(src) ? { g, d, src, flip: false } : { g, d: src, src: d, flip: true };
  };
  const pinCurrents = (el: Element<PropsByType['nmos']>, s: Stamper) => {
    const o = orient(el, s.v);
    const id = channel(s.v(o.g) - s.v(o.src), s.v(o.d) - s.v(o.src), el.props).id;
    return o.flip ? [0, -id, id] : [0, id, -id];
  };
  return {
    nonlinear: true,
    stamp(el, s) {
      const o = orient(el, s.v);
      const rawGs = s.v(o.g) - s.v(o.src);
      const rawDs = s.v(o.d) - s.v(o.src);
      const vgs = step(rawGs, el.state.vgs ?? rawGs);
      const vds = step(rawDs, el.state.vds ?? rawDs);
      if (vgs !== rawGs || vds !== rawDs) s.converged = false;
      el.state.vgs = vgs;
      el.state.vds = vds;
      const c = channel(vgs, vds, el.props);
      // I(d→s) = gm·(Vg − Vs) + gds·(Vd − Vs) + (Id − gm·vgs − gds·vds)
      const i0 = c.id - c.gm * vgs - c.gds * vds;
      s.draw(o.d, [[o.g, c.gm], [o.d, c.gds], [o.src, -c.gm - c.gds]], i0);
      s.draw(o.src, [[o.g, -c.gm], [o.d, -c.gds], [o.src, c.gm + c.gds]], -i0);
      s.conductance(o.d, o.src, 1e-12);
      s.conductance(o.g, o.src, 1e-12);
    },
    current: (el, s) => pinCurrents(el, s)[1],
    pinCurrents,
    readout: (r, p) => {
      const vgs = r.pinV[0] - r.pinV[2];
      const vds = r.pinV[1] - r.pinV[2];
      const vov = vgs - p.thresholdVoltage;
      let region = 'off';
      if (vov > 0) region = Math.abs(vds) < vov ? 'on (linear)' : 'on (saturated)';
      return [
        ['Drain current', fmt(Math.abs(r.pins[1]), 'A')],
        ['V GS', fmt(vgs, 'V')],
        ['V DS', fmt(vds, 'V')],
        ['Region', region],
        ['Power', fmt(Math.abs(r.p), 'W')],
      ];
    },
    thermal: {
      load: (r, p) => Math.max(Math.abs(r.p) / p.powerRating, Math.abs(r.pins[1]) / p.maxCurrent),
      tau: 0.5,
      limit: 1.5,
    },
    failure: { label: 'burnt out', open: true },
  };
}

// Transformer: two coupled inductors. With winding currents i = [i1, i2] and
// voltages v = [v1, v2] (v1 = V(pin 1) − V(pin 2), v2 = V(pin 3) − V(pin 4)):
//   v = R·i + L·di/dt,  L = [[L1, M], [M, L2]],  M = k·√(L1·L2)
// Over a backward-Euler step: v = Z·i − (L/dt)·i_prev with Z = R + L/dt, so
//   i = Y·v + Y·(L/dt)·i_prev,  Y = Z⁻¹.
// L2 = L1 / n² and R2 = R1 / n² for turns ratio n. Only changing current is
// coupled across, so DC on the primary just heats it.
function transformer(): ModelDef<PropsByType['transformer']> {
  type P = PropsByType['transformer'];
  function step(p: P, dt: number, i1: number, i2: number) {
    const l1 = p.inductance;
    const l2 = p.inductance / (p.ratio * p.ratio);
    const m = p.coupling * Math.sqrt(l1 * l2);
    const r1 = p.resistance;
    const r2 = p.resistance / (p.ratio * p.ratio);
    const [z11, z12, z22] = [r1 + l1 / dt, m / dt, r2 + l2 / dt];
    const det = z11 * z22 - z12 * z12;
    const y = { 11: z22 / det, 12: -z12 / det, 22: z11 / det };
    // Y·(L/dt)·i_prev
    const h1 = (l1 * i1 + m * i2) / dt;
    const h2 = (m * i1 + l2 * i2) / dt;
    return { y, c1: y[11] * h1 + y[12] * h2, c2: y[12] * h1 + y[22] * h2 };
  }
  const currents = (el: Element<P>, s: Stamper) => {
    const [a, b, c, d] = el.nodes;
    const t = step(el.props, s.dt, el.state.i1 ?? 0, el.state.i2 ?? 0);
    const v1 = s.v(a) - s.v(b);
    const v2 = s.v(c) - s.v(d);
    return [t.y[11] * v1 + t.y[12] * v2 + t.c1, t.y[12] * v1 + t.y[22] * v2 + t.c2];
  };
  return {
    dynamic: true,
    groups: [[0, 1], [2, 3]],
    stamp(el, s) {
      const [a, b, c, d] = el.nodes;
      const { y, c1, c2 } = step(el.props, s.dt, el.state.i1 ?? 0, el.state.i2 ?? 0);
      // Each winding draws its current in at its first pin and returns it at the second.
      const terms = (g1: number, g2: number): [number, number][] => [[a, g1], [b, -g1], [c, g2], [d, -g2]];
      const neg = (t: [number, number][]) => t.map(([n, g]): [number, number] => [n, -g]);
      const w1 = terms(y[11], y[12]);
      const w2 = terms(y[12], y[22]);
      s.draw(a, w1, c1);
      s.draw(b, neg(w1), -c1);
      s.draw(c, w2, c2);
      s.draw(d, neg(w2), -c2);
    },
    current: (el, s) => currents(el, s)[0],
    pinCurrents(el, s) {
      const [i1, i2] = currents(el, s);
      return [i1, -i1, i2, -i2];
    },
    accept(el, s) {
      [el.state.i1, el.state.i2] = currents(el, s);
    },
    // Secondary voltage and current, for their RMS.
    extras: (r) => [r.pinV[2] - r.pinV[3], r.pins[2]],
    readout: (r, p) => {
      const v2 = r.pinV[2] - r.pinV[3];
      return r.ac
        ? [
            ['Primary', `${fmt(r.vrms, 'V')} rms, ${fmt(r.irms, 'A')}`],
            ['Secondary', `${fmt(r.extraRms[0], 'V')} rms, ${fmt(r.extraRms[1], 'A')}`],
            ['Ratio', p.ratio >= 1 ? `${+p.ratio.toPrecision(3)} : 1` : `1 : ${+(1 / p.ratio).toPrecision(3)}`],
          ]
        : [
            ['Primary', `${fmt(r.v, 'V')}, ${fmt(r.i, 'A')}`],
            ['Secondary', `${fmt(v2, 'V')}, ${fmt(r.pins[2], 'A')}`],
          ];
    },
    // The heavier-loaded winding, against its rating (the primary's is the
    // secondary's divided by the ratio).
    thermal: {
      load: (r, p) => Math.max(Math.abs(r.pins[2]), Math.abs(r.pins[0]) * p.ratio) / p.maxCurrent,
      tau: 2,
      limit: 1.5,
    },
    failure: { label: 'burnt out', open: true },
  };
}

// --- Logic --------------------------------------------------------------------
// Logic parts run on a built-in supply referenced to 0 V. Inputs barely load
// the signal (a weak pull-down: an unconnected input reads 0) and read 1 above
// HIGH_LEVEL of the supply, 0 below LOW_LEVEL, keeping their last level in
// between (hysteresis, so slow or noisy edges don't chatter). Outputs are a
// source of 0 V or the supply behind a small resistance, so they drive real
// loads. A gate reads its inputs after each step and switches for the next,
// a one-step delay that lets latches and ring oscillators behave.
const G_LOGIC_IN = 1e-6; // S (1 MΩ pull-down)
const G_LOGIC_OUT = 1 / 25; // S (25 Ω output)
const LOGIC_SOURCE_MAX = 0.05; // A a logic switch or clock output can give
const HIGH_LEVEL = 0.55;
const LOW_LEVEL = 0.45;

type LogicProps = { supply: number };

// The output pin draws G·(V − target) from its net.
function driveOutput(s: Stamper, node: number, target: number) {
  s.draw(node, [[node, G_LOGIC_OUT]], -G_LOGIC_OUT * target);
}

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

function gate(fn: (a: boolean, b: boolean) => boolean, inputs: 1 | 2 = 2): ModelDef<PropsByType['and']> {
  const outPin = inputs;
  const target = (el: Element<PropsByType['and']>) => (el.state.out ? el.props.supply : 0);
  const outCurrent = (el: Element<PropsByType['and']>, s: Stamper) => G_LOGIC_OUT * (s.v(el.nodes[outPin]) - target(el));
  const level = (v: number, supply: number, was: boolean) => (v > supply * HIGH_LEVEL ? true : v < supply * LOW_LEVEL ? false : was);
  return {
    dynamic: true,
    grounded: true,
    stamp(el, s) {
      for (let k = 0; k < inputs; k++) s.draw(el.nodes[k], [[el.nodes[k], G_LOGIC_IN]], 0);
      driveOutput(s, el.nodes[outPin], target(el));
    },
    current: (el, s) => G_LOGIC_IN * s.v(el.nodes[0]),
    pinCurrents: (el, s) => [...el.nodes.slice(0, inputs).map((n) => G_LOGIC_IN * s.v(n)), outCurrent(el, s)],
    respond(el, _env, r) {
      const ins = r.pinV.slice(0, inputs).map((v, k) => level(v, el.props.supply, el.state.ins?.[k] ?? false));
      el.state.ins = ins;
      const out = fn(ins[0], ins[1] ?? false);
      const changed = out !== (el.state.out ?? false);
      el.state.out = out;
      return changed;
    },
    readout: (r, p) => {
      const ins = r.state.ins ?? [];
      const names = inputs === 2 ? ['A', 'B'] : ['A'];
      return [
        ['Inputs', names.map((n, k) => `${n} ${ins[k] ? 1 : 0}`).join(', ')],
        ['Output', `${r.state.out ? 1 : 0} (${fmt(r.pinV[outPin], 'V')})`],
        ['Output current', fmt(Math.abs(r.pins[outPin]), 'A')],
        ['Supply', fmt(p.supply, 'V')],
      ];
    },
    thermal: { load: (r, p) => Math.abs(r.pins[outPin]) / p.maxCurrent, tau: 0.2, limit: 1.5 },
    failure: { label: 'burnt out', open: true },
  };
}

// --- Chips -------------------------------------------------------------------

// NE555, following the datasheet's block diagram. Pins (index = pin − 1):
// GND, TRIG, OUT, RESET, CTRL, THR, DIS, VCC. A 5k/10k divider holds CTRL at
// ⅔ VCC; the trigger comparator sets the flip-flop when TRIG falls below half
// of CTRL (⅓ VCC), the threshold comparator resets it when THR rises above
// CTRL, and RESET low forces it off. The output sits about 1.7 V below VCC
// when high and near GND when low; the discharge transistor shorts DIS to
// GND while the output is low. Like the gates, it updates one step after its
// inputs.
const T555_ROUT = 10; // Ω
const T555_RDIS = 10; // Ω, discharge transistor on
const T555_HIGH_DROP = 1.7; // V below VCC
const T555_LOW = 0.1; // V above GND
const T555_IQ_R = 3000; // Ω; ~3 mA quiescent at 9 V
const T555_LEAK = 1e-9; // S on the high-impedance inputs

function timer555(): ModelDef<PropsByType['ne555']> {
  const [GND, TRIG, OUT, RESET, CTRL, THR, DIS, VCC] = [0, 1, 2, 3, 4, 5, 6, 7];
  const g = 1 / T555_ROUT;
  // Current into each pin, consistent with stamp().
  function currents(el: Element<PropsByType['ne555']>, v: (pin: number) => number): number[] {
    const i = new Array<number>(8).fill(0);
    const flow = (a: number, b: number, amps: number) => {
      i[a] += amps;
      i[b] -= amps;
    };
    flow(VCC, CTRL, (v(VCC) - v(CTRL)) / 5000);
    flow(CTRL, GND, (v(CTRL) - v(GND)) / 10000);
    flow(VCC, GND, (v(VCC) - v(GND)) / T555_IQ_R);
    for (const k of [TRIG, THR, RESET]) flow(k, GND, T555_LEAK * (v(k) - v(GND)));
    flow(DIS, GND, (el.state.out ? T555_LEAK : 1 / T555_RDIS) * (v(DIS) - v(GND)));
    if (el.state.out) flow(VCC, OUT, g * (v(VCC) - T555_HIGH_DROP - v(OUT)));
    else flow(OUT, GND, g * (v(OUT) - v(GND) - T555_LOW));
    return i;
  }
  return {
    dynamic: true,
    stamp(el, s) {
      const n = el.nodes;
      s.conductance(n[VCC], n[CTRL], 1 / 5000);
      s.conductance(n[CTRL], n[GND], 1 / 10000);
      s.conductance(n[VCC], n[GND], 1 / T555_IQ_R);
      for (const k of [TRIG, THR, RESET]) s.conductance(n[k], n[GND], T555_LEAK);
      s.conductance(n[DIS], n[GND], el.state.out ? T555_LEAK : 1 / T555_RDIS);
      if (el.state.out) {
        // OUT pulled toward VCC − drop, fed from VCC.
        s.draw(n[OUT], [[n[OUT], g], [n[VCC], -g]], g * T555_HIGH_DROP);
        s.draw(n[VCC], [[n[OUT], -g], [n[VCC], g]], -g * T555_HIGH_DROP);
      } else {
        // OUT pulled toward GND + a little, sinking into GND.
        s.draw(n[OUT], [[n[OUT], g], [n[GND], -g]], -g * T555_LOW);
        s.draw(n[GND], [[n[OUT], -g], [n[GND], g]], g * T555_LOW);
      }
    },
    current: (el, s) => currents(el, (k) => s.v(el.nodes[k]))[GND],
    pinCurrents: (el, s) => currents(el, (k) => s.v(el.nodes[k])),
    respond(el, env, r) {
      const v = (k: number) => r.pinV[k] - r.pinV[GND];
      let q = el.state.out ?? false;
      if (v(RESET) < 0.7) q = false;
      else if (v(TRIG) < v(CTRL) / 2) q = true;
      else if (v(THR) > v(CTRL)) q = false;
      const changed = q !== (el.state.out ?? false);
      if (changed && q) {
        if (el.state.edgeAt !== undefined) el.state.period = env.time - el.state.edgeAt;
        el.state.edgeAt = env.time;
      }
      el.state.out = q;
      return changed;
    },
    readout: (r) => {
      const v = (k: number) => r.pinV[k] - r.pinV[GND];
      const lines: Lines = [
        ['Output', `${r.state.out ? 'high' : 'low'} (${fmt(v(OUT), 'V')})`],
        ['Supply', fmt(v(VCC), 'V')],
        ['Thresholds', `${fmt(v(CTRL) / 2, 'V')} / ${fmt(v(CTRL), 'V')}`],
        ['Output current', fmt(Math.abs(r.pins[OUT]), 'A')],
      ];
      if (r.state.period) lines.push(['Frequency', fmt(1 / r.state.period, 'Hz')]);
      return lines;
    },
    // Output current against its rating, or a supply beyond its maximum
    // (catastrophic: stress climbs steeply past it).
    thermal: {
      load: (r, p) => Math.max(Math.abs(r.pins[OUT]) / p.maxCurrent, ((r.pinV[VCC] - r.pinV[GND]) / p.maxSupply) ** 4),
      tau: 0.3,
      limit: 1.5,
    },
    failure: { label: 'destroyed', open: true },
  };
}

// 78xx linear regulator. Pins: IN, GND, OUT. OUT is held at the set voltage
// above GND while IN is at least `dropout` higher; below that it follows IN
// minus the dropout. Which of the two it is in is decided from the previous
// Newton iteration (a piecewise-linear part). The current it delivers comes
// in at IN, so it dissipates (V_IN − V_OUT) × I.
const REG_G = 100; // S; output stiffness (0.01 Ω)

function regulator(): ModelDef<PropsByType['regulator']> {
  const [IN, GND, OUT] = [0, 1, 2];
  type P = PropsByType['regulator'];
  const mode = (p: P, vin: number, vgnd: number) => (vin - vgnd - p.dropout >= p.outputVoltage ? 'regulating' : 'dropout');
  // Current delivered out of OUT, given the pin voltages and the mode.
  const delivered = (p: P, m: string, vin: number, vgnd: number, vout: number) =>
    REG_G * ((m === 'regulating' ? vgnd + p.outputVoltage : vin - p.dropout) - vout);
  const currents = (el: Element<P>, v: (k: number) => number) => {
    const m = el.state.mode ?? mode(el.props, v(IN), v(GND));
    const i = delivered(el.props, m, v(IN), v(GND), v(OUT));
    return [i, 0, -i];
  };
  return {
    nonlinear: true,
    stamp(el, s) {
      const [nIn, nGnd, nOut] = el.nodes;
      const m = mode(el.props, s.v(nIn), s.v(nGnd));
      if (el.state.mode !== undefined && m !== el.state.mode) s.converged = false;
      el.state.mode = m;
      const g = REG_G;
      if (m === 'regulating') {
        // I = g·(Vgnd + Vset − Vout): drawn out of OUT, drawn into IN.
        s.draw(nOut, [[nOut, g], [nGnd, -g]], -g * el.props.outputVoltage);
        s.draw(nIn, [[nGnd, g], [nOut, -g]], g * el.props.outputVoltage);
      } else {
        // I = g·(Vin − drop − Vout)
        s.draw(nOut, [[nOut, g], [nIn, -g]], g * el.props.dropout);
        s.draw(nIn, [[nIn, g], [nOut, -g]], -g * el.props.dropout);
      }
      s.conductance(nIn, nGnd, 1e-9);
      s.conductance(nOut, nGnd, 1e-9);
    },
    current: (el, s) => currents(el, (k) => s.v(el.nodes[k]))[IN],
    pinCurrents: (el, s) => currents(el, (k) => s.v(el.nodes[k])),
    readout: (r) => [
      ['Input', fmt(r.pinV[IN] - r.pinV[GND], 'V')],
      ['Output', fmt(r.pinV[OUT] - r.pinV[GND], 'V')],
      ['State', r.state.mode === 'dropout' ? 'dropout (input too low)' : 'regulating'],
      ['Current', fmt(Math.abs(r.pins[OUT]), 'A')],
      ['Power', fmt(Math.abs(r.p), 'W')],
    ],
    thermal: { load: (r, p) => Math.max(Math.abs(r.pins[OUT]) / p.maxCurrent, Math.abs(r.p) / p.powerRating), tau: 3, limit: 1.5 },
    failure: { label: 'burnt out', open: true },
  };
}

// Edge-triggered flip-flop. Pins: the named inputs (one of them the clock C),
// then S, R, Q, Q̄. On each rising edge of C, Q becomes next(Q, inputs);
// S and R act at once, whatever the clock (R wins if both are high). Inputs
// and outputs are logic pins like a gate's, and it also updates one step after
// its inputs, so chained flip-flops (counters, dividers) ripple correctly.
function flipFlop(
  inputs: string[],
  next: (q: boolean, ins: Record<string, boolean>) => boolean,
): ModelDef<PropsByType['dff']> {
  const n = inputs.length;
  const [S, R, Q, QN] = [n, n + 1, n + 2, n + 3];
  const clock = inputs.indexOf('C');
  const levelOf = (v: number, supply: number, was: boolean) => (v > supply * HIGH_LEVEL ? true : v < supply * LOW_LEVEL ? false : was);
  const q = (el: Element<PropsByType['dff']>) => el.state.out ?? false;
  const outCurrent = (el: Element<PropsByType['dff']>, s: Stamper, pin: number, high: boolean) =>
    G_LOGIC_OUT * (s.v(el.nodes[pin]) - (high ? el.props.supply : 0));
  return {
    dynamic: true,
    grounded: true,
    stamp(el, s) {
      for (let k = 0; k <= R; k++) s.draw(el.nodes[k], [[el.nodes[k], G_LOGIC_IN]], 0);
      driveOutput(s, el.nodes[Q], q(el) ? el.props.supply : 0);
      driveOutput(s, el.nodes[QN], q(el) ? 0 : el.props.supply);
    },
    current: (el, s) => G_LOGIC_IN * s.v(el.nodes[0]),
    pinCurrents: (el, s) => [
      ...el.nodes.slice(0, R + 1).map((node) => G_LOGIC_IN * s.v(node)),
      outCurrent(el, s, Q, q(el)),
      outCurrent(el, s, QN, !q(el)),
    ],
    respond(el, _env, r) {
      // The first look only records the input levels: a clock that is already
      // high at power-up is not an edge.
      const first = el.state.ins === undefined;
      const was = el.state.ins ?? [];
      const ins = r.pinV.slice(0, R + 1).map((v, k) => levelOf(v, el.props.supply, was[k] ?? false));
      el.state.ins = ins;
      let out = q(el);
      if (ins[R]) out = false;
      else if (ins[S]) out = true;
      else if (!first && ins[clock] && !(was[clock] ?? false)) {
        el.state.edges = (el.state.edges ?? 0) + 1;
        out = next(out, Object.fromEntries(inputs.map((name, k) => [name, ins[k]])));
      }
      const changed = out !== q(el);
      el.state.out = out;
      return changed;
    },
    readout: (r) => {
      const ins = r.state.ins ?? [];
      return [
        ['Q', `${r.state.out ? 1 : 0} (Q̄ ${r.state.out ? 0 : 1})`],
        ['Inputs', inputs.map((name, k) => `${name} ${ins[k] ? 1 : 0}`).join(', ')],
        ['S / R', `${ins[S] ? 1 : 0} / ${ins[R] ? 1 : 0}`],
        ['Clock edges', String(r.state.edges ?? 0)],
      ];
    },
    thermal: {
      load: (r, p) => Math.max(Math.abs(r.pins[Q]), Math.abs(r.pins[QN])) / p.maxCurrent,
      tau: 0.2,
      limit: 1.5,
    },
    failure: { label: 'burnt out', open: true },
  };
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

// Open-circuit voltage of a battery as a fraction of its rating, by state of
// charge: a gentle sag over most of its life, then a steep fall near empty,
// roughly like an alkaline cell.
const batteryCurve = (charge: number) => (charge >= 0.1 ? 0.75 + 0.25 * charge : 7.75 * charge);

const pct = (x: number) => `${Math.round(x * 100)} %`;

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
  // Its voltage follows its state of charge, which falls as it delivers
  // current: capacity is in amp-hours.
  battery: {
    ...source((p) => p.voltage * batteryCurve(p.charge)),
    // Current out of the + terminal, power delivered to the circuit.
    readout: (r, p) => [
      ...((r.ac
        ? [
            ['Voltage', fmt(r.v, 'V')],
            ['Current', `${fmt(r.irms, 'A')} rms`],
            ['Power', `${fmt(-r.pavg, 'W')} avg`],
          ]
        : [
            ['Voltage', fmt(r.v, 'V')],
            ['Current', fmt(-r.i, 'A')],
            ['Power', fmt(-r.p, 'W')],
          ]) as Lines),
      ['Charge', p.charge > 0 ? pct(p.charge) : 'flat'],
    ],
    level: (_, p) => p.charge,
    drain(el, r, dt) {
      const out = -r.i; // current delivered from the + terminal
      if (out <= 1e-6 || el.props.charge <= 0) return false;
      el.props.charge = Math.max(0, el.props.charge - (out * dt) / (el.props.capacity * 3600));
      return true;
    },
    thermal: sourceThermal,
    failure: { label: 'damaged', open: true },
  },

  // v(t) = Vrms·√2·sin(2πft + φ). Steps must stay well inside one period.
  generator: {
    ...source((p, t) => p.voltage * Math.SQRT2 * Math.sin(2 * Math.PI * p.frequency * t + (p.phase * Math.PI) / 180)),
    dynamic: true,
    alternating: true,
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

  // Stressed by voltage beyond its rating, either way round.
  capacitor: capacitor((v, p) => Math.abs(v) / p.ratedVoltage),

  // Also stressed by reverse voltage: past about a volt the wrong way it
  // heats up and blows.
  electrolytic: capacitor((v, p) => (v >= 0 ? v / p.ratedVoltage : -v / REVERSE_TOLERANCE)),

  // v = R·i + L·di/dt. Over a step: i = g·v + g·(L/dt)·i_prev with
  // g = 1/(R + L/dt), so its current carries on from the previous step.
  inductor: {
    dynamic: true,
    stamp(el, s) {
      const k = el.props.inductance / s.dt;
      const g = 1 / (el.props.resistance + k);
      s.conductance(el.nodes[0], el.nodes[1], g);
      s.current(el.nodes[0], el.nodes[1], g * k * (el.state.i ?? 0));
    },
    current(el, s) {
      const k = el.props.inductance / s.dt;
      const g = 1 / (el.props.resistance + k);
      return g * (s.v(el.nodes[0]) - s.v(el.nodes[1])) + g * k * (el.state.i ?? 0);
    },
    accept(el, s) {
      el.state.i = this.current(el, s);
    },
    readout: (r, p) => [...basicReadout(r), ['Energy', fmt(0.5 * p.inductance * r.i * r.i, 'J')]],
    thermal: { load: (r, p) => Math.abs(r.i) / p.maxCurrent, tau: 1, limit: 1.5 },
    failure: { label: 'burnt out', open: true },
  },

  // Two resistors sharing the wiper: track pin 0 → wiper → pin 1.
  potentiometer: {
    stamp(el, s) {
      const [a, b, w] = el.nodes;
      const [r1, r2] = halves(el.props);
      s.conductance(a, w, 1 / r1);
      s.conductance(w, b, 1 / r2);
    },
    current(el, s) {
      return this.pinCurrents!(el, s)[0];
    },
    pinCurrents(el, s) {
      const [a, b, w] = el.nodes;
      const [r1, r2] = halves(el.props);
      const ia = (s.v(a) - s.v(w)) / r1;
      const ib = (s.v(b) - s.v(w)) / r2;
      return [ia, ib, -ia - ib];
    },
    power(el, s) {
      const [ia, ib] = this.pinCurrents!(el, s);
      const [r1, r2] = halves(el.props);
      return ia * ia * r1 + ib * ib * r2;
    },
    readout: (r, p) => [
      ['Track voltage', fmt(Math.abs(r.v), 'V')],
      ['Wiper voltage', `${fmt(r.pinV[2] - r.pinV[1], 'V')} (to pin 2 end)`],
      ['Wiper current', fmt(Math.abs(r.pins[2]), 'A')],
      ['Power', fmt(Math.abs(r.p), 'W')],
      ['Position', pct(p.position / 100)],
    ],
    thermal: powerThermal(2, 2),
    failure: { label: 'burnt out', open: true },
  },

  rheostat: {
    ...ohmic(
      (p) => Math.max(R_MIN, (p.resistance * p.position) / 100),
      (r, p) => [...basicReadout(r), ['Resistance', fmt(Math.max(R_MIN, (p.resistance * p.position) / 100), 'Ω')]],
    ),
    thermal: powerThermal(2, 2),
    failure: { label: 'burnt out', open: true },
  },

  // Follows the light falling on it, ambient plus nearby lamps and LEDs.
  ldr: {
    ...ohmic(
      (p, el) => ldrResistance(p, el.state.light ?? p.ambient / 100),
      (r, p) => [
        ...basicReadout(r),
        ['Light', pct(Math.min(1, r.state.light ?? 0))],
        ['Resistance', fmt(ldrResistance(p, r.state.light ?? 0), 'Ω')],
      ],
    ),
    dynamic: true,
    respond(el, env, _r, dt) {
      const target = el.props.ambient / 100 + env.light(el);
      const now = el.state.light ?? target;
      el.state.light = dt === null ? target : target + (now - target) * Math.exp(-dt / LDR_TAU);
      return Math.abs(el.state.light - now) > 1e-4;
    },
    thermal: powerThermal(1, 2),
    failure: { label: 'burnt out', open: true },
  },

  // Warms above ambient by the power it dissipates, over a few seconds.
  ntc: {
    ...ohmic(
      (p, el) => ntcResistance(p, el.state.rise ?? 0),
      (r, p) => [
        ...basicReadout(r),
        ['Temperature', `${(p.ambient + (r.state.rise ?? 0)).toFixed(1)} °C`],
        ['Resistance', fmt(ntcResistance(p, r.state.rise ?? 0), 'Ω')],
      ],
    ),
    dynamic: true,
    respond(el, _env, r, dt) {
      if (dt === null) return; // temperature only changes with time
      const target = Math.min(NTC_MAX_RISE, Math.abs(r.p) * NTC_RTH);
      const now = el.state.rise ?? 0;
      el.state.rise = target + (now - target) * Math.exp(-dt / NTC_TAU);
    },
    thermal: powerThermal(2, 2),
    failure: { label: 'burnt out', open: true },
  },

  transformer: transformer(),

  // Holds its net at 0 V; all grounds are one node through 0 V.
  ground: {
    groundTie: true,
    stamp(el, s) {
      s.draw(el.nodes[0], [[el.nodes[0], G_GROUND]], 0);
    },
    current: (el, s) => G_GROUND * s.v(el.nodes[0]),
    pinCurrents: (el, s) => [G_GROUND * s.v(el.nodes[0])],
    readout: (r) => [['Current to ground', fmt(Math.abs(r.pins[0]), 'A')]],
  },

  and: gate((a, b) => a && b),
  or: gate((a, b) => a || b),
  not: gate((a) => !a, 1),
  nand: gate((a, b) => !(a && b)),
  nor: gate((a, b) => !(a || b)),
  xor: gate((a, b) => a !== b),
  xnor: gate((a, b) => a === b),

  // On a rising clock edge: D copies D; JK sets, resets, toggles or holds;
  // T toggles when T is 1.
  dff: flipFlop(['D', 'C'], (_q, i) => i.D),
  jkff: flipFlop(['J', 'C', 'K'], (q, i) => (i.J && i.K ? !q : i.J ? true : i.K ? false : q)),
  tff: flipFlop(['T', 'C'], (q, i) => (i.T ? !q : q)),

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

  // A logic input only: barely loads the signal.
  ne555: timer555(),
  regulator: regulator(),

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

  // Meters show DC signed (negative with the leads reversed), or the RMS
  // value marked ~ when an AC source drives the circuit.
  voltmeter: {
    ...ohmic((p) => p.resistance, (r) => [['Reading', meterReading(r, 'V')]]),
    reading: (r) => meterReading(r, 'V'),
    // Past its rating the input is destroyed almost at once.
    thermal: { load: (r, p) => Math.abs(r.v) / p.maxVoltage, tau: 0.05, limit: 1.2 },
    failure: { label: 'destroyed', open: true, display: 'ERR' },
  },
  ammeter: {
    ...ohmic((p) => p.resistance, (r) => [['Reading', meterReading(r, 'A')]]),
    reading: (r) => meterReading(r, 'A'),
    // Its internal fuse.
    thermal: { load: (r, p) => Math.abs(r.i) / p.maxCurrent, tau: 0.05, limit: 1.5 },
    failure: { label: 'fuse blown', open: true, display: 'FUSE' },
  },

  // Nearly a wire until it carries well over its rating, then it blows fast.
  fuse: {
    ...ohmic(() => R_FUSE),
    thermal: { load: (r, p) => Math.abs(r.i) / p.ratedCurrent, tau: 0.1, limit: 1.5 },
    failure: { label: 'blown', open: true },
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

  // Conducts until pressed; overloaded contacts weld shut.
  buttonNC: {
    ...ohmic((p, el) => (p.pressed && !el.broken ? Infinity : R_SWITCH_ON)),
    thermal: { load: (r, p) => Math.abs(r.i) / p.maxCurrent, tau: 0.2, limit: 1.5 },
    failure: { label: 'contacts welded', open: false },
  },

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

  npn: bjt(1),
  pnp: bjt(-1),
  nmos: mosfet(),

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
