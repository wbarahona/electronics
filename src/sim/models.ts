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
//                   when not all are (a transformer's isolated windings, a
//                   relay's coil and contacts); may depend on the props
//   active(r)       whether the part is switched on by itself (an energized
//                   relay), which its symbol shows
//   segments(r, props)  light output of each segment of a display, 0..1
//   needle(r, props) where a panel meter's needle points, 0..1 of full scale
//   sound(r, props) the tone a sounder makes now: { frequency, wave, level }
//                   with level 0..1, or null when silent
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

import { contactorPoles, relayContacts, relayPins } from '../components.ts';
import type { MeterMode, PartType, Props, PropsByType } from '../types.ts';
import { formatSI } from '../units.ts';

// A solved part. v, i, p are instantaneous (v and i between pins 0 and 1;
// `pins` has the current into the part at every pin, `pinV` each pin's
// voltage against the circuit's reference); vavg, iavg, vrms, irms, pavg
// are running averages; `ac` is set when an AC source drives the circuit, in
// which case readouts show RMS and average values.
export interface Result {
  v: number;
  i: number;
  p: number;
  vavg: number;
  iavg: number;
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
  ins?: boolean[]; // a logic part's input levels and output(s)
  outs?: boolean[];
  count?: number; // a counter's count; a decoder's latched value
  needle?: number; // a panel meter's needle, 0..1 of full scale
  out?: boolean;
  edges?: number; // rising clock edges a flip-flop has seen
  edgeAt?: number; // a 555's last rising edge (s) and the period it measured
  period?: number;
  mode?: 'regulating' | 'dropout'; // a regulator's region at the last iteration
  vbe?: number; // transistor junction voltages at the last iteration
  vbc?: number;
  vgs?: number;
  vds?: number;
  segV?: number[]; // a display's segment junction voltages at the last iteration
  energized?: boolean; // a relay's coil has pulled in; a sounder is sounding
  speed?: number; // a motor's speed, 1 = rated (negative: turning backwards)
  temp?: number; // a heater's element temperature, 1 = at rated power
  crossAt?: number; // a speaker's last upward zero crossing (s), the period
  span?: number; //   it measured, and its signal (AC part) at the last step
  last?: number;
  struck?: boolean; // a fluorescent tube's arc is lit; its filaments' warmth
  filament?: number; //   0..1 and the arc current, smoothed (A)
  arc?: number;
  glow?: number; // a starter's smoothed voltage (V) and whether it's glowing
  glowing?: boolean;
  windings?: number[]; // a motor's winding currents at the end of the last step
  broken?: boolean;
  avg?: { v: [number, number]; i: [number, number]; v2: [number, number]; i2: [number, number]; p: number; x2: number[] };
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

// A tone for the speakers.
export interface Sound {
  frequency: number;
  wave: OscillatorType;
  level: number;
}

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
  groups?: number[][] | ((p: P) => number[][]);
  active?(r: Result): boolean;
  segments?(r: Result, p: P): number[];
  sound?(r: Result, p: P): Sound | null;
  needle?(r: Result, p: P): number;
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
const G_SCOPE = 1e-7; // S; a 10 MΩ probe input
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

// DC: the average, signed (negative with the leads reversed), so a sine reads
// 0. AC: the true RMS of what's left once the average is taken out, so a
// battery reads 0 and a rectifier's output reads just its ripple. Like a
// meter on the range for the whole signal, either part reads 0 when it's
// under 0.5 % of the signal's RMS.
const METER_RESOLUTION = 0.005;

const meterValue = (r: Result, p: { mode: MeterMode }, unit: 'V' | 'A') => {
  const [avg, rms] = unit === 'V' ? [r.vavg, r.vrms] : [r.iavg, r.irms];
  const floor = METER_RESOLUTION * rms;
  if (p.mode === 'DC') return Math.abs(avg) < floor ? 0 : avg;
  const ac = Math.sqrt(Math.max(0, rms * rms - avg * avg));
  return ac < floor ? 0 : ac;
};
const meterReading = (r: Result, p: { mode: MeterMode }, unit: 'V' | 'A') => fmt(meterValue(r, p, unit), unit);

// A filament is too slow to follow AC, so it shines by average power.
const lampLight = (r: Result, p: { ratedPower: number }) => Math.abs(r.ac ? r.pavg : r.p) / p.ratedPower;

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

// --- Rails -------------------------------------------------------------------

// A supply rail holds its net at `volts` against the board's 0 V through a
// tiny resistance, as Ground holds its net at 0 V. Its return is 0 V itself,
// so a circuit fed by rails needs a Ground for current to come back.
const G_RAIL = 1e6;

function rail<P extends { maxCurrent: number }>(
  volts: (p: P, t: number) => number,
): Pick<ModelDef<P>, 'grounded' | 'stamp' | 'current' | 'pinCurrents' | 'thermal' | 'failure'> {
  // Current supplied into the net.
  const out = (el: Element<P>, s: Stamper) => G_RAIL * (volts(el.props, s.t) - s.v(el.nodes[0]));
  return {
    grounded: true,
    stamp(el, s) {
      s.draw(el.nodes[0], [[el.nodes[0], G_RAIL]], -G_RAIL * volts(el.props, s.t));
    },
    current: out,
    pinCurrents: (el, s) => [-out(el, s)],
    // Its breaker trips on a sustained overload.
    thermal: { load: (r, p) => Math.abs(r.i) / p.maxCurrent, tau: 0.1, limit: 1.5 },
    failure: { label: 'tripped', open: true },
  };
}

// --- LED groups: seven-segment display, RGB LED ------------------------------

// Several LEDs between their own pins (0 .. n−1) and one common pin (n):
// anodes on their own pins for common cathode, the other way round for
// common anode. Each is linearised like the single LED, with its own forward
// voltage (`fv`) and the shared max current. `names` label them in readouts.
type LedGroupProps = { common: 'cathode' | 'anode'; maxCurrent: number };

function ledGroup<P extends LedGroupProps>(names: string[], fv: (p: P, k: number) => number): ModelDef<P> {
  const n = names.length;
  const junction = (p: P, k: number) => diode({ forwardVoltage: fv(p, k), maxCurrent: p.maxCurrent });
  // An LED's anode and cathode nodes.
  const ends = (el: Element<P>, k: number) => (el.props.common === 'cathode' ? [el.nodes[k], el.nodes[n]] : [el.nodes[n], el.nodes[k]]);
  const forward = (el: Element<P>, s: Stamper) =>
    names.map((_, k) => {
      const [a, c] = ends(el, k);
      return junction(el.props, k).current(s.v(a) - s.v(c));
    });
  // Forward current of each LED, from the current into its pin.
  const currents = (r: Result, p: P) => r.pins.slice(0, n).map((i) => Math.max(0, p.common === 'cathode' ? i : -i));
  const segments = (r: Result, p: P) => currents(r, p).map((i) => i / p.maxCurrent);
  return {
    nonlinear: true,
    stamp(el, s) {
      const segV = (el.state.segV ??= Array(n).fill(0));
      for (let k = 0; k < n; k++) {
        const [a, c] = ends(el, k);
        stampJunction(s, segV, k, a, c, junction(el.props, k));
      }
    },
    current: (el, s) => forward(el, s).reduce((sum, i) => sum + i, 0),
    pinCurrents(el, s) {
      const i = forward(el, s);
      const sign = el.props.common === 'cathode' ? 1 : -1;
      return [...i.map((x) => sign * x), -sign * i.reduce((sum, x) => sum + x, 0)];
    },
    segments,
    brightness: (r, p) => Math.max(0, ...segments(r, p)),
    readout: (r, p) => {
      const lit = currents(r, p).flatMap((i, k) => (i > p.maxCurrent * 0.01 ? [names[k]] : []));
      return [
        ['Lit', lit.join(' ') || 'none'],
        ['Current', fmt(currents(r, p).reduce((sum, i) => sum + i, 0), 'A')],
      ];
    },
    thermal: { load: (r, p) => Math.max(0, ...currents(r, p)) / p.maxCurrent, tau: 0.05, limit: 1.5 },
    failure: { label: 'burnt out', open: true },
  };
}

// --- Linearised junctions ----------------------------------------------------

// Stamp a junction (diode(): an LED-style fit) from node a to c, keeping its
// operating point in `vs[k]` between iterations.
function stampJunction(s: Stamper, vs: number[], k: number, a: number, c: number, d: ReturnType<typeof diode>) {
  const v = s.v(a) - s.v(c);
  const vd = limitJunction(v, vs[k] ?? 0, d.nVt, d.vcrit);
  if (Math.abs(vd - v) > 1e-6) s.converged = false;
  vs[k] = vd;
  const gd = (d.is * Math.exp(Math.min(vd / d.nVt, 80))) / d.nVt;
  s.conductance(a, c, gd);
  s.current(a, c, d.current(vd) - gd * vd);
}

// --- Bi-colour LED ------------------------------------------------------------

// Red from pin 0 to 1, green from 1 to 0.
const bicolorModel: ModelDef<PropsByType['bicolorLed']> = (() => {
  const red = (p: PropsByType['bicolorLed']) => diode({ forwardVoltage: p.redVoltage, maxCurrent: p.maxCurrent });
  const green = (p: PropsByType['bicolorLed']) => diode({ forwardVoltage: p.greenVoltage, maxCurrent: p.maxCurrent });
  const both = (el: Element<PropsByType['bicolorLed']>, s: Stamper) => {
    const v = s.v(el.nodes[0]) - s.v(el.nodes[1]);
    return [red(el.props).current(v), green(el.props).current(-v)];
  };
  const segments = (r: Result, p: PropsByType['bicolorLed']) => [Math.max(0, r.i), Math.max(0, -r.i)].map((i) => i / p.maxCurrent);
  return {
    nonlinear: true,
    stamp(el, s) {
      const vs = (el.state.segV ??= [0, 0]);
      stampJunction(s, vs, 0, el.nodes[0], el.nodes[1], red(el.props));
      stampJunction(s, vs, 1, el.nodes[1], el.nodes[0], green(el.props));
    },
    current(el, s) {
      const [r, g] = both(el, s);
      return r - g;
    },
    segments,
    brightness: (r, p) => Math.max(...segments(r, p)),
    readout: (r) => [
      ...basicReadout(r),
      ['Lit', r.i > 1e-4 ? 'red' : r.i < -1e-4 ? 'green' : r.ac && r.irms > 1e-4 ? 'red and green (alternating)' : 'none'],
    ],
    thermal: { load: (r, p) => Math.abs(r.i) / p.maxCurrent, tau: 0.05, limit: 1.5 },
    failure: { label: 'burnt out', open: true },
  };
})();

// --- Lamps on a common pin: stack light ---------------------------------------

// Lamps (V²/P at their rating) from pins 0 .. n−1 to the common pin n, each
// shining by its own average power.
function lampGroup<P extends { ratedVoltage: number; ratedPower: number }>(names: string[]): ModelDef<P> {
  const n = names.length;
  const r = (p: P) => p.ratedVoltage ** 2 / p.ratedPower;
  const currents = (el: Element<P>, s: Stamper) => names.map((_, k) => (s.v(el.nodes[k]) - s.v(el.nodes[n])) / r(el.props));
  // Each lamp's power as a fraction of its rating (RMS current on AC).
  const levels = (res: Result, p: P) =>
    names.map((_, k) => ((res.ac ? res.extraRms[k] ?? 0 : Math.abs(res.pins[k])) ** 2 * r(p)) / p.ratedPower);
  return {
    stamp(el, s) {
      for (let k = 0; k < n; k++) s.conductance(el.nodes[k], el.nodes[n], 1 / r(el.props));
    },
    current: (el, s) => currents(el, s).reduce((sum, i) => sum + i, 0),
    pinCurrents(el, s) {
      const i = currents(el, s);
      return [...i, -i.reduce((sum, x) => sum + x, 0)];
    },
    extras: (res) => res.pins.slice(0, n),
    segments: levels,
    brightness: (res, p) => Math.max(...levels(res, p)),
    readout: (res, p) => [['Lit', levels(res, p).flatMap((l, k) => (l > 0.05 ? [names[k]] : [])).join(', ') || 'none']],
    thermal: { load: (res, p) => Math.max(...levels(res, p)), tau: 0.3, limit: 1.5 },
    failure: { label: 'filament blown', open: true },
  };
}

// --- Panel meter --------------------------------------------------------------

// The needle follows the DC (average) or AC (RMS) voltage across it as a
// fraction of full scale, with the damping of a real movement, and pegs a
// little past either end.
const NEEDLE_TAU = 0.25; // s

const panelMeterModel: ModelDef<PropsByType['panelMeter']> = {
  ...ohmic((p) => p.resistance, (r, p) => [['Reading', `${meterReading(r, p, 'V')} ${p.mode}`], ['Full scale', fmt(p.fullScale, 'V')]]),
  respond(el, _env, r, dt) {
    const target = Math.min(1.05, Math.max(-0.05, meterValue(r, el.props, 'V') / el.props.fullScale));
    const now = el.state.needle ?? 0;
    el.state.needle = dt === null ? target : now + (target - now) * (1 - Math.exp(-dt / NEEDLE_TAU));
    return false;
  },
  needle: (r) => r.state.needle ?? 0,
  // A movement survives some overload, not a sustained several times full scale.
  thermal: { load: (r, p) => Math.abs(r.v) / (2 * p.fullScale), tau: 0.5, limit: 1.5 },
  failure: { label: 'movement burnt out', open: true },
};

// --- CMOS logic chips -----------------------------------------------------------

// CD4000-series logic with its own supply pins: inputs read high above 55 %
// of the supply and low below 45 % (holding their last level in between),
// barely loading; each output is a switch to VDD or VSS through `rOut`, so
// what it sources or sinks really comes from the supply. `logic` turns the
// input levels (and the part's state) into the output levels. The first
// response after a rebuild only records the inputs, so a clock edge isn't
// seen at power-up.
function cmos<P extends { maxCurrent: number }>(pins: {
  vdd: number;
  vss: number;
  inputs: number[];
  outputs: number[];
  rOut: number;
  logic: (state: PartState, ins: boolean[], was: boolean[] | undefined) => boolean[];
  readout: (state: PartState) => Lines;
}): ModelDef<P> {
  const { vdd, vss, inputs, outputs, rOut } = pins;
  const g = 1 / rOut;
  function currents(el: Element<P>, v: (pin: number) => number): number[] {
    const i = el.nodes.map(() => 0);
    const flow = (a: number, b: number, amps: number) => {
      i[a] += amps;
      i[b] -= amps;
    };
    for (const k of inputs) flow(k, vss, G_LOGIC_IN * (v(k) - v(vss)));
    outputs.forEach((k, o) => {
      const to = el.state.outs?.[o] ? vdd : vss;
      flow(k, to, g * (v(k) - v(to)));
    });
    return i;
  }
  return {
    dynamic: true,
    stamp(el, s) {
      for (const k of inputs) s.conductance(el.nodes[k], el.nodes[vss], G_LOGIC_IN);
      outputs.forEach((k, o) => s.conductance(el.nodes[k], el.nodes[el.state.outs?.[o] ? vdd : vss], g));
    },
    current: (el, s) => currents(el, (k) => s.v(el.nodes[k]))[vdd],
    pinCurrents: (el, s) => currents(el, (k) => s.v(el.nodes[k])),
    respond(el, _env, r) {
      const supply = r.pinV[vdd] - r.pinV[vss];
      const was = el.state.ins;
      const ins = inputs.map((k, n) => {
        const v = r.pinV[k] - r.pinV[vss];
        return v > supply * HIGH_LEVEL ? true : v < supply * LOW_LEVEL ? false : (was?.[n] ?? false);
      });
      el.state.ins = ins;
      const outs = supply > 1 ? pins.logic(el.state, ins, was) : outputs.map(() => false);
      const changed = outs.some((o, k) => o !== (el.state.outs?.[k] ?? false));
      el.state.outs = outs;
      return changed;
    },
    readout: (r) => [...pins.readout(r.state), ['Supply', fmt(r.pinV[vdd] - r.pinV[vss], 'V')]],
    thermal: {
      load: (r, p) => Math.max(...outputs.map((k) => Math.abs(r.pins[k]))) / p.maxCurrent,
      tau: 0.2,
      limit: 1.5,
    },
    failure: { label: 'burnt out', open: true },
  };
}

// CD4511 segments a–g for 0–9 (6 and 9 without tails); anything above 9 blanks.
const BCD_SEGMENTS = ['1111110', '0110000', '1101101', '1111001', '0110011', '1011011', '0011111', '1110000', '1111111', '1110011'];

// Pins (index = pin − 1): inputs A, B, C, D, L̄T̄, B̄L̄, LE; outputs a–g.
const cd4511Model = cmos<PropsByType['cd4511']>({
  vdd: 15,
  vss: 7,
  inputs: [6, 0, 1, 5, 2, 3, 4],
  outputs: [12, 11, 10, 9, 8, 14, 13],
  rOut: 100,
  logic(state, [a, b, c, d, lt, bl, le]) {
    if (!le || state.count === undefined) state.count = +a + 2 * +b + 4 * +c + 8 * +d;
    if (!lt) return Array(7).fill(true);
    if (!bl || state.count > 9) return Array(7).fill(false);
    return [...BCD_SEGMENTS[state.count]].map((x) => x === '1');
  },
  readout: (state) => [
    ['Value', state.count === undefined ? '–' : state.count > 9 ? `${state.count} (blank)` : String(state.count)],
    ['Segments', 'abcdefg'.split('').filter((_, k) => state.outs?.[k]).join(' ') || 'none'],
  ],
});

// Pins (index = pin − 1): inputs CLK, INH, RST; outputs Q0–Q9 and CO.
const cd4017Model = cmos<PropsByType['cd4017']>({
  vdd: 15,
  vss: 7,
  inputs: [13, 12, 14],
  outputs: [2, 1, 3, 6, 9, 0, 4, 5, 8, 10, 11],
  rOut: 1000,
  logic(state, [clk, inh, rst], was) {
    let count = state.count ?? 0;
    if (rst) count = 0;
    else if (was && clk && !was[0] && !inh) count = (count + 1) % 10;
    state.count = count;
    return [...Array.from({ length: 10 }, (_, k) => k === count), count < 5];
  },
  readout: (state) => [['Count', `Q${state.count ?? 0}`], ['Carry out', (state.count ?? 0) < 5 ? 'high' : 'low']],
});

// --- LM358 op-amp ---------------------------------------------------------------

// Each amplifier drives its output toward A·(V+ − V−), smoothly limited
// (tanh) between GND and VCC − LM358_HEADROOM, through LM358_ROUT; the
// current comes from VCC when it sources and goes to GND when it sinks.
// Which of the two is settled between solves (el.state.outs: sourcing), from
// the current last solved, so it can't flip back and forth within one. Its
// currents are worked out from the same linearised output the solver used
// (el.state.segV: target, slope and input difference per amplifier): with
// so much gain, recomputing the tanh would magnify the solver's tolerance
// into visible errors.
// Inputs barely load. Pins (index = pin − 1): 1OUT 0, 1IN− 1, 1IN+ 2, GND 3,
// 2IN+ 4, 2IN− 5, 2OUT 6, VCC 7.
const LM358_GAIN = 1e5;
const LM358_ROUT = 50;
const LM358_HEADROOM = 1.5;
const LM358_G_IN = 1e-7; // S: input leakage (10 MΩ), also keeps unused inputs defined
const LM358_AMPS: [number, number, number][] = [
  [2, 1, 0],
  [4, 5, 6],
]; // [in+, in−, out]

function opampTarget(vp: number, vn: number, lo: number, hi: number) {
  const mid = (lo + hi) / 2;
  const half = Math.max(1e-3, (hi - lo) / 2);
  const t = Math.tanh((LM358_GAIN * (vp - vn)) / half);
  return { v: mid + half * t, slope: LM358_GAIN * (1 - t * t) };
}

const lm358Model: ModelDef<PropsByType['lm358']> = (() => {
  const [GND, VCC] = [3, 7];
  const g = 1 / LM358_ROUT;
  function currents(el: Element<PropsByType['lm358']>, v: (pin: number) => number): number[] {
    const i = el.nodes.map(() => 0);
    LM358_AMPS.forEach(([p, n, out], a) => {
      const lin = el.state.segV;
      const target = lin ? lin[3 * a] + lin[3 * a + 1] * (v(p) - v(n) - lin[3 * a + 2]) : opampTarget(v(p), v(n), v(GND), v(VCC) - LM358_HEADROOM).v;
      const amps = g * (target - v(out)); // into the output's net
      i[out] -= amps;
      i[(el.state.outs?.[a] ?? true) ? VCC : GND] += amps;
      for (const k of [p, n]) {
        i[k] += LM358_G_IN * (v(k) - v(GND));
        i[GND] -= LM358_G_IN * (v(k) - v(GND));
      }
    });
    return i;
  }
  return {
    nonlinear: true,
    stamp(el, s) {
      const n = el.nodes;
      const v = (k: number) => s.v(n[k]);
      LM358_AMPS.forEach(([p, m, out], a) => {
        s.conductance(n[p], n[GND], LM358_G_IN);
        s.conductance(n[m], n[GND], LM358_G_IN);
        const { v: target, slope } = opampTarget(v(p), v(m), v(GND), v(VCC) - LM358_HEADROOM);
        const lin = (el.state.segV ??= Array(6).fill(0));
        [lin[3 * a], lin[3 * a + 1], lin[3 * a + 2]] = [target, slope, v(p) - v(m)];
        // Linearised: amps into the output = g·(target + slope·(ΔV+ − ΔV−) − Vout).
        const i0 = g * (target - slope * (v(p) - v(m)));
        const supply = (el.state.outs?.[a] ?? true) ? n[VCC] : n[GND];
        s.draw(n[out], [[n[out], g], [n[p], -g * slope], [n[m], g * slope]], -i0);
        s.draw(supply, [[n[out], -g], [n[p], g * slope], [n[m], -g * slope]], i0);
      });
    },
    respond(el, _env, r) {
      const sourcing = LM358_AMPS.map(([, , out]) => r.pins[out] <= 0); // current leaving at the output
      const changed = sourcing.some((x, a) => x !== (el.state.outs?.[a] ?? true));
      el.state.outs = sourcing;
      return changed;
    },
    current: (el, s) => currents(el, (k) => s.v(el.nodes[k]))[VCC],
    pinCurrents: (el, s) => currents(el, (k) => s.v(el.nodes[k])),
    readout: (r) => [
      ['Output 1', fmt(r.pinV[0] - r.pinV[GND], 'V')],
      ['Output 2', fmt(r.pinV[6] - r.pinV[GND], 'V')],
      ['Supply', fmt(r.pinV[VCC] - r.pinV[GND], 'V')],
    ],
    thermal: { load: (r, p) => Math.max(Math.abs(r.pins[0]), Math.abs(r.pins[6])) / p.maxCurrent, tau: 0.2, limit: 1.5 },
    failure: { label: 'burnt out', open: true },
  };
})();

// --- ULN2003 Darlington array -----------------------------------------------------

// Pins (index = pin − 1): IN1–IN7 0–6, GND 7, COM 8, OUT7–OUT1 9–15. An input
// is a resistance to GND; above ULN_ON (to GND) its channel turns on, below
// ULN_OFF off. A channel that is on sinks its output to GND like a junction
// dropping about 1 V at its rating (the Darlington's saturation); every
// output has a flyback diode up to COM.
const ULN_R_IN = 10.5e3;
const ULN_ON = 1.6;
const ULN_OFF = 1.2;
const ulnOut = (ch: number) => 15 - ch; // OUT1 is pin 16

const uln2003Model: ModelDef<PropsByType['uln2003']> = (() => {
  const [GND, COM] = [7, 8];
  const sink = (p: PropsByType['uln2003']) => diode({ forwardVoltage: 1, maxCurrent: p.maxCurrent });
  const flyback = diode({ forwardVoltage: 0.8, maxCurrent: 0.5 });
  function currents(el: Element<PropsByType['uln2003']>, v: (pin: number) => number): number[] {
    const i = el.nodes.map(() => 0);
    const flow = (a: number, b: number, amps: number) => {
      i[a] += amps;
      i[b] -= amps;
    };
    for (let ch = 0; ch < 7; ch++) {
      const out = ulnOut(ch);
      flow(ch, GND, (v(ch) - v(GND)) / ULN_R_IN);
      if (el.state.outs?.[ch]) flow(out, GND, sink(el.props).current(v(out) - v(GND)));
      flow(out, COM, flyback.current(v(out) - v(COM)));
    }
    return i;
  }
  return {
    nonlinear: true,
    dynamic: true,
    stamp(el, s) {
      const n = el.nodes;
      const vs = (el.state.segV ??= Array(14).fill(0));
      for (let ch = 0; ch < 7; ch++) {
        const out = ulnOut(ch);
        s.conductance(n[ch], n[GND], 1 / ULN_R_IN);
        if (el.state.outs?.[ch]) stampJunction(s, vs, ch, n[out], n[GND], sink(el.props));
        stampJunction(s, vs, 7 + ch, n[out], n[COM], flyback);
      }
    },
    current: (el, s) => currents(el, (k) => s.v(el.nodes[k]))[GND],
    pinCurrents: (el, s) => currents(el, (k) => s.v(el.nodes[k])),
    respond(el, _env, r) {
      const outs = Array.from({ length: 7 }, (_, ch) => {
        const v = r.pinV[ch] - r.pinV[GND];
        return v > ULN_ON ? true : v < ULN_OFF ? false : (el.state.outs?.[ch] ?? false);
      });
      const changed = outs.some((o, k) => o !== (el.state.outs?.[k] ?? false));
      el.state.outs = outs;
      return changed;
    },
    readout: (r) => [
      ['On', (r.state.outs ?? []).flatMap((o, ch) => (o ? [`${ch + 1}`] : [])).join(', ') || 'none'],
      ['Sinking', fmt(Math.abs(r.pins[GND]), 'A')],
    ],
    thermal: {
      load: (r, p) => Math.max(...Array.from({ length: 7 }, (_, ch) => Math.abs(r.pins[ulnOut(ch)]))) / p.maxCurrent,
      tau: 0.2,
      limit: 1.5,
    },
    failure: { label: 'burnt out', open: true },
  };
})();

// --- Relays and contactors ---------------------------------------------------

// The coil is a resistance between pins 0 and 1. It pulls in at PULL_IN of
// its rated voltage and, once in, holds until it falls below DROP_OUT, so a
// relay doesn't chatter at the threshold. `contacts` lists [a, b, closed when
// energized] for each pair of pins the contacts join. An AC coil judges its
// RMS voltage (`ac`), a DC one the voltage at that instant.
const PULL_IN = 0.75;
const DROP_OUT = 0.4;

type CoilProps = { coilVoltage: number; coilResistance: number; maxCurrent: number };

function relayModel<P extends CoilProps>(
  contacts: (p: P) => [number, number, boolean][],
  groups: (p: P) => number[][],
  ac: boolean,
): ModelDef<P> {
  const level = (r: Result) => (ac ? r.vrms : Math.abs(r.v));
  const closed = (el: Element<P>) =>
    contacts(el.props).filter(([, , whenOn]) => whenOn === (el.state.energized ?? false));
  // The largest current through any contact pin; on AC, its RMS.
  const contactCurrent = (r: Result) => Math.max(0, ...(r.ac ? r.extraRms : r.pins.slice(2).map(Math.abs)));
  return {
    stamp(el, s) {
      s.conductance(el.nodes[0], el.nodes[1], 1 / el.props.coilResistance);
      for (const [a, b] of closed(el)) s.conductance(el.nodes[a], el.nodes[b], 1 / R_SWITCH_ON);
    },
    current: (el, s) => (s.v(el.nodes[0]) - s.v(el.nodes[1])) / el.props.coilResistance,
    pinCurrents(el, s) {
      const i = (s.v(el.nodes[0]) - s.v(el.nodes[1])) / el.props.coilResistance;
      const pins = el.nodes.map(() => 0);
      pins[0] = i;
      pins[1] = -i;
      for (const [a, b] of closed(el)) {
        const ic = (s.v(el.nodes[a]) - s.v(el.nodes[b])) / R_SWITCH_ON;
        pins[a] += ic;
        pins[b] -= ic;
      }
      return pins;
    },
    respond(el, _env, r) {
      const was = el.state.energized ?? false;
      el.state.energized = level(r) >= (was ? DROP_OUT : PULL_IN) * el.props.coilVoltage;
      return el.state.energized !== was;
    },
    active: (r) => !!r.state.energized,
    groups,
    extras: (r) => r.pins.slice(2),
    readout: (r) => [
      ['Coil', `${fmt(level(r), 'V')}${ac ? ' rms' : ''}, ${fmt(ac ? r.irms : Math.abs(r.i), 'A')}`],
      ['State', r.state.energized ? 'energized' : 'released'],
      ['Contact current', `${fmt(contactCurrent(r), 'A')}${r.ac ? ' rms' : ''}`],
    ],
    // Its coil overheats well past its rated voltage; its contacts past their
    // rated current.
    thermal: {
      load: (r, p) => Math.max(level(r) / (1.3 * p.coilVoltage), Math.max(0, ...r.pins.slice(2).map(Math.abs)) / p.maxCurrent),
      tau: 0.5,
      limit: 1.5,
    },
    failure: { label: 'burnt out', open: true },
  };
}

// Contact k joins its common to its make pin when energized and, if it's a
// changeover, to its break pin at rest.
const relayPinIndex = (p: PropsByType['relay']) => {
  const names = relayPins(p).map(({ name }) => name);
  return (name: string) => names.indexOf(name);
};
const relay = relayModel<PropsByType['relay']>(
  (p) => {
    const at = relayPinIndex(p);
    return Array.from({ length: relayContacts(p) }, (_, k): [number, number, boolean][] => [
      ...(p.contactType === 'SPDT' ? [[at(`c${k}`), at(`nc${k}`), false] as [number, number, boolean]] : []),
      [at(`c${k}`), at(`no${k}`), true],
    ]).flat();
  },
  (p) => {
    const at = relayPinIndex(p);
    const contact = (k: number) => [`c${k}`, `nc${k}`, `no${k}`].map(at).filter((i) => i >= 0);
    return [[0, 1], ...Array.from({ length: relayContacts(p) }, (_, k) => contact(k))];
  },
  false,
);
// Each pole k joins its pins 2 + 2k and 3 + 2k when energized.
const poles = (p: PropsByType['contactor']) => Array.from({ length: contactorPoles(p) }, (_, k) => [2 + 2 * k, 3 + 2 * k]);
const contactor = relayModel<PropsByType['contactor']>(
  (p) => poles(p).map(([a, b]): [number, number, boolean] => [a, b, true]),
  (p) => [[0, 1], ...poles(p)],
  true,
);

// --- Changeover switch -------------------------------------------------------

// Common (0) to throw 1 (1) at rest, to throw 2 (2) when thrown.
const changeoverModel: ModelDef<PropsByType['changeover']> = {
  stamp(el, s) {
    s.conductance(el.nodes[0], el.nodes[el.props.thrown ? 2 : 1], 1 / R_SWITCH_ON);
  },
  current: (el, s) => (s.v(el.nodes[0]) - s.v(el.nodes[el.props.thrown ? 2 : 1])) / R_SWITCH_ON,
  pinCurrents(el, s) {
    const to = el.props.thrown ? 2 : 1;
    const i = (s.v(el.nodes[0]) - s.v(el.nodes[to])) / R_SWITCH_ON;
    const pins = [i, 0, 0];
    pins[to] = -i;
    return pins;
  },
  readout: (r, p) => [
    ['Position', p.thrown ? '2' : '1'],
    ['Current', `${fmt(r.ac ? r.irms : Math.abs(r.i), 'A')}${r.ac ? ' rms' : ''}`],
  ],
  thermal: { load: (r, p) => Math.abs(r.i) / p.maxCurrent, tau: 0.2, limit: 1.5 },
  failure: { label: 'burnt out', open: true },
};

// --- Motors ------------------------------------------------------------------

// DC: armature resistance plus a back-EMF that grows with speed. Sized so that
// at its rated voltage it runs at rated speed drawing its rated current
// (efficiency MOTOR_EFFICIENCY), and stalled it draws 5×; speed follows the
// current it draws with a time constant of DC_SPIN_UP, so it accelerates on a
// surge and settles where the two balance (speed ∝ voltage).
//
// AC: induction windings, a resistance and inductance in series whose values
// slide with speed from locked rotor (a fifth of the running impedance, power
// factor 0.4: the starting surge) to running (power factor 0.8). It runs up
// over AC_SPIN_UP once its supply is above AC_START of rated, and runs down
// below. Three-phase windings are in delta, one between each pair of
// terminals; a three-phase motor runs only with all three lines present.
// Inductances are sized for 50 Hz.
const MOTOR_EFFICIENCY = 0.8;
const MOTOR_PF = 0.8;
const LOCKED_RATIO = 5;
const LOCKED_PF = 0.4;
const DC_SPIN_UP = 0.5; // s
const AC_SPIN_UP = 1; // s
const AC_START = 0.7;
const MOTOR_FREQ = 50;

type MotorEl = Element<PropsByType['motor']>;

const dcRated = (p: PropsByType['motor']) => {
  const current = p.ratedPower / (MOTOR_EFFICIENCY * p.ratedVoltage);
  return { current, r: p.ratedVoltage / (LOCKED_RATIO * current), emf: p.ratedVoltage * (1 - 1 / LOCKED_RATIO) };
};

// One winding's resistance and inductance at `speed` (0..1).
function winding(p: PropsByType['motor'], speed: number) {
  const phases = p.supply === 'AC 3~' ? 3 : 1;
  const z = (p.ratedVoltage ** 2 * phases * MOTOR_EFFICIENCY * MOTOR_PF) / p.ratedPower; // running |Z| per winding
  const s = Math.min(1, Math.max(0, speed));
  const lockedZ = z / LOCKED_RATIO;
  const r = lockedZ * LOCKED_PF + (z * MOTOR_PF - lockedZ * LOCKED_PF) * s;
  const x = lockedZ * Math.sqrt(1 - LOCKED_PF ** 2) + (z * Math.sqrt(1 - MOTOR_PF ** 2) - lockedZ * Math.sqrt(1 - LOCKED_PF ** 2)) * s;
  return { r, l: x / (2 * Math.PI * MOTOR_FREQ) };
}

// The terminals each winding joins.
const motorWindings = (p: PropsByType['motor']): [number, number][] =>
  p.supply === 'AC 3~' ? [[0, 1], [1, 2], [2, 0]] : [[0, 1]];

function windingCurrents(el: MotorEl, s: Stamper): number[] {
  const { r, l } = winding(el.props, el.state.speed ?? 0);
  const k = l / s.dt;
  return motorWindings(el.props).map(([a, b], w) => (s.v(el.nodes[a]) - s.v(el.nodes[b]) + k * (el.state.windings?.[w] ?? 0)) / (r + k));
}

function motorCurrents(el: MotorEl, s: Stamper): number[] {
  if (el.props.supply === 'DC') {
    const { r, emf } = dcRated(el.props);
    const i = (s.v(el.nodes[0]) - s.v(el.nodes[1]) - emf * (el.state.speed ?? 0)) / r;
    return [i, -i];
  }
  const iw = windingCurrents(el, s);
  const pins = el.nodes.map(() => 0);
  motorWindings(el.props).forEach(([a, b], w) => {
    pins[a] += iw[w];
    pins[b] -= iw[w];
  });
  return pins;
}

// Rated line current, for judging overload.
const motorRatedCurrent = (p: PropsByType['motor']) =>
  p.supply === 'DC'
    ? dcRated(p).current
    : p.ratedPower / (MOTOR_EFFICIENCY * MOTOR_PF * p.ratedVoltage * (p.supply === 'AC 3~' ? Math.sqrt(3) : 1));

const motorModel: ModelDef<PropsByType['motor']> = {
  dynamic: true,
  stamp(el, s) {
    if (el.props.supply === 'DC') {
      const { r, emf } = dcRated(el.props);
      s.conductance(el.nodes[0], el.nodes[1], 1 / r);
      s.current(el.nodes[0], el.nodes[1], (-emf * (el.state.speed ?? 0)) / r);
      return;
    }
    const { r, l } = winding(el.props, el.state.speed ?? 0);
    const k = l / s.dt;
    const g = 1 / (r + k);
    motorWindings(el.props).forEach(([a, b], w) => {
      s.conductance(el.nodes[a], el.nodes[b], g);
      s.current(el.nodes[a], el.nodes[b], g * k * (el.state.windings?.[w] ?? 0));
    });
  },
  // Line current at the first terminal.
  current: (el, s) => motorCurrents(el, s)[0],
  pinCurrents: motorCurrents,
  accept(el, s) {
    if (el.props.supply !== 'DC') el.state.windings = windingCurrents(el, s);
  },
  // The other line voltages of a three-phase motor, to check all are there.
  extras: (r) => (r.pinV.length === 3 ? [r.pinV[1] - r.pinV[2], r.pinV[2] - r.pinV[0]] : []),
  respond(el, _env, r, dt) {
    if (dt === null) return false;
    const p = el.props;
    const speed = el.state.speed ?? 0;
    let target: number;
    let tau: number;
    if (p.supply === 'DC') {
      target = r.i / dcRated(p).current;
      tau = DC_SPIN_UP;
    } else {
      const supply = Math.min(r.vrms, ...r.extraRms);
      target = supply >= AC_START * p.ratedVoltage ? 1 : 0;
      tau = AC_SPIN_UP;
    }
    el.state.speed = speed + (target - speed) * (1 - Math.exp(-dt / tau));
    return false;
  },
  active: (r) => Math.abs(r.state.speed ?? 0) > 0.05,
  readout: (r, p) => {
    const speed = r.state.speed ?? 0;
    return [
      ['Speed', `${Math.round(Math.abs(speed) * 100)} %${speed < -0.05 ? ' (reverse)' : ''}`],
      ['Current', p.supply === 'DC' ? fmt(Math.abs(r.i), 'A') : `${fmt(r.irms, 'A')} rms`],
      ['Power', p.supply === 'DC' ? fmt(Math.abs(r.p), 'W') : `${fmt(Math.abs(r.pavg), 'W')} avg`],
    ];
  },
  // Its windings overheat from sustained overcurrent, such as a stalled rotor.
  thermal: { load: (r, p) => (p.supply === 'DC' ? Math.abs(r.i) : r.irms) / motorRatedCurrent(p), tau: 8, limit: 2 },
  failure: { label: 'burnt out', open: true },
};

// --- Heater ------------------------------------------------------------------

// A fixed resistance (V²/P at its rating). Its element warms toward the
// power it takes over HEATER_TAU and glows once well warm.
const HEATER_TAU = 8; // s

const heaterPower = (r: Result) => Math.abs(r.ac ? r.pavg : r.p);
const heaterModel: ModelDef<PropsByType['heater']> = {
  ...ohmic((p) => p.ratedVoltage ** 2 / p.ratedPower, (r) => [
    ...basicReadout(r),
    ['Element', `${Math.round((r.state.temp ?? 0) * 100)} % hot`],
  ]),
  respond(el, _env, r, dt) {
    if (dt === null) return false;
    const target = heaterPower(r) / el.props.ratedPower;
    const t = el.state.temp ?? 0;
    el.state.temp = t + (target - t) * (1 - Math.exp(-dt / HEATER_TAU));
    return false;
  },
  dynamic: true,
  brightness: (r) => Math.max(0, ((r.state.temp ?? 0) - 0.3) / 0.7),
  thermal: { load: (r, p) => heaterPower(r) / p.ratedPower, tau: 5, limit: 1.5 },
  failure: { label: 'burnt out', open: true },
};

// --- Inductive coils ---------------------------------------------------------

// v = R·i + L·di/dt, as a companion model over each step (see inductor).
function coil<P>(r: (p: P) => number, l: (p: P) => number): Pick<ModelDef<P>, 'dynamic' | 'stamp' | 'current' | 'accept'> {
  const parts = (el: Element<P>, s: Stamper) => {
    const k = l(el.props) / s.dt;
    return { k, g: 1 / (r(el.props) + k) };
  };
  return {
    dynamic: true,
    stamp(el, s) {
      const { k, g } = parts(el, s);
      s.conductance(el.nodes[0], el.nodes[1], g);
      s.current(el.nodes[0], el.nodes[1], g * k * (el.state.i ?? 0));
    },
    current(el, s) {
      const { k, g } = parts(el, s);
      return g * (s.v(el.nodes[0]) - s.v(el.nodes[1])) + g * k * (el.state.i ?? 0);
    },
    accept(el, s) {
      el.state.i = this.current(el, s);
    },
  };
}

const inductorModel: ModelDef<PropsByType['inductor']> = {
  ...coil((p) => p.resistance, (p) => p.inductance),
  readout: (r, p) => [...basicReadout(r), ['Energy', fmt(0.5 * p.inductance * r.i * r.i, 'J')]],
  thermal: { load: (r, p) => Math.abs(r.i) / p.maxCurrent, tau: 1, limit: 1.5 },
  failure: { label: 'burnt out', open: true },
};

// The plunger pulls in at PULL_IN of the rated current and drops out below
// DROP_OUT, like a relay (judged by RMS on AC).
const solenoidModel: ModelDef<PropsByType['solenoid']> = {
  ...coil((p) => p.ratedVoltage / p.ratedCurrent, (p) => p.inductance),
  respond(el, _env, r) {
    const was = el.state.energized ?? false;
    const i = r.ac ? r.irms : Math.abs(r.i);
    el.state.energized = i >= (was ? DROP_OUT : PULL_IN) * el.props.ratedCurrent;
    return el.state.energized !== was;
  },
  active: (r) => !!r.state.energized,
  readout: (r) => [...basicReadout(r), ['Plunger', r.state.energized ? 'pulled in' : 'out']],
  thermal: { load: (r, p) => (r.ac ? r.irms : Math.abs(r.i)) / p.ratedCurrent, tau: 5, limit: 1.6 },
  failure: { label: 'burnt out', open: true },
};

// --- Speaker -----------------------------------------------------------------

// A resistance (its impedance) that sounds the AC part of the voltage across
// it at that signal's own frequency, measured from its upward zero crossings
// (in simulated time, placed between steps by interpolation), as loud as
// that is against its rated power.
const speakerModel: ModelDef<PropsByType['speaker']> = {
  ...ohmic((p) => p.impedance),
  respond(el, env, r, dt) {
    if (dt === null) return false;
    const now = r.v - r.vavg;
    const last = el.state.last;
    if (last !== undefined && last <= 0 && now > 0) {
      const at = env.time - (dt * now) / (now - last);
      if (el.state.crossAt !== undefined) el.state.span = at - el.state.crossAt;
      el.state.crossAt = at;
    }
    el.state.last = now;
    // Silent once no crossing has come for a while.
    if (el.state.crossAt !== undefined && env.time - el.state.crossAt > 0.1) el.state.span = undefined;
    return false;
  },
  sound(r, p) {
    const span = r.state.span;
    const ac = Math.sqrt(Math.max(0, r.vrms ** 2 - r.vavg ** 2));
    const level = Math.min(1, ac / Math.sqrt(p.ratedPower * p.impedance));
    if (!span || level < 0.02 || 1 / span < 20 || 1 / span > 20000) return null;
    return { frequency: 1 / span, wave: 'square', level };
  },
  readout(r, p) {
    const tone = this.sound!(r, p);
    return [...basicReadout(r), ['Tone', tone ? fmt(tone.frequency, 'Hz') : 'silent']];
  },
  thermal: { load: (r, p) => Math.abs(r.ac ? r.pavg : r.p) / p.ratedPower, tau: 0.5, limit: 2 },
  failure: { label: 'burnt out', open: true },
};

// --- Fluorescent lighting ----------------------------------------------------

// Glow starter: while open with enough voltage across it, it glows (drawing a
// little current), which warms its bimetal until it closes; closed, the glow
// goes out and the bimetal cools until it opens again. Its smoothed voltage
// follows the rectified average, capped so a voltage spike reads as no more
// than a strong glow.
const STARTER_HEAT = 0.8; // s of glowing to close
const STARTER_COOL = 0.6; // s closed before it opens
const R_GLOW = 50e3;

const starterModel: ModelDef<PropsByType['starter']> = {
  stamp(el, s) {
    if (el.state.energized) s.conductance(el.nodes[0], el.nodes[1], 1 / R_SWITCH_ON);
    else if (el.state.glowing) s.conductance(el.nodes[0], el.nodes[1], 1 / R_GLOW);
  },
  current: (el, s) =>
    (s.v(el.nodes[0]) - s.v(el.nodes[1])) / (el.state.energized ? R_SWITCH_ON : el.state.glowing ? R_GLOW : Infinity),
  respond(el, _env, r, dt) {
    if (dt === null) return false;
    const p = el.props;
    const v = Math.min(Math.abs(r.v), 3 * p.glowVoltage);
    el.state.glow = (el.state.glow ?? 0) + (v - (el.state.glow ?? 0)) * (1 - Math.exp(-dt / 0.05));
    const closed = el.state.energized ?? false;
    const glowing = !closed && el.state.glow >= 0.9 * p.glowVoltage;
    // The bimetal's warmth, 0 cold .. 1 bent shut (kept in el.state.temp).
    const t = Math.min(1, Math.max(0, (el.state.temp ?? 0) + (glowing ? dt / STARTER_HEAT : -dt / STARTER_COOL)));
    el.state.temp = t;
    const next = closed ? t > 0 : t >= 1;
    const changed = next !== closed || glowing !== (el.state.glowing ?? false);
    el.state.energized = next;
    el.state.glowing = glowing;
    return changed;
  },
  dynamic: true,
  active: (r) => !!r.state.energized,
  brightness: (r) => (r.state.glowing ? 1 : 0),
  readout: (r) => [['State', r.state.energized ? 'closed' : r.state.glowing ? 'glowing' : 'open']],
};

// Tube: filaments A (pins 0–1) and B (pins 2–3) are resistances; the arc
// runs between pins 1 and 3, in parallel with the starter. Unlit, the gap
// breaks down past the strike voltage (clamping the ballast's kick there);
// that strikes the arc once the filaments are warm, and the lit arc is a
// resistance dropping about the arc voltage at rated current. It goes out
// when its current dies away.
const R_FILAMENT = 5;
const G_BREAKDOWN = 1;
const tubeArc = (p: PropsByType['tube']) => p.arcVoltage ** 2 / p.ratedPower;
const tubeRated = (p: PropsByType['tube']) => p.ratedPower / p.arcVoltage;

function tubeCurrents(el: Element<PropsByType['tube']>, s: Stamper): number[] {
  const v = (k: number) => s.v(el.nodes[k]);
  const ia = (v(0) - v(1)) / R_FILAMENT;
  const ib = (v(2) - v(3)) / R_FILAMENT;
  const gap = v(1) - v(3);
  let arc = 0;
  if (el.state.struck) arc = gap / tubeArc(el.props);
  else if (Math.abs(gap) > el.props.strikeVoltage) arc = G_BREAKDOWN * (gap - Math.sign(gap) * el.props.strikeVoltage);
  return [ia, -ia + arc, ib, -ib - arc];
}

const tubeModel: ModelDef<PropsByType['tube']> = {
  nonlinear: true,
  dynamic: true,
  stamp(el, s) {
    const [a0, a1, b0, b1] = el.nodes;
    s.conductance(a0, a1, 1 / R_FILAMENT);
    s.conductance(b0, b1, 1 / R_FILAMENT);
    if (el.state.struck) {
      s.conductance(a1, b1, 1 / tubeArc(el.props));
      return;
    }
    const gap = s.v(a1) - s.v(b1);
    if (Math.abs(gap) > el.props.strikeVoltage) {
      s.conductance(a1, b1, G_BREAKDOWN);
      s.current(a1, b1, -G_BREAKDOWN * Math.sign(gap) * el.props.strikeVoltage);
    }
  },
  // The arc current.
  current: (el, s) => tubeCurrents(el, s)[1] + tubeCurrents(el, s)[0],
  pinCurrents: tubeCurrents,
  respond(el, _env, r, dt) {
    if (dt === null) return false;
    const p = el.props;
    const ease = (now: number, to: number, tau: number) => now + (to - now) * (1 - Math.exp(-dt / tau));
    el.state.filament = ease(el.state.filament ?? 0, Math.abs(r.pins[0]) > 0.05 ? 1 : 0, 0.4);
    el.state.arc = ease(el.state.arc ?? 0, Math.abs(r.i), 0.05);
    const was = el.state.struck ?? false;
    if (!was && Math.abs(r.pinV[1] - r.pinV[3]) >= 0.98 * p.strikeVoltage && el.state.filament >= 0.6) {
      el.state.struck = true;
      el.state.arc = tubeRated(p);
    } else if (was && el.state.arc < 0.05 * tubeRated(p)) {
      el.state.struck = false;
    }
    return el.state.struck !== was;
  },
  brightness: (r, p) => (r.state.struck ? Math.min(1.2, ((r.state.arc ?? 0) / (0.9 * tubeRated(p))) ** 2) : 0),
  readout: (r, p) => [
    ['State', r.state.struck ? 'lit' : (r.state.filament ?? 0) > 0.5 ? 'preheating' : 'off'],
    ['Arc current', `${fmt(r.state.struck ? (r.state.arc ?? 0) / 0.9 : 0, 'A')}`],
    ['Arc voltage', `${fmt(Math.abs(r.pinV[1] - r.pinV[3]), 'V')}`],
    ['Rated', fmt(p.ratedPower, 'W')],
  ],
};

// --- Sounders ----------------------------------------------------------------

// A resistive load that sounds while the average voltage across it, + to −,
// is at least SOUND_FROM of its rating, louder up to the rating.
const SOUND_FROM = 0.5;

function sounder<P extends { ratedVoltage: number; ratedCurrent: number }>(
  tone: (p: P) => { frequency: number; wave: OscillatorType },
  ac = false, // driven by RMS (a bell), rather than + to − (a buzzer)
): ModelDef<P> {
  const drive = (r: Result, p: P) => (ac ? r.vrms : r.vavg) / p.ratedVoltage;
  return {
    ...ohmic((p) => p.ratedVoltage / p.ratedCurrent, (r, p) => [
      ...basicReadout(r),
      ['Sound', r.state.energized ? `${Math.round(Math.min(1, drive(r, p)) * 100)} %` : 'silent'],
    ]),
    respond(el, _env, r) {
      el.state.energized = drive(r, el.props) >= SOUND_FROM;
      return false;
    },
    active: (r) => !!r.state.energized,
    sound: (r, p) => (r.state.energized ? { ...tone(p), level: Math.min(1, drive(r, p)) } : null),
    thermal: { load: (r, p) => Math.abs(r.v) / p.ratedVoltage, tau: 1, limit: 2 },
    failure: { label: 'burnt out', open: true },
  };
}

// A filament lamp: its hot resistance, V²/P at its rating.
const lampModel: ModelDef<PropsByType['lamp']> = {
  ...ohmic(
    (p) => p.ratedVoltage ** 2 / p.ratedPower,
    (r, p) => [...basicReadout(r), ['Brightness', `${Math.round(lampLight(r, p) * 100)} %`]],
  ),
  brightness: (r, p) => lampLight(r, p),
  thermal: { load: (r, p) => Math.abs(r.p) / p.ratedPower, tau: 0.3, limit: 1.5 },
  failure: { label: 'filament blown', open: true },
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

  rail: {
    ...rail((p) => p.voltage),
    readout: (r) => [
      ['Voltage', fmt(r.v, 'V')],
      ['Current', fmt(r.i, 'A')],
      ['Power', fmt(r.v * r.i, 'W')],
    ],
  },

  // v(t) = Vrms·√2·sin(2πft + φ) against neutral (0 V).
  phase: {
    ...rail((p, t) => p.voltage * Math.SQRT2 * Math.sin(2 * Math.PI * p.frequency * t + (p.phase * Math.PI) / 180)),
    dynamic: true,
    alternating: true,
    maxStep: (p) => 1 / (20 * p.frequency),
    readout: (r, p) => [
      ['Voltage', `${fmt(r.vrms, 'V')} rms`],
      ['Current', `${fmt(r.irms, 'A')} rms`],
      ['Power', `${fmt(r.pavg === 0 ? 0 : -r.pavg, 'W')} avg`],
      ['Frequency', fmt(p.frequency, 'Hz')],
      ['Now', `${fmt(r.v, 'V')}, ${fmt(r.i, 'A')}`],
    ],
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
  inductor: inductorModel,


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

  // Barely loads its point (like a 10 MΩ scope input) to the board's 0 V.
  scopeProbe: {
    stamp(el, s) {
      s.draw(el.nodes[0], [[el.nodes[0], G_SCOPE]], 0);
    },
    current: (el, s) => G_SCOPE * s.v(el.nodes[0]),
    pinCurrents: (el, s) => [G_SCOPE * s.v(el.nodes[0])],
    readout: (r, p) => [[p.channel, fmt(r.pinV[0], 'V')]],
  },

  // Meters read DC or AC as their mode is set (see meterReading).
  voltmeter: {
    ...ohmic((p) => p.resistance, (r, p) => [['Reading', `${meterReading(r, p, 'V')} ${p.mode}`]]),
    reading: (r, p) => meterReading(r, p, 'V'),
    // Past its rating the input is destroyed almost at once.
    thermal: { load: (r, p) => Math.abs(r.v) / p.maxVoltage, tau: 0.05, limit: 1.2 },
    failure: { label: 'destroyed', open: true, display: 'ERR' },
  },
  ammeter: {
    ...ohmic((p) => p.resistance, (r, p) => [['Reading', `${meterReading(r, p, 'A')} ${p.mode}`]]),
    reading: (r, p) => meterReading(r, p, 'A'),
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
  lamp: lampModel,
  pilot: lampModel,
  stackLight: lampGroup<PropsByType['stackLight']>(['red', 'amber', 'green']),


  switch: switchModel,
  changeover: changeoverModel,
  motor: motorModel,
  // A magnetic buzzer's harsh low buzz; a piezo's shrill tone.
  buzzer: sounder(() => ({ frequency: 400, wave: 'sawtooth' })),
  piezo: sounder((p) => ({ frequency: p.frequency, wave: 'square' })),
  bell: sounder(() => ({ frequency: 1100, wave: 'triangle' }), true),
  speaker: speakerModel,
  heater: heaterModel,
  solenoid: solenoidModel,
  tube: tubeModel,
  ballast: inductorModel,
  starter: starterModel,

  // A push button is electrically a switch that is only closed while held.
  button: switchModel,

  // Conducts until pressed; overloaded contacts weld shut.
  buttonNC: {
    ...ohmic((p, el) => (p.pressed && !el.broken ? Infinity : R_SWITCH_ON)),
    thermal: { load: (r, p) => Math.abs(r.i) / p.maxCurrent, tau: 0.2, limit: 1.5 },
    failure: { label: 'contacts welded', open: false },
  },

  relay,
  contactor,

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

  barGraph: ledGroup<PropsByType['barGraph']>(Array.from({ length: 10 }, (_, k) => String(k + 1)), (p) => p.forwardVoltage),
  bicolorLed: bicolorModel,
  panelMeter: panelMeterModel,
  cd4511: cd4511Model,
  cd4017: cd4017Model,
  lm358: lm358Model,
  uln2003: uln2003Model,
  sevenSeg: ledGroup<PropsByType['sevenSeg']>(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'dp'], (p) => p.forwardVoltage),
  // Typical forward voltages: red 2 V, green and blue 3 V.
  rgbLed: ledGroup<PropsByType['rgbLed']>(['red', 'green', 'blue'], (p, k) => [p.redVoltage, p.greenVoltage, p.blueVoltage][k]),
};

// Every part type's model, seen generally (each is checked against its own
// values above).
export const MODELS = DEFINITIONS as unknown as Record<PartType, Model>;
