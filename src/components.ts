import type { Point, Props, PropsByType, PartType, PropValue } from './types.ts';
import { formatSI } from './units.ts';

// Schematic symbols follow DIN EN 60617 and are drawn in local coordinates around (0, 0), spanning x -40..40.
// Pins sit on multiples of GRID so they land on grid points at any 90° rotation.
//
// `props` describes each editable value and its default; the simulator reads the
// values. A number field has a `unit` (and optional `min`), a choice has
// `options`, and a boolean default makes a checkbox. `tag` is the value text
// shown next to the symbol on the board. `category` is one of CATEGORIES.
// `letter` is the DIN EN 81346-2 class code used for reference designations
// (-R1, -S2, ...). A prop marked `hidden` is state the
// part manages itself and isn't shown in the panel. Parts that give off light
// have a `glow`: its colour (a key of LIGHT_COLORS) and radius; elements drawn
// with class "bulb" fill with that colour as they light up. Parts you operate
// by hand have an `actuator`: a small control on the board that flips the
// boolean prop `prop`, or holds it true only while pressed if `momentary`.

export const LIGHT_COLORS = {
  lamp: '#ffc94d',
  red: '#ff3b30',
  yellow: '#ffd60a',
  green: '#30d158',
  blue: '#0a84ff',
  white: '#e6f2ff',
} as const;

export type LightColor = keyof typeof LIGHT_COLORS;

export type CategoryId = 'sources' | 'passive' | 'lights' | 'switches';

// Groups shown as the clickable entries of the parts bar, in order. `icon` is
// a Material Symbols name (it must also be listed in index.html's icon_names).
export const CATEGORIES: { id: CategoryId; label: string; icon: string }[] = [
  { id: 'sources', label: 'Sources', icon: 'bolt' },
  { id: 'passive', label: 'Passive', icon: 'electrical_services' },
  { id: 'lights', label: 'Lights', icon: 'lightbulb' },
  { id: 'switches', label: 'Switches', icon: 'toggle_on' },
];

// How the panel edits one value.
interface FieldSpec {
  label: string;
  hidden?: boolean;
}
export interface NumberSpec extends FieldSpec {
  value: number;
  unit: string;
  min?: number;
  max?: number;
}
export interface ChoiceSpec<V extends string = string> extends FieldSpec {
  value: V;
  options: readonly V[];
}
export interface SwitchSpec extends FieldSpec {
  value: boolean;
}
export type PropSpec = NumberSpec | ChoiceSpec | SwitchSpec;

export const isSwitchSpec = (s: PropSpec): s is SwitchSpec => typeof s.value === 'boolean';
export const isChoiceSpec = (s: PropSpec): s is ChoiceSpec => 'options' in s;

// The field kind that matches a value's type ([V] stops unions distributing).
type SpecFor<V> = [V] extends [boolean] ? SwitchSpec : [V] extends [number] ? NumberSpec : ChoiceSpec<V & string>;
type BooleanKeys<P> = { [K in keyof P]: P[K] extends boolean ? K : never }[keyof P] & string;

// One part type's definition, checked against its values P.
interface PartDef<P> {
  name: string;
  letter: string;
  category: CategoryId;
  pins: Point[];
  props: { [K in keyof P]: SpecFor<P[K]> };
  tag?: (p: P) => string;
  glow?: { color: (p: P) => LightColor; radius: number };
  actuator?: { prop: BooleanKeys<P>; momentary: boolean };
  draw: (p: P, broken: boolean) => string;
}

// The same, seen by code that handles any part type.
export interface AnyPartDef {
  name: string;
  letter: string;
  category: CategoryId;
  pins: Point[];
  props: Record<string, PropSpec>;
  tag?: (p: Props) => string;
  glow?: { color: (p: Props) => LightColor; radius: number };
  actuator?: { prop: string; momentary: boolean };
  draw: (p: Props, broken: boolean) => string;
}

