import { fmt } from '../../sim/shared/readout.ts';
import { formatSI } from '../../units.ts';
import type { Element, ModelDef, ModelDefs, Stamper } from '../../sim/models.ts';
import type { PartDefs } from '../defs.ts';
import type { PropsByType } from '../../types.ts';

export type MotorSupply = 'DC' | 'AC 1~' | 'AC 3~';

// The values each of these parts carries: what the properties panel edits
// and the simulator reads (gathered into PropsByType in src/types.ts).
export interface PartProps {
  // `supply`: DC (pins +, −), single-phase AC (L, N) or three-phase AC (U, V,
  // W, windings in delta). Rated voltage is the DC or RMS line voltage.
  motor: { supply: MotorSupply; ratedVoltage: number; ratedPower: number };
}

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

export const defs: PartDefs<'motor'> = {
  // DIN EN 60617: a circle with M, and = (DC), 1~ or 3~ under it. Pins 0
  // and 1 left and right (+ and − for DC); a three-phase motor's third
  // terminal below. While it turns, a rotor mark spins round it.
  motor: {
    name: 'Motor',
    letter: 'M',
    category: 'loads',
    group: 'Motors',
    pins: (p) => [{ x: -40, y: 0 }, { x: 40, y: 0 }, ...(p.supply === 'AC 3~' ? [{ x: 0, y: 40 }] : [])],
    props: {
      supply: { label: 'Supply', value: 'DC', options: ['DC', 'AC 1~', 'AC 3~'] },
      ratedVoltage: { label: 'Rated voltage', unit: 'V', value: 12, min: 0.1 },
      ratedPower: { label: 'Rated power', unit: 'W', value: 10, min: 0.01 },
    },
    tag: (p) => `${formatSI(p.ratedVoltage, 'V')} ${formatSI(p.ratedPower, 'W')}`,
    labelAt: (vertical) => (vertical ? [30, 4, 'start'] : [0, -30, 'middle']),
    draw: (p) => `
      <path d="M -40 0 H -18 M 18 0 H 40${p.supply === 'AC 3~' ? ' M 0 18 V 40' : ''}" />
      <circle r="18" />
      <text class="meter-letter upright" y="2" text-anchor="middle" data-y="-2">M</text>
      <text class="sym-text upright" y="12" text-anchor="middle" data-y="9">${p.supply === 'DC' ? '=' : p.supply === 'AC 1~' ? '1~' : '3~'}</text>
      ${p.supply === 'DC' ? '<text class="sym-text" x="-30" y="-6" text-anchor="middle">+</text>' : ''}
      <g class="when-on">
        <path class="rotor" d="M 0 -23 A 23 23 0 0 1 20 -11.5 M 20 -11.5 l -1 -5 M 20 -11.5 l -5 1" />
        <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="0.8s" repeatCount="indefinite" />
      </g>`,
  },
};

export const models: ModelDefs<'motor'> = {
  motor: motorModel,
};
