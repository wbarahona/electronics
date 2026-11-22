import { fmt } from '../../sim/shared/readout.ts';
import { drivenBy, loadState, spin } from '../../sim/shared/shaft.ts';
import type { ModelDef, ModelDefs } from '../../sim/models.ts';
import type { PartDefs } from '../defs.ts';
import type { PropsByType } from '../../types.ts';
import { sideLabel } from './crank.ts';
import { spinning } from './mech-loads.ts';

// The values each of these parts carries: what the properties panel edits
// and the simulator reads (gathered into PropsByType in src/types.ts).
export interface PartProps {
  // A water turbine: `flow` (L/s) falls `head` (m) and drives its runner,
  // `diameter` (mm) across; its shaft (on top) drives a load docked on it,
  // such as a dynamo (see src/shaft.ts). `gear` steps the runner's speed up
  // to the shaft's. Flow and head can be changed while it runs.
  waterTurbine: { flow: number; head: number; diameter: number; gear: number };
}

// An impulse wheel (Pelton-style): a jet at √(2·g·head) hits buckets on
// the runner and pushes them with a force growing with how much faster than
// them it goes, so its torque falls in a straight line from a standstill to
// none when the buckets run as fast as the jet. Its power peaks with them at
// half the jet's speed, where it delivers EFFICIENCY of the water's power,
// ρ·g·flow·head. In the shaft's terms (src/sim/shared/shaft.ts) it's rated
// at that best speed with REF_FLOW of water: with q times that, its torque at
// speed s is q·(2 − s), as a crank's is. Its speed is kept in rad/s, so it
// carries on smoothly when its flow, head or size change.
const G = 9.81; // m/s²
const RHO = 1000; // kg/m³, water
const EFFICIENCY = 0.85;
const REF_FLOW = 1; // L/s
const RUNNER_INERTIA = 1; // s for its rated torque to bring it to rated speed

const rated = (p: PropsByType['waterTurbine']) => {
  const jet = Math.sqrt(2 * G * Math.max(0, p.head)); // m/s
  const radius = p.diameter / 2000; // m
  const omega = jet / 2 / radius; // rad/s of the runner at its best
  return { jet, omega, power: Math.max(1e-9, EFFICIENCY * RHO * G * (REF_FLOW / 1000) * p.head) };
};

// The water's power (W).
const waterPower = (p: PropsByType['waterTurbine']) => RHO * G * (Math.max(0, p.flow) / 1000) * Math.max(0, p.head);

const gearOf = (p: PropsByType['waterTurbine']) => Math.max(1, p.gear);

const rpm = (omega: number) => (omega * 60) / (2 * Math.PI);

const waterTurbineModel: ModelDef<PropsByType['waterTurbine']> = {
  dynamic: true,
  drivesShaft: true,
  // Nothing electrical.
  stamp() {},
  current: () => 0,
  pinCurrents: () => [],
  // The runner's motion over dt against the load docked on it; the docked
  // load's readout, and the power it takes from the water.
  respond(el, env, _r, dt) {
    if (dt === null) return false;
    const p = el.props;
    const { omega, power } = rated(p);
    if (p.head <= 0 || omega <= 0) {
      el.state.omega = 0;
      el.state.output = 0;
      return false;
    }
    const q = Math.max(0, p.flow) / REF_FLOW;
    const torque = (s: number) => q * (2 - s);
    const shaft = env.shaft(el);
    const { speed, load } = spin((el.state.omega ?? 0) / omega, torque, RUNNER_INERTIA, drivenBy(shaft?.load ?? null, power), dt);
    const s = !q && speed < 1e-3 ? 0 : Math.max(0, speed);
    el.state.omega = s * omega;
    el.state.speed = s;
    el.state.output = Math.max(0, torque(s) * s * power);
    el.state.energy = (el.state.energy ?? 0) + el.state.output * dt;
    if (shaft) shaft.state.shaft = loadState(shaft.state.shaft, shaft.load, s, load, RUNNER_INERTIA, power, rpm(omega) * gearOf(p), dt);
    return false;
  },
  active: (r) => (r.state.speed ?? 0) > 0.02,
  readout: (r, p) => {
    const runner = rpm(r.state.omega ?? 0);
    const water = waterPower(p);
    const taken = r.state.output ?? 0;
    return [
      ['Water power', fmt(water, 'W')],
      ['Runner', `${Math.round(runner)} rpm`],
      ...(gearOf(p) !== 1 ? ([['Shaft', `${Math.round(runner * gearOf(p))} rpm`]] as [string, string][]) : []),
      ['Power taken', fmt(taken, 'W')],
      ['Efficiency', water > 1e-9 ? `${Math.round((100 * taken) / water)} %` : '–'],
    ];
  },
};

// A runner with buckets round its rim, turning while the water drives it;
// its shaft on top, and the water's jet coming in from the left.
const BUCKETS = Array.from({ length: 8 }, (_, k) => `<path d="M 0 -15 V -10" transform="rotate(${k * 45})" />`).join('');
const waterTurbineSymbol = () => `
  <path class="shaft" d="M 0 -15 V -40" />
  ${spinning(`<circle r="15" />${BUCKETS}<circle class="fill" r="3" />`)}
  <path class="link" d="M -40 11 H -16 M -21 7 L -16 11 L -21 15" />`;

export const defs: PartDefs<'waterTurbine'> = {
  waterTurbine: {
    name: 'Water turbine',
    info: {
      summary: 'Falling water turns its shaft: dock a dynamo on it and change the flow while it runs, as at a hydro power station.',
      about: {
        how: 'Water falling from a height turns a runner, driving a generator. The water’s power is its flow times the height it falls times g (about 9.8 W per litre a second per metre); a good turbine turns most of it into shaft power.',
        sim: 'An impulse wheel: a jet at the speed the head gives hits the buckets, its torque falling with the runner’s speed, its power peaking (at 85 % of the water’s) with the buckets at half the jet’s speed. Change the flow and head while it runs. Its shaft drives a load docked on it; a heavier load slows it.',
        uses: 'Hydro power, from micro-hydro to dams, and seeing how flow and height make power.',
      },
      example: 'dynamos',
    },
    letter: 'M',
    category: 'loads',
    group: 'Mechanical',
    pins: [],
    props: {
      flow: { label: 'Flow', unit: 'L/s', value: 1, min: 0, slider: { min: 0, max: 5, step: 0.1 } },
      head: { label: 'Head (height of fall)', unit: 'm', value: 2, min: 0, slider: { min: 0.5, max: 20, step: 0.5 } },
      diameter: { label: 'Runner diameter', unit: 'mm', value: 100, min: 10 },
      gear: { label: 'Gear ratio', unit: '×', value: 5, min: 1 },
    },
    tag: (p) => `${p.flow} L/s ${p.head} m`,
    labelAt: sideLabel,
    draw: waterTurbineSymbol,
  },
};

export const models: ModelDefs<'waterTurbine'> = {
  waterTurbine: waterTurbineModel,
};
