import { fmt } from '../../sim/shared/readout.ts';
import { formatSI } from '../../units.ts';
import type { Element, ModelDef, ModelDefs, Result, Stamper } from '../../sim/models.ts';
import type { PartDefs } from '../defs.ts';
import type { PropsByType } from '../../types.ts';
import { drivenBy, loadState, shaftOutput, spin, type ShaftLoad } from '../../sim/shared/shaft.ts';
import type { LabelSpot } from '../defs.ts';

export type MotorSupply = 'DC' | 'AC 1~' | 'AC 3~';

export type MotorDirection = 'Clockwise' | 'Counter-clockwise';

// The values each of these parts carries: what the properties panel edits
// and the simulator reads (gathered into PropsByType in src/types.ts).
export interface PartProps {
  // `supply`: DC (pins +, −), single-phase AC (L, N) or three-phase AC (U, V,
  // W, windings in delta). Rated voltage is the DC or RMS line voltage.
  // `direction`: the way the shaft turns, seen from its drive end, when
  // connected the standard way (IEC 60034-8): + on the + terminal, or phases
  // L1, L2, L3 on U, V, W. The other way round it turns the other way: swap
  // DC polarity or two phases to reverse it. A single-phase motor always
  // turns its set way (its start winding's connection fixes it).
  // `ratedSpeed` (rpm) and `ratedPower` (W) are at the shaft, at its rated
  // load. Its shaft (on top) drives a load docked onto it (see src/shaft.ts).
  // An AC motor's `ratedFrequency` (Hz) is its nameplate's; `breakdown` is the
  // most torque it can give, as a multiple of its rated torque (pull-out).
  motor: {
    supply: MotorSupply;
    ratedVoltage: number;
    ratedPower: number;
    ratedSpeed: number;
    direction: MotorDirection;
    ratedFrequency: number;
    breakdown: number;
  };
}

// --- Motors ------------------------------------------------------------------

// DC: armature resistance plus a back-EMF that grows with speed. Sized so that
// at its rated voltage and rated load it runs at (about) rated speed drawing
// its rated current (efficiency MOTOR_EFFICIENCY), and stalled it draws 5×.
// Its torque follows its current, and its shaft (src/sim/shared/shaft.ts)
// speeds up while that torque beats friction and the load: unloaded it runs
// fast on little current, loaded it slows and draws more, and past 5× rated
// torque a conveyor holds it stalled.
//
// AC: an induction motor. Its stator's field turns at the synchronous speed,
// set by the supply's frequency (measured at its terminals) and its number of
// poles (the fewest that put synchronous speed above its rated speed: 1400 rpm
// at 50 Hz is a 4-pole motor, synchronous at 1500). The rotor lags the field
// by its slip, and slip makes torque, along the Kloss curve through rated
// torque at rated slip, rising to `breakdown` × rated, then falling to the
// standstill (starting) torque; it scales with (V/f)², so a sagging supply
// slows it and a weak one stalls it. Its shaft (as DC's) settles where that
// torque meets the load's: unloaded it runs near synchronous speed, loaded it
// slips more, and pulled past breakdown it stalls. Each winding is the
// textbook equivalent circuit (stator, magnetizing reactance, rotor resistance
// over slip), sized so that at rated slip it takes its rated power in at
// power factor MOTOR_PF: light it draws mostly magnetizing current at a poor
// power factor, stalled about five times rated current at a power factor
// near 0.4, and its current follows its load in between. Three-phase windings
// are in delta, one between each pair of terminals; a three-phase motor runs
// only with all three lines present, and its field turns the way its phase
// sequence drives it: swapped while running, the motor brakes against the
// field (plugging, drawing heavy current) through standstill and runs up the
// other way. A single-phase motor's field turns its set way (its start winding).
const MOTOR_EFFICIENCY = 0.8;

const MOTOR_PF = 0.8;

const LOCKED_RATIO = 5;

const DC_INERTIA = 0.3; // s for rated torque to bring the bare rotor to rated speed

const AC_INERTIA = 0.4; // s, as DC_INERTIA

const SEQUENCE_TAU = 0.02; // s, smoothing of the detected phase sequence

const NO_SUPPLY = 0.25; // s without a zero crossing: the supply isn't alternating

