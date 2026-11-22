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
  // A wind turbine, turned by the air of the fans blowing into its face
  // (from below, along its local up; see the air in src/sim/engine.ts). Its
  // shaft (on top) drives a load docked on it, such as a dynamo (see
  // src/shaft.ts). `diameter` is its rotor's (mm); `gear` steps the rotor's
  // speed up to the shaft's.
  turbine: { diameter: number; gear: number };
}

// The wind's power through its rotor is ½·ρ·A·v³, and it takes a share of
// that, its power coefficient: most, CP_MAX, when its blade tips run TSR
// times as fast as the wind (no turbine can take more than the Betz limit,
// 16/27); less turning slower, and none turning twice that fast (where it
// runs away to with nothing to drive). So its torque falls in a straight
// line with speed, from a standstill (it starts by itself) to that runaway
// speed, and grows with the wind squared: twice the wind, four times the
// torque, eight times the power. In the shaft's terms (src/sim/shared/
// shaft.ts) it's rated at its best in a REF_WIND wind: in a wind u times
// that, its torque at speed s is 2u² − u·s.
const RHO = 1.2; // kg/m³, air
const CP_MAX = 0.35; // a small three-bladed rotor at its best
const TSR = 4; // tip speed over wind speed at its best
const REF_WIND = 5; // m/s
const TURBINE_INERTIA = 0.5; // s for its rated torque to bring it to rated speed

const rated = (p: PropsByType['turbine']) => {
  const radius = p.diameter / 2000; // m
  const area = Math.PI * radius ** 2;
  const omega = (TSR * REF_WIND) / radius; // rad/s of the rotor
  return { area, rotorRpm: (omega * 60) / (2 * Math.PI), power: 0.5 * RHO * area * REF_WIND ** 3 * CP_MAX };
};

// The shaft's speed against the rotor's.
const gearOf = (p: PropsByType['turbine']) => Math.max(1, p.gear);

const turbineModel: ModelDef<PropsByType['turbine']> = {
  dynamic: true,
  drivesShaft: true,
  rotor: (p) => p.diameter,
  // Nothing electrical.
  stamp() {},
  current: () => 0,
  pinCurrents: () => [],
  // The shaft's motion over dt in the wind it feels, against the load docked
  // on it; the docked load's readout, and the power it takes from the wind
  // (what's left behind it is its wake).
  respond(el, env, _r, dt) {
    if (dt === null) return false;
    const p = el.props;
    const { area, rotorRpm, power } = rated(p);
    const wind = env.wind(el);
    const u = wind / REF_WIND;
    const torque = (s: number) => 2 * u * u - u * s;
    const shaft = env.shaft(el);
    const { speed, load } = spin(el.state.speed ?? 0, torque, TURBINE_INERTIA, drivenBy(shaft?.load ?? null, power), dt);
    el.state.speed = !wind && speed < 1e-3 ? 0 : speed;
    el.state.wind = wind;
    el.state.output = Math.max(0, torque(speed) * speed * power);
    const inWind = 0.5 * RHO * area * wind ** 3;
    el.state.cp = inWind > 1e-9 ? el.state.output / inWind : 0;
    el.state.energy = (el.state.energy ?? 0) + el.state.output * dt;
    if (shaft) shaft.state.shaft = loadState(shaft.state.shaft, shaft.load, speed, load, TURBINE_INERTIA, power, rotorRpm * gearOf(p), dt);
    return false;
  },
  active: (r) => (r.state.speed ?? 0) > 0.02,
  readout: (r, p) => {
    const s = r.state.speed ?? 0;
    const { area, rotorRpm } = rated(p);
    const wind = r.state.wind ?? 0;
    return [
      ['Wind', `${wind.toFixed(1)} m/s`],
      ['Rotor', `${Math.round(s * rotorRpm)} rpm`],
      ...(gearOf(p) !== 1 ? ([['Shaft', `${Math.round(s * rotorRpm * gearOf(p))} rpm`]] as [string, string][]) : []),
      ['Wind power', fmt(0.5 * RHO * area * wind ** 3, 'W')],
      ['Power taken', fmt(r.state.output ?? 0, 'W')],
      // (No turbine takes more than 16/27 of it: the Betz limit.)
      ['Share taken (Betz limit 59 %)', `${Math.round((r.state.cp ?? 0) * 100)} %`],
    ];
  },
};

// Three blades round a hub, turning while the wind turns it; its shaft on
// top, and an arrow below where the wind comes in.
const BLADE = 'M 0 0 Q 5 -8 0 -17 Q -5 -8 0 0 Z';
const turbineSymbol = () => `
  <path class="shaft" d="M 0 -17 V -40" />
  ${spinning(`${[0, 120, 240].map((a) => `<path class="fill" d="${BLADE}" transform="rotate(${a})" />`).join('')}<circle class="fill" r="3" />`)}
  <path class="link" d="M 0 38 V 22 M -4 27 L 0 22 L 4 27" />`;

export const defs: PartDefs<'turbine'> = {
  turbine: {
    name: 'Wind turbine',
    info: {
      summary: 'Turned by a fan’s air blowing into it: dock a dynamo on it and see how little of the fan’s power comes back.',
      about: {
        how: 'Blades that the wind turns, driving a generator. The wind’s power grows with its speed cubed; a turbine takes a share of it, never more than 59 % (the Betz limit), most when its blade tips run about four times as fast as the wind.',
        sim: 'It catches the air of the fans blowing into its face (from below its symbol), as their cooling does: strongest close in and on a fan’s axis. Its torque grows with the wind squared and falls with its speed. Its shaft drives a load docked on it; the air behind it is slowed by what it took, so it shades parts and turbines behind it.',
        uses: 'Wind power, and seeing why a fan can’t power itself: the turbine gets back only a small share of what the fan uses.',
      },
      example: 'dynamos',
    },
    letter: 'M',
    category: 'loads',
    group: 'Mechanical',
    pins: [],
    props: {
      diameter: { label: 'Rotor diameter', unit: 'mm', value: 120, min: 10 },
      gear: { label: 'Gear ratio', unit: '×', value: 1, min: 1 },
    },
    tag: (p) => `${p.diameter} mm`,
    labelAt: sideLabel,
    draw: turbineSymbol,
  },
};

export const models: ModelDefs<'turbine'> = {
  turbine: turbineModel,
};
