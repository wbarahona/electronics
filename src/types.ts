// Shared shapes of the circuit data: what the editor draws, what gets copied
// and pasted, and what the simulator reads.

export interface Point {
  x: number;
  y: number;
}

export type LedColor = 'red' | 'yellow' | 'green' | 'blue' | 'white';
export type LampColor = 'warm' | LedColor; // warm: a plain filament's yellow

// What a meter measures, set like the knob on a real one: the DC (average)
// value, or the true RMS of the AC part only.
export type MeterMode = 'DC' | 'AC';

export type MotorSupply = 'DC' | 'AC 1~' | 'AC 3~';

// The values each kind of part carries: what the properties panel edits and
// the simulator reads. Adding a part type starts here.
export interface PropsByType {
  // `charge` is the state of charge, 1 full .. 0 flat; it drains as the battery is used.
  battery: { voltage: number; internalResistance: number; maxCurrent: number; capacity: number; charge: number };
  generator: { voltage: number; frequency: number; phase: number; internalResistance: number; maxCurrent: number };
  // Supply rails: one terminal, held against the board's 0 V (Ground).
  rail: { voltage: number; maxCurrent: number };
  phase: { voltage: number; frequency: number; phase: number; maxCurrent: number }; // voltage is RMS
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
  lamp: { color: LampColor; ratedVoltage: number; ratedPower: number };
  // A panel indicator (pilot) lamp: a lamp behind a coloured lens.
  pilot: { color: LampColor; ratedVoltage: number; ratedPower: number };
  // Red, amber and green lamps stacked on a common pin (pins R, A, G, common).
  stackLight: { ratedVoltage: number; ratedPower: number };
  led: { color: LedColor; forwardVoltage: number; maxCurrent: number };
  // Eight LEDs (segments a–g and the dot) sharing one common pin. Forward
  // voltage and max current are per segment.
  sevenSeg: { color: LedColor; common: 'cathode' | 'anode'; forwardVoltage: number; maxCurrent: number };
  // Ten LEDs in a row on a common pin; max current is per segment.
  barGraph: { color: LedColor; common: 'cathode' | 'anode'; forwardVoltage: number; maxCurrent: number };
  // Red and green LEDs back to back: red lights with pin 0 positive, green
  // with pin 1 positive.
  bicolorLed: { redVoltage: number; greenVoltage: number; maxCurrent: number };
  // Red, green and blue LEDs in one package (pins R, G, B, then common);
  // maxCurrent is per colour. Mixed, they make any colour.
  rgbLed: { common: 'cathode' | 'anode'; redVoltage: number; greenVoltage: number; blueVoltage: number; maxCurrent: number };
  switch: { closed: boolean; maxCurrent: number };
  // Changeover (two-way, stairway) switch: common to throw 1, or to throw 2
  // when `thrown`.
  changeover: { thrown: boolean; maxCurrent: number };
  button: { closed: boolean; maxCurrent: number };
  buttonNC: { pressed: boolean; maxCurrent: number }; // conducts until pressed
  // A coil (A1, A2) that, energized, moves `contacts` contacts: changeover
  // (SPDT) or make only (SPST). maxCurrent is per contact. A contactor's coil
  // is AC, its `poles` main contacts (3 for a motor) make when energized.
  // `supply`: DC (pins +, −), single-phase AC (L, N) or three-phase AC (U, V,
  // W, windings in delta). Rated voltage is the DC or RMS line voltage.
  motor: { supply: MotorSupply; ratedVoltage: number; ratedPower: number };
  // Sound when driven + to −: a magnetic buzzer's low buzz, a piezo's shrill
  // tone. Rated voltage is the one it's meant to run on.
  buzzer: { ratedVoltage: number; ratedCurrent: number };
  piezo: { ratedVoltage: number; ratedCurrent: number; frequency: number };
  // An electromechanical bell: rings on its rated (RMS) voltage, AC or DC.
  bell: { ratedVoltage: number; ratedCurrent: number };
  // Plays the AC part of the voltage across it, at that signal's frequency.
  speaker: { impedance: number; ratedPower: number };
  // A heating element: its rated voltage and power fix its resistance; it
  // warms up over several seconds and glows when hot.
  heater: { ratedVoltage: number; ratedPower: number };
  // A coil whose plunger pulls in at its rated current (DC, or RMS on AC).
  solenoid: { ratedVoltage: number; ratedCurrent: number; inductance: number };
  // Fluorescent lighting: a tube (filament A on pins 0–1, B on pins 2–3, the
  // arc between them), its ballast choke, and a glow starter.
  tube: { ratedPower: number; arcVoltage: number; strikeVoltage: number };
  ballast: { inductance: number; resistance: number; maxCurrent: number };
  starter: { glowVoltage: number };
  relay: { coilVoltage: number; coilResistance: number; contacts: number; contactType: 'SPDT' | 'SPST'; maxCurrent: number };
  contactor: { coilVoltage: number; coilResistance: number; poles: number; maxCurrent: number };
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
  voltmeter: { resistance: number; maxVoltage: number; mode: MeterMode };
  // Moving-coil panel meter: a needle across a scale to `fullScale` volts.
  panelMeter: { fullScale: number; resistance: number; mode: MeterMode };
  // An oscilloscope probe: its point's voltage against the board's 0 V, shown
  // as that channel's trace.
  scopeProbe: { channel: 'CH1' | 'CH2' };
  ammeter: { resistance: number; maxCurrent: number; mode: MeterMode };
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
  // CMOS logic chips with their own VDD/VSS pins; maxCurrent is per output.
  cd4511: { maxCurrent: number }; // BCD to 7-segment latch/decoder/driver
  cd4017: { maxCurrent: number }; // decade counter, ten decoded outputs
  lm358: { maxCurrent: number }; // dual op-amp
  uln2003: { maxCurrent: number }; // seven Darlington sink drivers
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