// The equivalent circuit per winding, in shares of its running impedance:
// stator resistance and leakage, rotor leakage, magnetizing reactance.
const [RS, XS, XR, XM] = [0.035, 0.092, 0.092, 2.5];

// Its impedance with the rotor's resistance over slip `x` (Infinity: no slip).
function equivalent(x: number): { r: number; x: number } {
  if (!Number.isFinite(x)) return { r: RS, x: XS + XM };
  // (x + j·XR) ∥ j·XM
  const [nr, ni, dr, di] = [-XR * XM, x * XM, x, XR + XM];
  const d2 = dr * dr + di * di;
  return { r: RS + (nr * dr + ni * di) / d2, x: XS + (ni * dr - nr * di) / d2 };
}

// The rotor's resistance over slip at rated slip: where the circuit takes
// rated power in (its admittance's real part, in these shares, is MOTOR_PF).
const X_RATED = (() => {
  let [lo, hi] = [0.01, 100];
  for (let k = 0; k < 60; k++) {
    const mid = Math.sqrt(lo * hi);
    const { r, x } = equivalent(mid);
    if (r / (r * r + x * x) > MOTOR_PF) lo = mid;
    else hi = mid;
  }
  return Math.sqrt(lo * hi);
})();

// Its rated slip, from its rated speed and frequency (a rating at or above
// two-pole synchronous speed is taken as 3 % below it).
function ratedSlip(p: PropsByType['motor']): number {
  const n = p.ratedSpeed;
  let poles = 2;
  while ((120 * p.ratedFrequency) / (poles + 2) > n) poles += 2;
  const slip = 1 - n / ((120 * p.ratedFrequency) / poles);
  return slip >= 0.01 ? slip : 0.03;
}

// Its torque at `slip` (share of rated torque, at rated voltage and frequency):
// Kloss's 2·Tb / (s/sb + sb/s), through rated torque at rated slip.
function klossTorque(p: PropsByType['motor'], slip: number): number {
  if (slip === 0) return 0;
  const tb = Math.max(1.1, p.breakdown);
  const sb = ratedSlip(p) * (tb + Math.sqrt(tb * tb - 1));
  return (2 * tb) / (slip / sb + sb / slip);
}

type MotorEl = Element<PropsByType['motor']>;

const dcRated = (p: PropsByType['motor']) => {
  const current = p.ratedPower / (MOTOR_EFFICIENCY * p.ratedVoltage);
  return { current, r: p.ratedVoltage / (LOCKED_RATIO * current), emf: p.ratedVoltage * (1 - 1 / LOCKED_RATIO) };
};

// One winding's resistance and inductance at `slip` (1 at standstill), its
// reactance as at its rated frequency.
function winding(p: PropsByType['motor'], slip: number) {
  const phases = p.supply === 'AC 3~' ? 3 : 1;
  const z = (p.ratedVoltage ** 2 * phases * MOTOR_EFFICIENCY * MOTOR_PF) / p.ratedPower; // running |Z| per winding
  const s = Math.abs(slip);
  const { r, x } = equivalent(s < 1e-6 ? Infinity : (X_RATED * ratedSlip(p)) / s);
  return { r: z * r, l: (z * x) / (2 * Math.PI * p.ratedFrequency) };
}

// The terminals each winding joins.
const motorWindings = (p: PropsByType['motor']): [number, number][] =>
  p.supply === 'AC 3~' ? [[0, 1], [1, 2], [2, 0]] : [[0, 1]];

