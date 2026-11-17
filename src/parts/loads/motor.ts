import { fmt } from '../../sim/shared/readout.ts';
import { formatSI } from '../../units.ts';
import type { Element, ModelDef, ModelDefs, Result, Stamper } from '../../sim/models.ts';
import type { PartDefs } from '../defs.ts';
import type { PropsByType } from '../../types.ts';
import { loadState, shaftOutput, spin, type ShaftLoad } from '../../sim/shared/shaft.ts';
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
  motor: { supply: MotorSupply; ratedVoltage: number; ratedPower: number; ratedSpeed: number; direction: MotorDirection };
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
// AC: induction windings, a resistance and inductance in series whose values
// slide with speed from locked rotor (a fifth of the running impedance, power
// factor 0.4: the starting surge) to running (power factor 0.8). It runs up
// over AC_SPIN_UP (longer with a heavy load's inertia) once its supply is
// above AC_START of rated, and runs down below. (Its speed doesn't yet
// depend on the load's torque.) Three-phase windings are in delta, one between each pair of
// terminals; a three-phase motor runs only with all three lines present, and
// turns the way its phase sequence drives it: swapped while running, it
// brakes through standstill (drawing its starting surge) and runs up the
// other way. Inductances are sized for 50 Hz.
const MOTOR_EFFICIENCY = 0.8;

const MOTOR_PF = 0.8;

const LOCKED_RATIO = 5;

const LOCKED_PF = 0.4;

const DC_INERTIA = 0.3; // s for rated torque to bring the bare rotor to rated speed

const AC_SPIN_UP = 1; // s

const AC_START = 0.7;

const MOTOR_FREQ = 50;

const SEQUENCE_TAU = 0.02; // s, smoothing of the detected phase sequence

type MotorEl = Element<PropsByType['motor']>;

const dcRated = (p: PropsByType['motor']) => {
  const current = p.ratedPower / (MOTOR_EFFICIENCY * p.ratedVoltage);
  return { current, r: p.ratedVoltage / (LOCKED_RATIO * current), emf: p.ratedVoltage * (1 - 1 / LOCKED_RATIO) };
};

// One winding's resistance and inductance at `speed` (0..1).
function winding(p: PropsByType['motor'], speed: number) {
  const phases = p.supply === 'AC 3~' ? 3 : 1;
  const z = (p.ratedVoltage ** 2 * phases * MOTOR_EFFICIENCY * MOTOR_PF) / p.ratedPower; // running |Z| per winding
  const s = Math.min(1, Math.abs(speed));
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

// Torque a load takes at speed s (share of rated): see spin().
function loadTorque(load: ShaftLoad | null, s: number): number {
  if (!load || s === 0) return 0;
  return load.kind === 'conveyor' ? load.torque : load.kind === 'pump' ? load.torque * s * s : 0;
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
    const load = shaft?.load ?? builtIn;
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
      const supply = Math.min(r.vrms, ...r.extraRms);
      const target = supply >= AC_START * p.ratedVoltage ? (p.supply === 'AC 3~' ? phaseSequence(el, r, dt) : 1) : 0;
      const tau = AC_SPIN_UP * (1 + (load?.inertia ?? 0));
      next = speed + (target - speed) * (1 - Math.exp(-dt / tau));
      held = loadTorque(load, next);
      el.state.output = held * Math.abs(next) * p.ratedPower;
    }
    el.state.speed = next;
    el.state.energy = (el.state.energy ?? 0) + r.p * dt;
    if (shaft) {
      const inertia = p.supply === 'DC' ? DC_INERTIA : AC_SPIN_UP;
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
  respond: respondWith(null),
  active: (r) => Math.abs(r.state.speed ?? 0) > 0.05,
  reverse: (r, p) => turning(r, p) < 0,
  readout: (r, p) => {
    const speed = r.state.speed ?? 0;
    const turn = turning(r, p);
    const input = p.supply === 'DC' ? r.p : r.pavg;
    // (Below a thousandth of its rating, it's rounding: show none.)
    const output = Math.abs(r.state.output ?? 0) < 1e-3 * p.ratedPower ? 0 : (r.state.output ?? 0);
    return [
      ['Speed', `${Math.round(Math.abs(speed) * p.ratedSpeed)} rpm`],
      ['Turning', turn > 0 ? 'clockwise' : turn < 0 ? 'counter-clockwise' : 'stopped'],
      ['Current', p.supply === 'DC' ? fmt(Math.abs(r.i), 'A') : `${fmt(r.irms, 'A')} rms`],
      ['Power', p.supply === 'DC' ? fmt(Math.abs(input), 'W') : `${fmt(Math.abs(input), 'W')} avg`],
      ['Shaft power', fmt(output, 'W')],
      // What doesn't reach the shaft heats the motor: its windings' I²R and
      // friction. (An AC motor's current doesn't follow its load yet, so its
      // losses can't be told apart.)
      ...(p.supply === 'DC'
        ? ([
            ['Losses (heat)', fmt(Math.max(0, input - output), 'W')],
            ['Efficiency', input > 1e-3 * p.ratedPower && output > 0 ? `${Math.round((100 * output) / input)} %` : '–'],
          ] as [string, string][])
        : []),
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
    letter: 'M',
    // US (IEEE 315): the circle reads MOT; its class letter is B.
    us: { letter: 'B', draw: (p) => motorSymbol(p, 'MOT') },
    category: 'loads',
    group: 'Motors',
    pins: (p) => [{ x: -40, y: 0 }, { x: 40, y: 0 }, ...(p.supply === 'AC 3~' ? [{ x: 0, y: 40 }] : [])],
    props: {
      supply: { label: 'Supply', value: 'DC', options: ['DC', 'AC 1~', 'AC 3~'] },
      ratedVoltage: { label: 'Rated voltage', unit: 'V', value: 12, min: 0.1 },
      ratedPower: { label: 'Rated power', unit: 'W', value: 10, min: 0.01 },
      ratedSpeed: { label: 'Rated speed', unit: 'rpm', value: 3000, min: 1 },
      direction: { label: 'Direction', value: 'Clockwise', options: ['Clockwise', 'Counter-clockwise'] },
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
      <g class="when-on turn-cw">
        <path class="rotor" d="M 0 -23 A 23 23 0 0 1 20 -11.5 M 20 -11.5 l -1 -5 M 20 -11.5 l -5 1" />
        <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="0.8s" repeatCount="indefinite" />
      </g>
      <g class="when-on turn-ccw">
        <path class="rotor" d="M 0 -23 A 23 23 0 0 0 -20 -11.5 M -20 -11.5 l 1 -5 M -20 -11.5 l 5 1" />
        <animateTransform attributeName="transform" type="rotate" from="0" to="-360" dur="0.8s" repeatCount="indefinite" />
      </g>`;

export const models: ModelDefs<'motor'> = {
  motor: motorModel,
};
