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
  battery: { voltage: number; internalResistance: number; maxCurrent: number };
  generator: { voltage: number; frequency: number; phase: number; internalResistance: number; maxCurrent: number };
  resistor: { resistance: number; powerRating: number };
  lamp: { ratedVoltage: number; ratedPower: number };
  led: { color: LedColor; forwardVoltage: number; maxCurrent: number };
  switch: { closed: boolean; maxCurrent: number };
  button: { closed: boolean; maxCurrent: number };
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
