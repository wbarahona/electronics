import { formatAirflow, formatSI } from '../../units.ts';
import type { ModelDef, ModelDefs } from '../../sim/models.ts';
import { partNumberSpec, type LabelSpot, type PartDefs, type Preset } from '../defs.ts';
import type { PropsByType } from '../../types.ts';
import { motorModel, respondWith, type MotorDirection, type MotorSupply } from './motor.ts';

// The values each of these parts carries: what the properties panel edits
// and the simulator reads (gathered into PropsByType in src/types.ts).
export interface PartProps {
  // A DC cooling fan: a small motor (its `supply` is always DC) driving a
  // propeller. Air leaves along its arrow and cools the parts it reaches
  // (see cooling in src/sim/engine.ts). Its blades load it like a pump:
  // their drag grows with speed squared, so its speed, and its air, follow
  // its supply. (`direction` is always clockwise.) `size` is its frame
  // (blade diameter): with its speed it sets the air it moves, and how far
  // and wide that air reaches.
  fan: { partNumber: string; supply: MotorSupply; size: FanSize; ratedVoltage: number; ratedPower: number; ratedSpeed: number; direction: MotorDirection };
}

export type FanSize = '40 mm' | '60 mm' | '80 mm' | '120 mm';

// Each size's diameter, and the air a typical 12 V fan of that size moves at
// its usual speed. Other speeds follow the fan law: airflow ∝ speed (and ∝
// diameter³, which is why the bigger fans turn slower for the same air).
const SIZES: Record<FanSize, { diameter: number; rpm: number; flow: number }> = {
  '40 mm': { diameter: 40, rpm: 6000, flow: 12 }, // m³/h
  '60 mm': { diameter: 60, rpm: 3500, flow: 34 },
  '80 mm': { diameter: 80, rpm: 2500, flow: 60 },
  '120 mm': { diameter: 120, rpm: 1500, flow: 110 },
};

// Common 12 V fans by frame code (size × thickness in mm), with their usual
// speed and power.
const FAN_PRESETS: Preset<PropsByType['fan']>[] = [
  { code: '4010 (40 mm)', note: '40 × 40 × 10 mm, 12 V, 6000 rpm, ~12 m³/h', values: { size: '40 mm', ratedVoltage: 12, ratedPower: 0.8, ratedSpeed: 6000 } },
  { code: '6025 (60 mm)', note: '60 × 60 × 25 mm, 12 V, 3500 rpm, ~34 m³/h', values: { size: '60 mm', ratedVoltage: 12, ratedPower: 1.2, ratedSpeed: 3500 } },
  { code: '8025 (80 mm)', note: '80 × 80 × 25 mm, 12 V, 2500 rpm, ~60 m³/h', values: { size: '80 mm', ratedVoltage: 12, ratedPower: 1.5, ratedSpeed: 2500 } },
  { code: '12025 (120 mm)', note: '120 × 120 × 25 mm, 12 V, 1500 rpm, ~110 m³/h', values: { size: '120 mm', ratedVoltage: 12, ratedPower: 2.4, ratedSpeed: 1500 } },
];

// The air it moves at its rated speed (m³/h).
const ratedFlow = (p: PropsByType['fan']) => SIZES[p.size].flow * (p.ratedSpeed / SIZES[p.size].rpm);

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
// they don't wobble), and an arrow for the way the air goes. Round it, the air
// it moves, drawn faintly while it runs and it's selected or the Thermal view
// is on: a cone in front, and behind it the half circle it draws air from,
// both as big as its size reaches (see coolingAt in src/sim/engine.ts).
const BLADES = `
    <path d="M 0 0 C -2 -6 2 -13 6 -14 C 7 -9 4 -3 0 0 Z M 0 0 C 6 1 11 7 9 11 C 4 11 0 5 0 0 Z M 0 0 C -4 4 -12 5 -14 2 C -11 -2 -5 -2 0 0 Z" />
    <circle r="2" />`;

function fanSymbol(p: PropsByType['fan']) {
  const k = SIZES[p.size].diameter / 80;
  const r = 60 * k;
  return `
  <path class="airflow" d="M -12 -22 L ${-140 * k} ${-220 * k} Q 0 ${-250 * k} ${140 * k} ${-220 * k} L 12 -22 Z" />
  <path class="airflow intake" d="M ${-r} 0 A ${r} ${r} 0 0 0 ${r} 0 Z" />
  <path d="M -40 0 H -18 M 18 0 H 40 M 0 -19 V -32" />
  <path class="fill" d="M 0 -37 L -4 -30 H 4 Z" />
  <circle r="18" />
  <g class="fan-blades when-off">${BLADES}</g>
  <g class="fan-blades when-on">${BLADES}
    <animateTransform attributeName="transform" type="rotate" from="0 0 0" to="360 0 0" dur="0.4s" repeatCount="indefinite" />
  </g>`;
}

export const defs: PartDefs<'fan'> = {
  fan: {
    name: 'Fan',
    letter: 'M',
    us: { letter: 'B' },
    category: 'loads',
    group: 'Cooling',
    pins: [{ x: -40, y: 0 }, { x: 40, y: 0 }], // +, −
    props: {
      partNumber: partNumberSpec(FAN_PRESETS, '8025 (80 mm)'),
      supply: { label: 'Supply', value: 'DC', options: ['DC'], hidden: true },
      size: { label: 'Size', value: '80 mm', options: ['40 mm', '60 mm', '80 mm', '120 mm'] },
      ratedVoltage: { label: 'Rated voltage', unit: 'V', value: 12, min: 0.1 },
      ratedPower: { label: 'Rated power', unit: 'W', value: 1.5, min: 0.01 },
      ratedSpeed: { label: 'Rated speed', unit: 'rpm', value: 2500, min: 1 },
      direction: { label: 'Direction', value: 'Clockwise', options: ['Clockwise'], hidden: true },
    },
    presets: FAN_PRESETS,
    tag: (p) => `${formatSI(p.ratedVoltage, 'V')} ${p.size}`,
    labelAt: fanLabel,
    draw: fanSymbol,
  },
};

export const models: ModelDefs<'fan'> = {
  // The DC motor's model driving its blades, which take its rated torque at
  // rated speed; its air follows its speed.
  fan: {
    ...(motorModel as unknown as ModelDef<PropsByType['fan']>),
    respond: respondWith({ kind: 'pump', torque: 1, inertia: 0.5 }) as unknown as ModelDef<PropsByType['fan']>['respond'],
    // Its motor sits in its own air, so runs barely warm (a motor's windings
    // run 60 °C up).
    thermal: { ...motorModel.thermal!, rise: 15 } as unknown as ModelDef<PropsByType['fan']>['thermal'],
    airflow: (r, p) => ({ flow: ratedFlow(p) * Math.abs(r.state.speed ?? 0), diameter: SIZES[p.size].diameter }),
    readout: (r, p) => [
      ...(motorModel.readout as unknown as ModelDef<PropsByType['fan']>['readout'])(r, p),
      ['Airflow', formatAirflow(ratedFlow(p) * Math.abs(r.state.speed ?? 0))],
    ],
  },
};
