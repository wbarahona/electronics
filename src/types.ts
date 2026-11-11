import type { PartProps as BatteryProps } from './parts/sources/battery.ts';
import type { PartProps as GroundProps } from './parts/sources/ground.ts';
import type { PartProps as GeneratorProps } from './parts/sources/generator.ts';
import type { PartProps as RailsProps } from './parts/sources/rails.ts';
import type { PartProps as ResistorProps } from './parts/passive/resistor.ts';
import type { PartProps as CapacitorsProps } from './parts/passive/capacitors.ts';
import type { PartProps as InductorProps } from './parts/passive/inductor.ts';
import type { PartProps as VariableProps } from './parts/passive/variable.ts';
import type { PartProps as LdrProps } from './parts/passive/ldr.ts';
import type { PartProps as NtcProps } from './parts/passive/ntc.ts';
import type { PartProps as TransformerProps } from './parts/passive/transformer.ts';
import type { PartProps as FuseProps } from './parts/passive/fuse.ts';
import type { PartProps as LampProps } from './parts/signals/lamp.ts';
import type { PartProps as LedProps } from './parts/signals/led.ts';
import type { PartProps as StackLightProps } from './parts/signals/stack-light.ts';
import type { PartProps as RgbLedProps } from './parts/signals/rgb-led.ts';
import type { PartProps as BarGraphProps } from './parts/signals/bar-graph.ts';
import type { PartProps as BicolorLedProps } from './parts/signals/bicolor-led.ts';
import type { PartProps as SevenSegProps } from './parts/signals/seven-seg.ts';
import type { PartProps as SwitchesProps } from './parts/switches/switches.ts';
import type { PartProps as ChangeoverProps } from './parts/switches/changeover.ts';
import type { PartProps as MotorProps } from './parts/loads/motor.ts';
import type { PartProps as HeaterProps } from './parts/loads/heater.ts';
import type { PartProps as SolenoidProps } from './parts/loads/solenoid.ts';
import type { PartProps as FluorescentProps } from './parts/loads/fluorescent.ts';
import type { PartProps as SoundersProps } from './parts/signals/sounders.ts';
import type { PartProps as SpeakerProps } from './parts/signals/speaker.ts';
import type { PartProps as RelaysProps } from './parts/switches/relays.ts';
import type { PartProps as GatesProps } from './parts/digital/gates.ts';
import type { PartProps as FlipFlopsProps } from './parts/digital/flip-flops.ts';
import type { PartProps as IoProps } from './parts/digital/io.ts';
import type { PartProps as Cd4511Props } from './parts/chips/cd4511.ts';
import type { PartProps as Cd4017Props } from './parts/chips/cd4017.ts';
import type { PartProps as Lm358Props } from './parts/chips/lm358.ts';
import type { PartProps as Uln2003Props } from './parts/chips/uln2003.ts';
import type { PartProps as Ne555Props } from './parts/chips/ne555.ts';
import type { PartProps as RegulatorProps } from './parts/chips/regulator.ts';
import type { PartProps as ScopeProbeProps } from './parts/meters/scope-probe.ts';
import type { PartProps as PanelMeterProps } from './parts/meters/panel-meter.ts';
import type { PartProps as MultimeterProps } from './parts/meters/multimeter.ts';
import type { PartProps as DiodesProps } from './parts/semiconductors/diodes.ts';
import type { PartProps as TransistorsProps } from './parts/semiconductors/transistors.ts';

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

// The values each kind of part carries: what the properties panel edits and
// the simulator reads. Each part declares its own (PartProps in its file in
// src/parts); adding a part type starts there.
export interface PropsByType
  extends BatteryProps,
    GroundProps,
    GeneratorProps,
    RailsProps,
    ResistorProps,
    CapacitorsProps,
    InductorProps,
    VariableProps,
    LdrProps,
    NtcProps,
    TransformerProps,
    FuseProps,
    LampProps,
    LedProps,
    StackLightProps,
    RgbLedProps,
    BarGraphProps,
    BicolorLedProps,
    SevenSegProps,
    SwitchesProps,
    ChangeoverProps,
    MotorProps,
    HeaterProps,
    SolenoidProps,
    FluorescentProps,
    SoundersProps,
    SpeakerProps,
    RelaysProps,
    GatesProps,
    FlipFlopsProps,
    IoProps,
    Cd4511Props,
    Cd4017Props,
    Lm358Props,
    Uln2003Props,
    Ne555Props,
    RegulatorProps,
    ScopeProbeProps,
    PanelMeterProps,
    MultimeterProps,
    DiodesProps,
    TransistorsProps {}

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