function windingCurrents(el: MotorEl, s: Stamper): number[] {
  const { r, l } = winding(el.props, el.state.slip ?? 1);
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

// The shaft's motion over dt, against the load docked on it or, for a part
// with one of its own (a fan's blades), `builtIn`. Writes the docked load's
// readout, and the motor's shaft power and the energy it has taken.
export const respondWith =
  (builtIn: ShaftLoad | null): NonNullable<ModelDef<PropsByType['motor']>['respond']> =>
  (el, env, r, dt) => {
    if (dt === null) return false;
    const p = el.props;
    const shaft = env.shaft(el);
    const load = drivenBy(shaft?.load ?? builtIn, p.ratedPower);
    const speed = el.state.speed ?? 0;
    let next: number;
    let held: number;
    if (p.supply === 'DC') {
      // Its torque at speed s, from the current at that speed's back-EMF.
      const { current, r: res, emf } = dcRated(p);
      const torque = (s: number) => (r.v - emf * s) / res / current;
      ({ speed: next, load: held } = spin(speed, torque, DC_INERTIA, load, dt));
      el.state.output = shaftOutput(next, torque(next)) * p.ratedPower;
    } else {
      // The field's speed (share of rated speed, signed the way it turns) and
      // strength from the supply as measured; the torque at each shaft speed
      // from the slip there.
      const field = p.supply === 'AC 3~' ? phaseSequence(el, r, dt) : 1;
      const f = supplyFrequency(el, env.time, r, dt) / p.ratedFrequency;
      const v = Math.min(r.vrms, ...r.extraRms) / p.ratedVoltage;
      const sync = (field * f) / (1 - ratedSlip(p));
      const flux = f > 0.05 ? (v / f) ** 2 : 0;
      const slipAt = (s: number) => (sync === 0 ? 1 : (sync - s) / sync);
      const torque = (s: number) => (sync === 0 ? 0 : Math.sign(sync) * flux * klossTorque(p, slipAt(s)));
      ({ speed: next, load: held } = spin(speed, torque, AC_INERTIA, load, dt));
      el.state.slip = slipAt(next);
      el.state.output = shaftOutput(next, torque(next)) * p.ratedPower;
    }
    el.state.speed = next;
    el.state.energy = (el.state.energy ?? 0) + r.p * dt;
    if (shaft) {
      const inertia = p.supply === 'DC' ? DC_INERTIA : AC_INERTIA;
      shaft.state.shaft = loadState(shaft.state.shaft, shaft.load, next * sense(p), held, inertia, p.ratedPower, p.ratedSpeed, dt);
    }
    return false;
  };

// 1 if positive speed turns it clockwise, −1 if counter-clockwise.
const sense = (p: PropsByType['motor']) => (p.direction === 'Counter-clockwise' ? -1 : 1);

// Which way the shaft turns: 1 clockwise, −1 counter-clockwise, 0 stopped.
// Speed is signed by the supply (DC polarity, phase sequence); its set
// direction says which sign is clockwise.
function turning(r: Result, p: PropsByType['motor']): number {
  const speed = r.state.speed ?? 0;
  if (Math.abs(speed) <= 0.05) return 0;
  return Math.sign(speed) * sense(p);
}

// The phase sequence at a three-phase motor's terminals: 1 for U, V, W
// (V−W lagging U−V by 120°), −1 for the reverse. The line voltages a = U−V
// and b = V−W trace an ellipse whose sense of rotation, a·b′ − b·a′, is a
// steady positive for U, V, W; it's smoothed so a step's noise can't flip it.
function phaseSequence(el: MotorEl, r: Result, dt: number): number {
  const a = r.pinV[0] - r.pinV[1];
  const b = r.pinV[1] - r.pinV[2];
  const [pa, pb] = el.state.lines ?? [a, b];
  el.state.lines = [a, b];
  const k = 1 - Math.exp(-dt / SEQUENCE_TAU);
  const sequence = (el.state.sequence ?? 0) + (Math.sign(b * pa - a * pb) - (el.state.sequence ?? 0)) * k;
  el.state.sequence = sequence;
  return sequence >= 0 ? 1 : -1;
}

// The supply's frequency at an AC motor's terminals (Hz): from the time
// between upward zero crossings of its first winding's voltage (found between
// steps), held between crossings; until the first full cycle, its rated
// frequency; 0 once there's been no crossing for NO_SUPPLY (DC, or none).
function supplyFrequency(el: MotorEl, time: number, r: Result, dt: number): number {
  const v = r.pinV[0] - r.pinV[1];
  const was = el.state.last ?? v;
  el.state.last = v;
  if (was < 0 && v >= 0) {
    const at = time - (dt * v) / (v - was);
    if (el.state.crossAt !== undefined && at > el.state.crossAt) el.state.hz = 1 / (at - el.state.crossAt);
    el.state.crossAt = at;
  }
  if (time - (el.state.crossAt ?? 0) > NO_SUPPLY) el.state.hz = 0;
  return el.state.hz ?? el.props.ratedFrequency;
}

// Rated line current, for judging overload.
const motorRatedCurrent = (p: PropsByType['motor']) =>
  p.supply === 'DC'
    ? dcRated(p).current
    : p.ratedPower / (MOTOR_EFFICIENCY * MOTOR_PF * p.ratedVoltage * (p.supply === 'AC 3~' ? Math.sqrt(3) : 1));

export const motorModel: ModelDef<PropsByType['motor']> = {
  dynamic: true,
  stamp(el, s) {
    if (el.props.supply === 'DC') {
      const { r, emf } = dcRated(el.props);
      s.conductance(el.nodes[0], el.nodes[1], 1 / r);
      s.current(el.nodes[0], el.nodes[1], (-emf * (el.state.speed ?? 0)) / r);
      return;
    }
    const { r, l } = winding(el.props, el.state.slip ?? 1);
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
  respond: respondWith(null),
  active: (r) => Math.abs(r.state.speed ?? 0) > 0.05,
  reverse: (r, p) => turning(r, p) < 0,
  readout: (r, p) => {
    const speed = r.state.speed ?? 0;
    const turn = turning(r, p);
    const input = p.supply === 'DC' ? r.p : r.pavg;
    // (Below a thousandth of its rating, it's rounding: show none.)
    const output = Math.abs(r.state.output ?? 0) < 1e-3 * p.ratedPower ? 0 : (r.state.output ?? 0);
    const ac = p.supply !== 'DC';
    // How far it lags its field (only while there's one).
    const slip = ac && (r.state.hz ?? 0) > 0 && r.vrms > 0.05 * p.ratedVoltage ? r.state.slip : undefined;
    return [
      ['Speed', `${Math.round(Math.abs(speed) * p.ratedSpeed)} rpm`],
      ['Turning', turn > 0 ? 'clockwise' : turn < 0 ? 'counter-clockwise' : 'stopped'],
      ...(ac ? ([['Supply', `${fmt(r.state.hz ?? 0, 'Hz')}`]] as [string, string][]) : []),
      ...(slip !== undefined ? ([['Slip', `${(slip * 100).toFixed(1)} %`]] as [string, string][]) : []),
      ['Current', p.supply === 'DC' ? fmt(Math.abs(r.i), 'A') : `${fmt(r.irms, 'A')} rms`],
      ['Power', p.supply === 'DC' ? fmt(Math.abs(input), 'W') : `${fmt(Math.abs(input), 'W')} avg`],
      ['Shaft power', fmt(output, 'W')],
      // What doesn't reach the shaft heats the motor: its windings' losses and
      // friction.
      ['Losses (heat)', fmt(Math.max(0, input - output), 'W')],
      ['Efficiency', input > 1e-3 * p.ratedPower && output > 0 ? `${Math.round((100 * output) / input)} %` : '–'],
      ['Energy used', fmt(r.state.energy ?? 0, 'J')],
    ];
  },
  // Its windings overheat from sustained overcurrent, such as a stalled rotor.
  // Only its losses (1 − efficiency) warm what's around it; the rest is motion.
  thermal: {
    load: (r, p) => (p.supply === 'DC' ? Math.abs(r.i) : r.irms) / motorRatedCurrent(p),
    tau: 8,
    limit: 2,
    rise: 60, // °C at its rating: windings
    heatShare: 1 - MOTOR_EFFICIENCY,
  },
  failure: { label: 'burnt out', open: true },
};

export const defs: PartDefs<'motor'> = {
  // DIN EN 60617: a circle with M, and = (DC), 1~ or 3~ under it. Pins 0
  // and 1 left and right (+ and − for DC); a three-phase motor's third
  // terminal below; its shaft on top, where a load docks. While it turns, a
  // rotor mark spins round it the way the
  // shaft turns (.reverse: counter-clockwise), its arrow pointing that way.
  motor: {
    name: 'Motor',
    info: {
      summary: 'A DC, single-phase or three-phase motor turning a load on its shaft; its speed and current follow the load, and it stalls if overloaded.',
      about: {
        how: 'Turns electrical power into rotation. A DC motor’s speed rises with its voltage and its current with its load; an induction (AC) motor turns a little slower than its supply’s rotating field, slipping more as its load grows.',
        sim: 'Shaft mechanics with inertia and friction, driving a load docked on its shaft. DC: back-EMF and armature resistance. AC: slip, torque from the Kloss curve up to its breakdown torque, and current from an equivalent circuit, at the frequency measured at its terminals. Swap two phases (or DC polarity) to reverse it. Stalled, it overheats.',
        uses: 'Fans, pumps, conveyors, machine drives; three-phase motors with contactors in industry.',
      },
      example: 'motor-starter',
    },
    letter: 'M',
    // US (IEEE 315): the circle reads MOT; its class letter is B.
    us: { letter: 'B', draw: (p) => motorSymbol(p, 'MOT'), values: { ratedFrequency: 60 } },
    category: 'loads',
    group: 'Motors',
    pins: (p) => [{ x: -40, y: 0 }, { x: 40, y: 0 }, ...(p.supply === 'AC 3~' ? [{ x: 0, y: 40 }] : [])],
    props: {
      supply: { label: 'Supply', value: 'DC', options: ['DC', 'AC 1~', 'AC 3~'] },
      ratedVoltage: { label: 'Rated voltage', unit: 'V', value: 12, min: 0.1 },
      ratedPower: { label: 'Rated power', unit: 'W', value: 10, min: 0.01 },
      ratedSpeed: { label: 'Rated speed', unit: 'rpm', value: 3000, min: 1 },
      direction: { label: 'Direction', value: 'Clockwise', options: ['Clockwise', 'Counter-clockwise'] },
      ratedFrequency: { label: 'Rated frequency (AC)', unit: 'Hz', value: 50, min: 1, max: 400 },
      breakdown: { label: 'Breakdown torque (AC, × rated)', unit: '', value: 2.5, min: 1.2, max: 5, slider: { min: 1.2, max: 5, step: 0.1 } },
    },
    tag: (p) => `${formatSI(p.ratedVoltage, 'V')} ${formatSI(p.ratedPower, 'W')}`,
    labelAt: motorLabel,
    draw: (p) => motorSymbol(p, 'M'),
  },
};

// Its label, clear of the shaft (and of a three-phase motor's third terminal,
// opposite the shaft).
function motorLabel(_vertical: boolean, p: PropsByType['motor'], rotation: number): LabelSpot {
  const three = p.supply === 'AC 3~';
  switch (((rotation % 360) + 360) % 360) {
    case 90: // shaft to the right
      return three ? [-26, -12, 'end'] : [-26, 4, 'end'];
    case 180: // shaft below
      return three ? [24, -30, 'start'] : [0, -28, 'middle'];
    case 270: // shaft to the left
      return three ? [26, -12, 'start'] : [26, 4, 'start'];
    default:
      return three ? [24, 34, 'start'] : [0, 34, 'middle'];
  }
}

const motorSymbol = (p: PropsByType['motor'], letters: string) => `
      <path d="M -40 0 H -18 M 18 0 H 40${p.supply === 'AC 3~' ? ' M 0 18 V 40' : ''}" />
      <path class="shaft" d="M 0 -18 V -40" />
      <circle r="18" />
      <text class="meter-letter upright" y="2" text-anchor="middle" data-y="-2"${letters.length > 1 ? ' style="font-size: 11px"' : ''}>${letters}</text>
      <text class="sym-text upright" y="12" text-anchor="middle" data-y="9">${p.supply === 'DC' ? '=' : p.supply === 'AC 1~' ? '1~' : '3~'}</text>
      ${p.supply === 'DC' ? '<text class="sym-text" x="-30" y="-6" text-anchor="middle">+</text>' : ''}
      ${ROTOR}`;

// While it turns, a rotor mark spinning round the circle the way the shaft
// turns (.reverse: counter-clockwise), its arrow pointing that way. (A
// dynamo's too.)
export const ROTOR = `
      <g class="when-on turn-cw">
        <path class="rotor" d="M 0 -23 A 23 23 0 0 1 20 -11.5 M 20 -11.5 l -1 -5 M 20 -11.5 l -5 1" />
        <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="0.8s" repeatCount="indefinite" />
      </g>
      <g class="when-on turn-ccw">
        <path class="rotor" d="M 0 -23 A 23 23 0 0 0 -20 -11.5 M -20 -11.5 l 1 -5 M -20 -11.5 l 5 1" />
        <animateTransform attributeName="transform" type="rotate" from="0" to="-360" dur="0.8s" repeatCount="indefinite" />
      </g>`;

// (Its shaft takes a docked load; a fan's, built on the same model, has its
// blades.)
export const models: ModelDefs<'motor'> = {
  motor: { ...motorModel, drivesShaft: true },
};
