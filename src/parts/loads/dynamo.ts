import { fmt } from '../../sim/shared/readout.ts';
import { formatSI } from '../../units.ts';
import type { Element, ModelDef, ModelDefs } from '../../sim/models.ts';
import type { LabelSpot, PartDefs } from '../defs.ts';
import type { PropsByType } from '../../types.ts';
import { coupling } from './mech-loads.ts';
import { ROTOR } from './motor.ts';

// The values each of these parts carries: what the properties panel edits
// and the simulator reads (gathered into PropsByType in src/types.ts).
export interface PartProps {
  // A DC generator, docked on a motor's shaft by placing its coupling (below
  // the symbol) on the shaft's end (see src/shaft.ts). At `ratedSpeed` (rpm)
  // it gives `ratedVoltage` (V) at its terminals while delivering
  // `ratedPower` (W). `inertia` is its rotor's, × the motor's.
  dynamo: { ratedVoltage: number; ratedPower: number; ratedSpeed: number; inertia: number };
}

// A permanent-magnet dynamo: an EMF in proportion to its speed, behind its
// armature resistance, sized so the terminal voltage sags by DROP of its
// rated voltage at rated current. Turned clockwise its + terminal is
// positive; turned the other way, its polarity reverses. What its circuit
// draws brakes the motor driving it (src/sim/shared/shaft.ts): the power it
// delivers, plus what its armature turns into heat, comes off the shaft. It
// doesn't run as a motor: a stopped dynamo with a supply across it is just its
// armature resistance.
const DROP = 0.1;

const rated = (p: PropsByType['dynamo']) => {
  const current = p.ratedPower / p.ratedVoltage;
  return { current, r: (DROP * p.ratedVoltage) / current, emf: p.ratedVoltage * (1 + DROP) };
};

type DynamoEl = Element<PropsByType['dynamo']>;

// Its EMF at the speed its motor turns it (none off a shaft).
const emfOf = (el: DynamoEl) => (rated(el.props).emf * (el.state.shaft?.rpm ?? 0)) / el.props.ratedSpeed;

const dynamoModel: ModelDef<PropsByType['dynamo']> = {
  dynamic: true,
  stamp(el, s) {
    const { r } = rated(el.props);
    el.state.emf = emfOf(el);
    s.conductance(el.nodes[0], el.nodes[1], 1 / r);
    s.current(el.nodes[0], el.nodes[1], -el.state.emf / r);
  },
  current: (el, s) => (s.v(el.nodes[0]) - s.v(el.nodes[1]) - (el.state.emf ?? 0)) / rated(el.props).r,
  // The power its circuit takes from its EMF, at the motor's rated speed: as
  // it grows with speed squared for a resistive circuit, from now's power over
  // the speed squared. (Kept as it is while the shaft barely turns.)
  respond(el, _env, r, dt) {
    if (dt === null) return false;
    const turn = el.state.shaft?.turn ?? 0;
    const power = (el.state.emf ?? 0) * -r.i;
    if (Math.abs(turn) > 0.02) el.state.drag = power / (turn * turn);
    else if (!el.state.shaft) el.state.drag = 0;
    return false;
  },
  shaftLoad: (p, state) => ({ kind: 'generator', torque: 0, inertia: p.inertia, power: state.drag ?? 0 }),
  active: (r) => Math.abs(r.state.shaft?.turn ?? 0) > 0.05,
  reverse: (r) => (r.state.shaft?.turn ?? 0) < 0,
  readout: (r) => {
    const out = Math.max(0, -r.p); // what it delivers to its circuit
    const shaft = r.state.shaft;
    const input = shaft?.power ?? 0;
    return [
      shaft ? ['Speed', `${Math.round(Math.abs(shaft.rpm))} rpm`] : ['Shaft', 'not on a shaft'],
      ['Voltage', fmt(Math.abs(r.v), 'V')],
      ['Current', fmt(Math.abs(r.i), 'A')],
      ['Power out', fmt(out, 'W')],
      ...(shaft
        ? ([
            ['Shaft power', fmt(input, 'W')],
            ['Efficiency', input > 1e-6 && out > 0 ? `${Math.round((100 * out) / input)} %` : '–'],
          ] as [string, string][])
        : []),
    ];
  },
  // Its armature overheats from sustained overcurrent (a short across it at
  // speed); only its losses warm what's around it.
  thermal: {
    load: (r, p) => Math.abs(r.i) / rated(p).current,
    tau: 8,
    limit: 2,
    rise: 60, // °C at its rating: armature
    heatShare: DROP,
  },
  failure: { label: 'burnt out', open: true },
};

// Its label clear of its coupling (opposite it) and its terminals.
function dynamoLabel(_vertical: boolean, _p: PropsByType['dynamo'], rotation: number): LabelSpot {
  switch (((rotation % 360) + 360) % 360) {
    case 90: // coupling to the left
      return [26, 4, 'start'];
    case 180: // coupling above
      return [0, 34, 'middle'];
    case 270: // coupling to the right
      return [-26, 4, 'end'];
    default:
      return [0, -26, 'middle'];
  }
}

// DIN EN 60617: a circle with G and = (a DC generator), its terminals left
// (+) and right, its coupling below.
const dynamoSymbol = (letters: string) => `
  <path d="M -40 0 H -18 M 18 0 H 40" />
  <circle r="18" />
  <text class="meter-letter upright" y="2" text-anchor="middle" data-y="-2"${letters.length > 1 ? ' style="font-size: 11px"' : ''}>${letters}</text>
  <text class="sym-text upright" y="12" text-anchor="middle" data-y="9">=</text>
  <text class="sym-text" x="-30" y="-6" text-anchor="middle">+</text>
  ${ROTOR}
  ${coupling(18)}`;

export const defs: PartDefs<'dynamo'> = {
  dynamo: {
    name: 'Dynamo',
    info: {
      summary: 'A DC generator docked on a motor’s shaft: it makes a voltage from the speed it’s turned at, and what you draw from it brakes the motor.',
      about: {
        how: 'Turns rotation into electricity: a coil turning in a magnet’s field makes a voltage in proportion to its speed. The current it delivers pushes back against whatever turns it.',
        sim: 'An EMF in proportion to its speed behind its armature resistance (its voltage sags a tenth at rated current), docked on a motor’s shaft by placing it there. The power it delivers, and its losses, come off the motor’s shaft, so loading it slows the motor and raises its current. Reversing the motor reverses its polarity. It doesn’t run as a motor.',
        uses: 'Motor–generator sets, bicycle dynamos, tachogenerators (a voltage that measures speed), and seeing where the energy goes.',
      },
    },
    letter: 'G',
    // US (IEEE 315): the circle reads GEN.
    us: { draw: () => dynamoSymbol('GEN') },
    category: 'loads',
    group: 'Motors',
    pins: [{ x: -40, y: 0 }, { x: 40, y: 0 }],
    props: {
      ratedVoltage: { label: 'Rated voltage', unit: 'V', value: 12, min: 0.1 },
      ratedPower: { label: 'Rated power', unit: 'W', value: 10, min: 0.01 },
      ratedSpeed: { label: 'Rated speed', unit: 'rpm', value: 3000, min: 1 },
      inertia: { label: 'Inertia', unit: '×', value: 1, min: 0 },
    },
    tag: (p) => `${formatSI(p.ratedVoltage, 'V')} ${formatSI(p.ratedPower, 'W')}`,
    labelAt: dynamoLabel,
    draw: () => dynamoSymbol('G'),
  },
};

export const models: ModelDefs<'dynamo'> = {
  dynamo: dynamoModel,
};
