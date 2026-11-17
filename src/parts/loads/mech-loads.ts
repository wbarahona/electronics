import { fmt } from '../../sim/shared/readout.ts';
import type { ModelDef, ModelDefs, Result } from '../../sim/models.ts';
import type { ShaftLoad } from '../../sim/shared/shaft.ts';
import type { PartDefs } from '../defs.ts';
import type { PropsByType } from '../../types.ts';

// The values each of these parts carries: what the properties panel edits
// and the simulator reads (gathered into PropsByType in src/types.ts).
export interface PartProps {
  // Mechanical loads, docked onto a motor's shaft by placing their coupling
  // (below the symbol) on its shaft end (see src/shaft.ts); the motor drives
  // them and they hold it back. `torque` is a share of the driving motor's
  // rated torque (%): a conveyor's steady pull (it holds a motor that can't
  // beat it stalled), a pump's at rated speed (it grows with speed squared).
  // `inertia` is how heavy it is to spin up, × the motor's own rotor; a
  // flywheel is all inertia.
  conveyor: { torque: number; inertia: number };
  pump: { torque: number; inertia: number };
  flywheel: { inertia: number };
}

type LoadType = keyof PartProps;

const torqueSpec = (value: number) => ({ label: 'Load torque', unit: '%', value, min: 0, slider: { min: 0, max: 200, step: 5 } });
const inertiaSpec = (value: number) => ({ label: 'Inertia', unit: '×', value, min: 0 });

// Turns while it runs, as its motor turns: the CSS shows the clockwise or
// counter-clockwise copy (.reverse), spinning about (cx, cy).
const spinning = (body: string, cx = 0, cy = 0) => {
  const turn = (to: number) =>
    `<animateTransform attributeName="transform" type="rotate" from="0 ${cx} ${cy}" to="${to} ${cx} ${cy}" dur="0.8s" repeatCount="indefinite" />`;
  return `
    <g class="when-off">${body}</g>
    <g class="when-on turn-cw">${body}${turn(360)}</g>
    <g class="when-on turn-ccw">${body}${turn(-360)}</g>`;
};

// The dashed mechanical link down to its coupling: an open ring until it's
// docked on a shaft, then filled.
const coupling = (from: number) => `
  <path class="link" d="M 0 ${from} V 40" />
  <circle class="coupling-end" cy="40" r="3" />`;

// A belt over two rollers, its dashes running while it moves.
const ROLLER = '<circle r="7" /><path d="M -7 0 H 7 M 0 -7 V 7" />';
const conveyorSymbol = () => `
  <path class="belt" d="M -26 -10 H 26 A 10 10 0 0 1 26 10 H -26 A 10 10 0 0 1 -26 -10 Z" />
  <g transform="translate(-26 0)">${spinning(ROLLER)}</g>
  <g transform="translate(26 0)">${spinning(ROLLER)}</g>
  <rect class="fill" x="-8" y="-20" width="16" height="10" rx="1" />
  ${coupling(10)}`;

// ISO 14617: a circle with a triangle pointing to its outlet; the triangle
// turns while it pumps.
const pumpSymbol = () => `
  <circle r="18" />
  ${spinning('<path d="M 0 -18 L -15.6 9 L 15.6 9 Z" />')}
  ${coupling(18)}`;

// A heavy rimmed wheel whose spokes turn.
const flywheelSymbol = () => `
  <circle class="rim" r="17" />
  ${spinning('<path d="M -15 0 H 15 M 0 -15 V 15 M -10.6 -10.6 L 10.6 10.6 M -10.6 10.6 L 10.6 -10.6" /><circle class="fill" r="3" />')}
  ${coupling(19)}`;

const label = (vertical: boolean): [number, number, 'start'] => (vertical ? [24, -30, 'start'] : [40, 4, 'start']);

export const defs: PartDefs<LoadType> = {
  conveyor: {
    name: 'Conveyor',
    letter: 'G',
    category: 'loads',
    group: 'Mechanical',
    pins: [],
    props: { torque: torqueSpec(80), inertia: inertiaSpec(2) },
    tag: (p) => `${p.torque} %`,
    labelAt: label,
    draw: conveyorSymbol,
  },
  pump: {
    name: 'Pump',
    letter: 'G',
    category: 'loads',
    group: 'Mechanical',
    pins: [],
    props: { torque: torqueSpec(80), inertia: inertiaSpec(0.5) },
    tag: (p) => `${p.torque} %`,
    labelAt: label,
    draw: pumpSymbol,
  },
  flywheel: {
    name: 'Flywheel',
    letter: 'C',
    category: 'loads',
    group: 'Mechanical',
    pins: [],
    props: { inertia: inertiaSpec(20) },
    tag: (p) => `${p.inertia}×`,
    labelAt: label,
    draw: flywheelSymbol,
  },
};

// Nothing electrical: its motor writes its motion into its state.
function loadModel<P>(shaftLoad: (p: P) => ShaftLoad, readout: (r: Result) => [string, string][]): ModelDef<P> {
  return {
    stamp() {},
    current: () => 0,
    pinCurrents: () => [],
    shaftLoad,
    active: (r) => Math.abs(r.state.shaft?.turn ?? 0) > 0.05,
    reverse: (r) => (r.state.shaft?.turn ?? 0) < 0,
    readout: (r) => (r.state.shaft ? readout(r) : [['Shaft', 'not on a motor']]),
  };
}

const speed = (r: Result): [string, string] => ['Speed', `${Math.round(Math.abs(r.state.shaft!.rpm))} rpm`];

const working = (r: Result): [string, string][] => [
  speed(r),
  ['Torque', fmt(r.state.shaft!.torque, 'N·m')],
  ['Power', fmt(r.state.shaft!.power, 'W')],
  ['Work done', fmt(r.state.shaft!.work, 'J')],
];

export const models: ModelDefs<LoadType> = {
  conveyor: loadModel((p: PropsByType['conveyor']) => ({ kind: 'conveyor', torque: p.torque / 100, inertia: p.inertia }), working),
  pump: loadModel((p: PropsByType['pump']) => ({ kind: 'pump', torque: p.torque / 100, inertia: p.inertia }), working),
  flywheel: loadModel(
    (p: PropsByType['flywheel']) => ({ kind: 'flywheel', torque: 0, inertia: p.inertia }),
    (r) => [speed(r), ['Stored energy', fmt(r.state.shaft!.stored, 'J')]],
  ),
};
