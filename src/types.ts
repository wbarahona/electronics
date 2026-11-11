// Shared shapes of the circuit data: what the editor draws, what gets copied
// and pasted, and what the simulator reads.

export interface Point {
  x: number;
  y: number;
}

export type LedColor = 'red' | 'yellow' | 'green' | 'blue' | 'white';

// The values each kind of part carries: what the properties panel edits and
// the simulator reads. Adding a part type starts here.
export interface PropsByType {
  // `charge` is the state of charge, 1 full .. 0 flat; it drains as the battery is used.
  battery: { voltage: number; internalResistance: number; maxCurrent: number; capacity: number; charge: number };
  generator: { voltage: number; frequency: number; phase: number; internalResistance: number; maxCurrent: number };
  resistor: { resistance: number; powerRating: number };
  capacitor: { capacitance: number; ratedVoltage: number };
  electrolytic: { capacitance: number; ratedVoltage: number };
  inductor: { inductance: number; resistance: number; maxCurrent: number };
  fuse: { ratedCurrent: number };
  // Positions and ambient light are percentages, 0..100.
  potentiometer: { resistance: number; position: number; powerRating: number };
  rheostat: { resistance: number; position: number; powerRating: number };
  ldr: { darkResistance: number; lightResistance: number; ambient: number; powerRating: number };
  ntc: { resistance: number; beta: number; ambient: number; powerRating: number }; // resistance at 25 °C, ambient in °C
  lamp: { ratedVoltage: number; ratedPower: number };
  led: { color: LedColor; forwardVoltage: number; maxCurrent: number };
  switch: { closed: boolean; maxCurrent: number };
  button: { closed: boolean; maxCurrent: number };
  buttonNC: { pressed: boolean; maxCurrent: number }; // conducts until pressed
  // Forward voltage is at 10 mA.
  diode: { forwardVoltage: number; maxCurrent: number; reverseVoltage: number };
  schottky: { forwardVoltage: number; maxCurrent: number; reverseVoltage: number };
  zener: { forwardVoltage: number; zenerVoltage: number; powerRating: number };
  npn: { gain: number; maxCurrent: number; powerRating: number };
  pnp: { gain: number; maxCurrent: number; powerRating: number };
  // `ratio` is primary turns : secondary turns (2 steps down by half).
  // Inductance and resistance are the primary's; the secondary's follow
  // from the ratio. Max current is the secondary's.
  transformer: { ratio: number; inductance: number; coupling: number; resistance: number; maxCurrent: number };
  // Meters: pin 0 is + (red lead), pin 1 is COM.
  voltmeter: { resistance: number; maxVoltage: number };
  ammeter: { resistance: number; maxCurrent: number };
  // The board's common 0 V. Every Ground part is the same node.
  ground: Record<string, never>;
  // Logic parts run on a built-in supply (`supply`, 5 V) referenced to Ground.
  and: LogicGate;
  or: LogicGate;
  not: LogicGate;
  nand: LogicGate;
  nor: LogicGate;
  xor: LogicGate;
  xnor: LogicGate;
  dff: LogicGate;
  jkff: LogicGate;
  tff: LogicGate;
  logicSwitch: { high: boolean; supply: number };
  clock: { frequency: number; duty: number; supply: number }; // duty in %
  probe: { supply: number };
  // Chips, wired with their own supply pins like the real parts.
  ne555: { maxCurrent: number; maxSupply: number };
  regulator: { outputVoltage: number; dropout: number; maxCurrent: number; powerRating: number };
  // On-resistance is at a gate–source voltage of 10 V.
  nmos: { thresholdVoltage: number; onResistance: number; maxCurrent: number; powerRating: number };
}

export interface LogicGate {
  supply: number;
  maxCurrent: number; // output
}

export type PartType = keyof PropsByType;

// Any part's values, when the exact type isn't known.
export type Props = PropsByType[PartType];
export type PropValue = number | string | boolean;

export interface Part<T extends PartType = PartType> {
  id: string;
  ref: string; // reference designation without the leading dash, e.g. "R1"
  type: T;
  x: number;
  y: number;
  rotation: number; // degrees clockwise, a multiple of 90
  props: PropsByType[T];
  broken: boolean;
}

// A grid point where wires meet.
export interface Joint {
  id: string;
  x: number;
  y: number;
}

// A wire end is a part's pin or a joint.
export interface PinEnd {
  part: string;
  pin: number;
  joint?: undefined;
}

export interface JointEnd {
  joint: string;
  part?: undefined;
  pin?: undefined;
}

export type End = PinEnd | JointEnd;

export interface Wire {
  id: string;
  from: End;
  to: End;
  via: Point[]; // bend points between the ends
}

export type Item = Part | Wire | Joint;

export const isWire = (x: Item): x is Wire => 'from' in x;
export const isPart = (x: Item): x is Part => 'type' in x;
export const isJoint = (x: Item): x is Joint => !isWire(x) && !isPart(x);
