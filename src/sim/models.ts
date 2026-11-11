

import type { PartType, Props, PropsByType } from '../types.ts';
import { MODEL_DEFS } from '../parts/index.ts';

// A solved part. v, i, p are instantaneous (v and i between pins 0 and 1;
// `pins` has the current into the part at every pin, `pinV` each pin's
// voltage against the circuit's reference); vavg, iavg, vrms, irms, pavg
// are running averages; `ac` is set when an AC source drives the circuit, in
// which case readouts show RMS and average values.
export interface Result {
  v: number;
  i: number;
  p: number;
  vavg: number;
  iavg: number;
  vrms: number;
  irms: number;
  pavg: number;
  heat: number; // 1 = at its rating; fails past the model's thermal limit
  load: number; // how hard it's driven right now, 1 = at its rating
  level?: number; // how full an energy store is, 0..1
  ac: boolean;
  pins: number[];
  pinV: number[];
  extraRms: number[]; // RMS of the model's extras(), in the same order
  state: PartState; // what the part is sensing (light, temperature)
}

// What a part remembers between steps and rebuilds.
export interface PartState {
  heat?: number;
  vd?: number; // last diode voltage, the Newton starting point
  v?: number; // capacitor voltage at the end of the last step
  i?: number; // inductor current at the end of the last step
  light?: number; // light an LDR is getting, 0..1
  rise?: number; // a thermistor's temperature above ambient, K
  ins?: boolean[]; // a logic part's input levels and output(s)
  outs?: boolean[];
  count?: number; // a counter's count; a decoder's latched value
  needle?: number; // a panel meter's needle, 0..1 of full scale
  out?: boolean;
  edges?: number; // rising clock edges a flip-flop has seen
  edgeAt?: number; // a 555's last rising edge (s) and the period it measured
  period?: number;
  mode?: 'regulating' | 'dropout'; // a regulator's region at the last iteration
  vbe?: number; // transistor junction voltages at the last iteration
  vbc?: number;
  vgs?: number;
  vds?: number;
  segV?: number[]; // a display's segment junction voltages at the last iteration
  energized?: boolean; // a relay's coil has pulled in; a sounder is sounding
  speed?: number; // a motor's speed, 1 = rated (negative: turning backwards)
  temp?: number; // a heater's element temperature, 1 = at rated power
  crossAt?: number; // a speaker's last upward zero crossing (s), the period
  span?: number; //   it measured, and its signal (AC part) at the last step
  last?: number;
  struck?: boolean; // a fluorescent tube's arc is lit; its filaments' warmth
  filament?: number; //   0..1 and the arc current, smoothed (A)
  arc?: number;
  glow?: number; // a starter's smoothed voltage (V) and whether it's glowing
  glowing?: boolean;
  windings?: number[]; // a motor's winding currents at the end of the last step
  broken?: boolean;
  avg?: { v: [number, number]; i: [number, number]; v2: [number, number]; i2: [number, number]; p: number; x2: number[] };
  i1?: number; // transformer winding currents at the end of the last step
  i2?: number;
}

// A part as the engine sees it.
export interface Element<P = Props> {
  id: string;
  props: P;
  model: Model;
  broken: boolean;
  open: boolean; // failed and now conducting nothing
  nodes: number[]; // net index of each pin
  branch: number; // its own current unknown, or -1
  state: PartState;
}

// Adds a part's equations to the system for one Newton iteration.
export interface Stamper {
  t: number; // simulated time at the end of this step
  dt: number;
  converged: boolean;
  v(n: number): number; // present guess of a net's voltage
  x(k: number): number; // present guess of a branch current
  conductance(a: number, c: number, g: number): void;
  current(a: number, c: number, i: number): void;
  voltage(a: number, c: number, k: number, volts: number): void;
  idle(k: number): void;
  draw(node: number, terms: [number, number][], i0: number): void;
}

export type Lines = [string, string][];

// A tone for the speakers.
export interface Sound {
  frequency: number;
  wave: OscillatorType;
  level: number;
}

// What a part can sense around it.
export interface Env {
  readonly time: number; // simulated time, s
  light(el: Element): number; // light reaching it from glowing parts, 0..1+
}

export interface Thermal<P> {
  load(r: Result, p: P): number;
  tau: number;
  limit: number;
}

// One part type's model, checked against its values P.
export interface ModelDef<P> {
  stamp(el: Element<P>, s: Stamper): void;
  current(el: Element<P>, s: Stamper): number;
  branches?(p: P): number;
  nonlinear?: boolean;
  dynamic?: boolean;
  alternating?: boolean;
  accept?(el: Element<P>, s: Stamper): void;
  readout(r: Result, p: P): Lines;
  brightness?(r: Result, p: P): number;
  maxStep?(p: P): number;
  thermal?: Thermal<P>;
  failure?: { label: string; open: boolean; display?: string }; // display: what a broken meter shows
  level?(r: Result, p: P): number;
  drain?(el: Element<P>, r: Result, dt: number): boolean;
  pinCurrents?(el: Element<P>, s: Stamper): number[];
  groups?: number[][] | ((p: P) => number[][]);
  active?(r: Result): boolean;
  segments?(r: Result, p: P): number[];
  sound?(r: Result, p: P): Sound | null;
  needle?(r: Result, p: P): number;
  extras?(r: Result): number[];
  reading?(r: Result, p: P): string;
  power?(el: Element<P>, s: Stamper): number;
  respond?(el: Element<P>, env: Env, r: Result, dt: number | null): boolean | void;
  grounded?: boolean;
  groundTie?: boolean;
}

// A model seen by code that handles any part type.
export type Model = ModelDef<Props>;

// Models for the part types K, each checked against its values.
export type ModelDefs<K extends PartType> = { [T in K]: ModelDef<PropsByType[T]> };

// Every part type's model (see src/parts).
export const MODELS = MODEL_DEFS as unknown as Record<PartType, Model>;
