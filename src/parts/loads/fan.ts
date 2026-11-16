import { formatSI } from '../../units.ts';
import type { ModelDef, ModelDefs } from '../../sim/models.ts';
import type { LabelSpot, PartDefs } from '../defs.ts';
import type { PropsByType } from '../../types.ts';
import { motorModel, type MotorSupply } from './motor.ts';

// The values each of these parts carries: what the properties panel edits
// and the simulator reads (gathered into PropsByType in src/types.ts).
export interface PartProps {
  // A DC cooling fan: a small motor (its `supply` is always DC) driving a
  // propeller. Air leaves along its arrow and cools the parts it reaches
  // (see cooling in src/sim/engine.ts).
  fan: { supply: MotorSupply; ratedVoltage: number; ratedPower: number };
}

// Opposite the airflow arrow, wherever the fan is turned.
function fanLabel(_vertical: boolean, _p: unknown, rotation: number): LabelSpot {
  switch (((rotation % 360) + 360) % 360) {
    case 90:
      return [-26, 4, 'end'];
    case 180:
      return [0, -28, 'middle'];
    case 270:
      return [26, 4, 'start'];
    default:
      return [0, 38, 'middle'];
  }
}

// A fan: the motor circle with three blades, which turn about the hub while it
// runs (spun by animateTransform about the origin, as the motor's rotor, so
// they don't wobble), and an arrow for the way the air goes. In front of it, the air it moves: a cone,
// drawn faintly while it runs and it's selected or the Thermal view is on.
const BLADES = `
    <path d="M 0 0 C -2 -6 2 -13 6 -14 C 7 -9 4 -3 0 0 Z M 0 0 C 6 1 11 7 9 11 C 4 11 0 5 0 0 Z M 0 0 C -4 4 -12 5 -14 2 C -11 -2 -5 -2 0 0 Z" />
    <circle r="2" />`;

const fanSymbol = () => `
  <path class="airflow" d="M -12 -22 L -140 -220 Q 0 -250 140 -220 L 12 -22 Z" />
  <path d="M -40 0 H -18 M 18 0 H 40 M 0 -19 V -32" />
  <path class="fill" d="M 0 -37 L -4 -30 H 4 Z" />
  <circle r="18" />
  <g class="fan-blades when-off">${BLADES}</g>
  <g class="fan-blades when-on">${BLADES}
    <animateTransform attributeName="transform" type="rotate" from="0 0 0" to="360 0 0" dur="0.4s" repeatCount="indefinite" />
  </g>`;

export const defs: PartDefs<'fan'> = {
  fan: {
    name: 'Fan',
    letter: 'M',
    us: { letter: 'B' },
    category: 'loads',
    group: 'Cooling',
    pins: [{ x: -40, y: 0 }, { x: 40, y: 0 }], // +, −
    props: {
      supply: { label: 'Supply', value: 'DC', options: ['DC'], hidden: true },
      ratedVoltage: { label: 'Rated voltage', unit: 'V', value: 12, min: 0.1 },
      ratedPower: { label: 'Rated power', unit: 'W', value: 1.5, min: 0.01 },
    },
    tag: (p) => `${formatSI(p.ratedVoltage, 'V')} ${formatSI(p.ratedPower, 'W')}`,
    labelAt: fanLabel,
    draw: fanSymbol,
  },
};

export const models: ModelDefs<'fan'> = {
  // The DC motor's model; at full speed it moves its full airflow.
  fan: {
    ...(motorModel as unknown as ModelDef<PropsByType['fan']>),
    airflow: (r) => Math.min(1, Math.abs(r.state.speed ?? 0)),
  },
};
