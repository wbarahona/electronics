import { fmt } from '../../sim/shared/readout.ts';
import { drivenBy, loadState, spin } from '../../sim/shared/shaft.ts';
import type { ModelDef, ModelDefs } from '../../sim/models.ts';
import type { LabelSpot, PartDefs } from '../defs.ts';
import type { PropsByType } from '../../types.ts';
import { turned } from '../switches/poles.ts';
import { spinning } from './mech-loads.ts';

// The values each of these parts carries: what the properties panel edits
// and the simulator reads (gathered into PropsByType in src/types.ts).
export interface PartProps {
  // A hand crank: its shaft (on top) drives a load docked on it, such as a
  // dynamo (see src/shaft.ts), while its control on the board is held down
  // (`cranking`). `effort` (W) is the most power the person cranking puts in;
  // `gear` steps the crank's speed up to the shaft's (a dynamo wants
  // thousands of rpm, a hand turns about one turn a second).
  crank: { cranking: boolean; effort: number; gear: number };
}

// A person cranking: full torque at a standstill, falling off in a straight
// line to none at twice a comfortable CADENCE, so their power peaks, at
// `effort`, at that cadence. In the shaft's terms (src/sim/shared/shaft.ts)
// the crank is rated at `effort` W at CADENCE × gear: its torque is 2 − s,
// never less than none (a hand doesn't brake the crank, it lets go). Its
// gears take GEAR_LOSS of that torque at cadence, growing with speed, so
// unloaded it runs up to about one and a half times cadence, and let go it
// coasts to a stop in a second or two (sooner under load). It turns one way
// only, clockwise.
const CADENCE = 60; // rpm at the crank handle

const GEAR_LOSS = 0.35; // gear friction at cadence, share of the hand's torque there

const CRANK_INERTIA = 0.2; // s for its full torque to bring it up to cadence

const ratedSpeed = (p: PropsByType['crank']) => CADENCE * Math.max(1, p.gear);

const handTorque = (p: PropsByType['crank'], s: number) => (p.cranking ? Math.min(2, Math.max(0, 2 - s)) : 0);

// What reaches the shaft: the hand's torque less the gears' friction.
const shaftTorque = (p: PropsByType['crank'], s: number) => handTorque(p, s) - GEAR_LOSS * s;

const crankModel: ModelDef<PropsByType['crank']> = {
  dynamic: true,
  drivesShaft: true,
  // Nothing electrical.
  stamp() {},
  current: () => 0,
  pinCurrents: () => [],
  // The shaft's motion over dt against the load docked on it; the docked
  // load's readout, and the power and energy the hand puts in.
  respond(el, env, _r, dt) {
    if (dt === null) return false;
    const p = el.props;
    const shaft = env.shaft(el);
    const { speed, load } = spin(el.state.speed ?? 0, (s) => shaftTorque(p, s), CRANK_INERTIA, drivenBy(shaft?.load ?? null, p.effort), dt);
    // (Never quite stopping on its own: below a crawl, it's stopped.)
    el.state.speed = !p.cranking && speed < 1e-3 ? 0 : speed;
    el.state.output = handTorque(p, speed) * speed * p.effort;
    el.state.energy = (el.state.energy ?? 0) + el.state.output * dt;
    if (shaft) shaft.state.shaft = loadState(shaft.state.shaft, shaft.load, speed, load, CRANK_INERTIA, p.effort, ratedSpeed(p), dt);
    return false;
  },
  active: (r) => (r.state.speed ?? 0) > 0.05,
  readout: (r, p) => {
    const s = r.state.speed ?? 0;
    return [
      ['Crank', `${Math.round(s * CADENCE)} rpm`],
      ...(p.gear !== 1 ? ([['Shaft', `${Math.round(s * ratedSpeed(p))} rpm`]] as [string, string][]) : []),
      ['Your power', fmt(r.state.output ?? 0, 'W')],
      ['Energy put in', fmt(r.state.energy ?? 0, 'J')],
    ];
  },
};

// Its label to the side, clear of its shaft (on top) and its control (below).
// (A wind turbine's too, clear of where its wind comes in.)
export function sideLabel(_vertical: boolean, _p: unknown, rotation: number): LabelSpot {
  switch (((rotation % 360) + 360) % 360) {
    case 90:
      return [0, 34, 'middle'];
    case 180:
      return [-24, 4, 'end'];
    case 270:
      return [0, -24, 'middle'];
    default:
      return [24, 4, 'start'];
  }
}

// A wheel with a crank arm and its handle, turning while it's cranked, and
// its shaft on top.
const crankSymbol = () => `
  <path class="shaft" d="M 0 -16 V -40" />
  <circle r="16" />
  ${spinning('<path d="M 0 0 L 9 9" /><circle class="fill" cx="9" cy="9" r="3.5" /><circle class="fill" r="2.5" />')}`;

export const defs: PartDefs<'crank'> = {
  crank: {
    name: 'Hand crank',
    info: {
      summary: 'Turns a shaft by hand while you hold its control: dock a dynamo on it and light a lamp with your own effort.',
      about: {
        how: 'A handle you turn to drive a machine, through gears that speed it up: here, the shaft a dynamo or other load sits on.',
        sim: 'While you hold its control on the board, a person cranking: most torque from a standstill, falling off with speed, their power peaking at the set effort at a comfortable one turn a second. The gear ratio steps that up to the shaft’s speed. A heavier load slows it; let go and it coasts to a stop.',
        uses: 'Hand-cranked generators and torches, and feeling how much effort a load takes.',
      },
    },
    letter: 'M',
    category: 'loads',
    group: 'Mechanical',
    pins: [],
    props: {
      cranking: { label: 'Cranking', value: false, hidden: true },
      effort: { label: 'Effort', unit: 'W', value: 30, min: 1, slider: { min: 5, max: 300, step: 5 } },
      gear: { label: 'Gear ratio', unit: '×', value: 50, min: 1 },
    },
    actuator: { prop: 'cranking', momentary: true },
    // Its control below it, opposite the shaft, however it's turned.
    actuatorAt: (_vertical, _p, rotation) => turned({ x: 0, y: 34 }, rotation),
    tag: (p) => `${p.effort} W`,
    labelAt: sideLabel,
    draw: crankSymbol,
  },
};

export const models: ModelDefs<'crank'> = {
  crank: crankModel,
};