const DEFINITIONS: { [T in PartType]: PartDef<PropsByType[T]> } = {
  battery: {
    name: 'Battery',
    letter: 'G',
    category: 'sources',
    pins: [{ x: -40, y: 0 }, { x: 40, y: 0 }], // +, −
    props: {
      voltage: { label: 'Voltage', unit: 'V', value: 9, min: 0 },
      internalResistance: { label: 'Internal resistance', unit: 'Ω', value: 0.5, min: 0 },
      maxCurrent: { label: 'Max current', unit: 'A', value: 1, min: 0.001 },
    },
    tag: (p) => formatSI(p.voltage, 'V'),
    draw: () => `
      <path d="M -40 0 H -4 M -4 -14 V 14 M 4 0 H 40 M -16 -14 H -10 M -13 -17 V -11" />
      <path class="thick" d="M 4 -7 V 7" />`,
  },
  // Sine-wave source. Voltage is given as RMS (230 V~ style); pin 0 is the
  // terminal that goes positive first.
  generator: {
    name: 'AC generator',
    letter: 'G',
    category: 'sources',
    pins: [{ x: -40, y: 0 }, { x: 40, y: 0 }],
    props: {
      voltage: { label: 'Voltage (rms)', unit: 'V', value: 12, min: 0 },
      frequency: { label: 'Frequency', unit: 'Hz', value: 50, min: 0.01, max: 1000 },
      phase: { label: 'Phase', unit: '°', value: 0 },
      internalResistance: { label: 'Internal resistance', unit: 'Ω', value: 0.5, min: 0 },
      maxCurrent: { label: 'Max current', unit: 'A', value: 1, min: 0.001 },
    },
    tag: (p) => `${formatSI(p.voltage, 'V')}~ ${formatSI(p.frequency, 'Hz')}`,
    draw: () => `
      <path d="M -40 0 H -16 M 16 0 H 40" />
      <circle r="16" />
      <path d="M -10 0 C -7 -10 -3 -10 0 0 S 7 10 10 0" />`,
  },
  resistor: {
    name: 'Resistor',
    letter: 'R',
    category: 'passive',
    pins: [{ x: -40, y: 0 }, { x: 40, y: 0 }],
    props: {
      resistance: { label: 'Resistance', unit: 'Ω', value: 1000, min: 0.001 },
      powerRating: { label: 'Power rating', unit: 'W', value: 0.25, min: 0.001 },
    },
    tag: (p) => formatSI(p.resistance, 'Ω'),
    draw: () => `
      <path d="M -40 0 H -18 M 18 0 H 40" />
      <rect x="-18" y="-6" width="36" height="12" />`,
  },
  lamp: {
    name: 'Lamp',
    letter: 'E',
    category: 'lights',
    pins: [{ x: -40, y: 0 }, { x: 40, y: 0 }],
    props: {
      ratedVoltage: { label: 'Rated voltage', unit: 'V', value: 6, min: 0.001 },
      ratedPower: { label: 'Rated power', unit: 'W', value: 1, min: 0.001 },
    },
    tag: (p) => `${formatSI(p.ratedVoltage, 'V')} ${formatSI(p.ratedPower, 'W')}`,
    glow: { color: () => 'lamp', radius: 40 },
    draw: () => `
      <circle class="bulb" r="14" />
      <path d="M -40 0 H -14 M 14 0 H 40 M -10 -10 L 10 10 M 10 -10 L -10 10" />`,
  },
  led: {
    name: 'LED',
    letter: 'P',
    category: 'lights',
    pins: [{ x: -40, y: 0 }, { x: 40, y: 0 }], // anode, cathode
    props: {
      color: { label: 'Colour', value: 'red', options: ['red', 'yellow', 'green', 'blue', 'white'] },
      forwardVoltage: { label: 'Forward voltage', unit: 'V', value: 2, min: 0.1 },
      maxCurrent: { label: 'Max current', unit: 'A', value: 0.02, min: 0.0001 },
    },
    glow: { color: (p) => p.color, radius: 30 },
    draw: () => `
      <path class="bulb tinted" d="M -10 -10 V 10 L 10 0 Z" />
      <path d="M -40 0 H 40 M 10 -10 V 10" />
      <path d="M -2 -14 L 6 -22 M 1 -22 H 6 V -17 M 6 -12 L 14 -20 M 9 -20 H 14 V -15" />`,
  },
  switch: {
    name: 'Switch',
    letter: 'S',
    category: 'switches',
    pins: [{ x: -40, y: 0 }, { x: 40, y: 0 }],
    props: {
      closed: { label: 'Closed', value: false },
      maxCurrent: { label: 'Max current', unit: 'A', value: 5, min: 0.001 },
    },
    actuator: { prop: 'closed', momentary: false },
    // Welded contacts stay shut, with a blob where they fused.
    draw: ({ closed }, broken) => `
      <path d="M -40 0 H -14 L ${closed || broken ? '14 0' : '16 -12'} M 14 0 H 40" />
      ${broken ? '<circle class="weld" cx="14" r="3.5" />' : ''}`,
  },
  // Normally-open push button: closed only while held down.
  button: {
    name: 'Push button',
    letter: 'S',
    category: 'switches',
    pins: [{ x: -40, y: 0 }, { x: 40, y: 0 }],
    props: {
      closed: { label: 'Pressed', value: false, hidden: true },
      maxCurrent: { label: 'Max current', unit: 'A', value: 5, min: 0.001 },
    },
    actuator: { prop: 'closed', momentary: true },
    // DIN make contact with a push actuator linked to the blade by a dashed line.
    draw: ({ closed }, broken) => {
      const shut = closed || broken;
      const head = closed ? -14 : -20;
      return `
        <path d="M -40 0 H -14 L ${shut ? '14 0' : '16 -12'} M 14 0 H 40" />
        <path d="M -6 ${head - 4} V ${head} H 8 V ${head - 4}" />
        <path class="link" d="M 1 ${head} V ${shut ? 0 : -6}" />
        ${broken ? '<circle class="weld" cx="14" r="3.5" />' : ''}`;
    },
  },
};

// Every part type's definition. Each is checked against its own values above;
// this map is the general view the rest of the app works with.
export const PARTS = DEFINITIONS as unknown as Record<PartType, AnyPartDef>;

// The values a new part of this type starts with.
export function defaults<T extends PartType>(type: T): PropsByType[T] {
  const entries = Object.entries(PARTS[type].props).map(([key, spec]): [string, PropValue] => [key, spec.value]);
  return Object.fromEntries(entries) as PropsByType[T];
}

export function symbolMarkup(type: PartType, props: Props, broken = false): string {
  const part = PARTS[type];
  const pins = part.pins.map((p, i) => `<circle class="pin" data-pin="${i}" cx="${p.x}" cy="${p.y}" r="3" />`);
  return part.draw(props, broken) + pins.join('');
}
