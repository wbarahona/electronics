import type { Point, Props, PropsByType, PartType, PropValue } from './types.ts';
import { formatNumber, formatSI } from './units.ts';

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
// `group` is the subcategory the part is listed under in its category's tray.
// Parts that store energy have a `gauge`: a small battery icon on the board
// showing how full they are (the model's `level`). Meters have a `display`:
// a small readout on the board showing the model's `reading`. `noLabel`
// parts show no reference on the board (Ground). `hit` sizes the invisible
// grab box when the symbol is bigger than the usual 80×40. `labelBelow` moves the
// label under the symbol when something else (like a third pin) is above it;
// `labelAt` places it exactly, as [x, y, text-anchor] in screen space for the
// part lying horizontally or vertically.

export const LIGHT_COLORS = {
  lamp: '#ffc94d',
  red: '#ff3b30',
  yellow: '#ffd60a',
  green: '#30d158',
  blue: '#0a84ff',
  white: '#e6f2ff',
} as const;

export type LightColor = keyof typeof LIGHT_COLORS;

export type CategoryId = 'sources' | 'passive' | 'semiconductors' | 'digital' | 'chips' | 'lights' | 'switches' | 'meters';

// Groups shown as the clickable entries of the parts bar, in order. `icon` is
// a Material Symbols name (it must also be listed in index.html's icon_names),
// or inline SVG on a 24×24 grid where no symbol fits.

// A diode, for Semiconductors: Material Symbols has nothing that says
// "diode or transistor".
const DIODE_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 11h5v2H2zM17 11h5v2h-5zM7 5v14l10-7zM17 5h2v14h-2z" /></svg>';
export const CATEGORIES: { id: CategoryId; label: string; icon: string }[] = [
  { id: 'sources', label: 'Sources', icon: 'bolt' },
  { id: 'passive', label: 'Passive', icon: 'electrical_services' },
  { id: 'semiconductors', label: 'Semiconductors', icon: DIODE_ICON },
  { id: 'digital', label: 'Digital', icon: 'developer_board' },
  { id: 'chips', label: 'Chips', icon: 'memory' },
  { id: 'lights', label: 'Lights', icon: 'lightbulb' },
  { id: 'switches', label: 'Switches', icon: 'toggle_on' },
  { id: 'meters', label: 'Meters', icon: 'speed' },
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
  slider?: boolean; // edit with a slider from min to max (both required)
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
  group?: string;
  pins: Point[];
  props: { [K in keyof P]: SpecFor<P[K]> };
  tag?: (p: P) => string;
  glow?: { color: (p: P) => LightColor; radius: number };
  actuator?: { prop: BooleanKeys<P>; momentary: boolean };
  gauge?: boolean;
  display?: boolean;
  noLabel?: boolean;
  hit?: { w: number; h: number };
  labelBelow?: boolean;
  labelAt?: (vertical: boolean) => LabelSpot;
  draw: (p: P, broken: boolean) => string;
}

export type LabelSpot = [number, number, 'start' | 'middle' | 'end'];

// The same, seen by code that handles any part type.
export interface AnyPartDef {
  name: string;
  letter: string;
  category: CategoryId;
  group?: string;
  pins: Point[];
  props: Record<string, PropSpec>;
  tag?: (p: Props) => string;
  glow?: { color: (p: Props) => LightColor; radius: number };
  actuator?: { prop: string; momentary: boolean };
  gauge?: boolean;
  display?: boolean;
  noLabel?: boolean;
  hit?: { w: number; h: number };
  labelBelow?: boolean;
  labelAt?: (vertical: boolean) => LabelSpot;
  draw: (p: Props, broken: boolean) => string;
}

// Logic gates, DIN EN 60617-12 rectangular form: a box with the function's
// qualifier (&, ≥1, =1, 1) and a circle on the output for inversion. Inputs
// enter on the left, the output leaves on the right.
const gateProps = {
  supply: { label: 'Logic supply', unit: 'V', value: 5, min: 1, max: 15 },
  maxCurrent: { label: 'Max output current', unit: 'A', value: 0.025, min: 0.001 },
};
const gateLabel = (vertical: boolean): LabelSpot => (vertical ? [36, 4, 'start'] : [0, -36, 'middle']);
function gate(name: string, qualifier: string, inverted: boolean, inputs: 1 | 2) {
  const half = inputs === 2 ? 28 : 18;
  return {
    name,
    letter: 'K',
    category: 'digital' as const,
    group: 'Gates',
    pins: inputs === 2 ? [{ x: -40, y: -20 }, { x: -40, y: 20 }, { x: 40, y: 0 }] : [{ x: -40, y: 0 }, { x: 40, y: 0 }],
    props: gateProps,
    hit: { w: 80, h: half * 2 },
    labelAt: gateLabel,
    draw: () => `
      <path d="${inputs === 2 ? 'M -40 -20 H -20 M -40 20 H -20' : 'M -40 0 H -20'} M ${inverted ? 28 : 20} 0 H 40" />
      <rect x="-20" y="${-half}" width="40" height="${half * 2}" />
      ${inverted ? '<circle cx="24" r="4" />' : ''}
      <text class="gate-text upright" y="5" text-anchor="middle">${qualifier}</text>`,
  };
}

// An IC drawn the DIN way: a box with each pin's name inside and its number
// outside (no number for generic logic symbols). `pins` lists
// [name, number, x, y] in the order the model uses; leads run from the pin to
// the box edge (`box` is the half-width/height).
type ChipPin = [string, number | null, number, number];

function chip(box: { w: number; h: number }, title: string, pins: ChipPin[]): string {
  const lead = ([, , x, y]: ChipPin) => {
    const ex = x < -box.w ? -box.w : x > box.w ? box.w : x;
    const ey = y < -box.h ? -box.h : y > box.h ? box.h : y;
    return `M ${x} ${y} L ${ex} ${ey}`;
  };
  // Name just inside the box, number just outside, both kept level.
  const text = ([name, num, x, y]: ChipPin) => {
    const side = x < -box.w ? 'l' : x > box.w ? 'r' : y < 0 ? 't' : 'b';
    const [nx, ny, anchor] =
      side === 'l' ? [-box.w + 3, y + 3, 'start'] : side === 'r' ? [box.w - 3, y + 3, 'end'] : side === 't' ? [x, -box.h + 9, 'middle'] : [x, box.h - 3, 'middle'];
    const [mx, my] = side === 'l' ? [x + 6, y - 3] : side === 'r' ? [x - 6, y - 3] : [x + 4, side === 't' ? y + 9 : y - 4];
    const cx = anchor === 'start' ? nx + 8 : anchor === 'end' ? nx - 8 : nx;
    const label = `<text class="chip-pin upright" x="${nx}" y="${ny}" text-anchor="${anchor}" data-x="${cx}" data-y="${ny - 3}">${name}</text>`;
    if (num === null) return label;
    return `${label}
      <text class="chip-num upright" x="${mx}" y="${my}" text-anchor="middle" data-x="${mx}" data-y="${my - 3}">${num}</text>`;
  };
  return `
    <path d="${pins.map(lead).join(' ')}" />
    <rect x="${-box.w}" y="${-box.h}" width="${box.w * 2}" height="${box.h * 2}" />
    <text class="chip-title upright" y="4" text-anchor="middle">${title}</text>
    ${pins.map(text).join('')}`;
}

// Flip-flops (DIN EN 60617-12): data inputs labelled with the dependency
// notation (1D, 1J, 1K, 1T) and the clock C1 with the ▷ dynamic-input marker
// (rising edge); asynchronous S on top and R below; Q, and Q̄ with the
// negation circle. Pins: the data/clock inputs, then S, R, Q, Q̄.
const ffLabel = (): LabelSpot => [44, -38, 'start'];
function flipFlop(name: string, title: string, inputs: [string, number][]) {
  const clockY = inputs.find(([n]) => n === 'C1')![1];
  // The clock's label starts after the ▷ marker.
  const pins: ChipPin[] = [
    ...inputs.map(([n, y]): ChipPin => [n === 'C1' ? '<tspan dx="5">C1</tspan>' : n, null, -40, y]),
    ['S', null, 0, -40],
    ['R', null, 0, 40],
    ['Q', null, 40, -20],
    ['<tspan text-decoration="overline">Q</tspan>', null, 40, 20],
  ];
  return {
    name,
    letter: 'K',
    category: 'digital' as const,
    group: 'Flip-flops',
    pins: pins.map(([, , x, y]) => ({ x, y })),
    props: gateProps,
    hit: { w: 80, h: 80 },
    labelAt: ffLabel,
    draw: () => `
      ${chip({ w: 30, h: 30 }, title, pins)}
      <path d="M -30 ${clockY - 4} L -24 ${clockY} L -30 ${clockY + 4}" />
      <circle class="dot-hollow" cx="33" cy="20" r="3" />`,
  };
}

// Indicating instrument (DIN EN 60617): a circle with the quantity's letter,
// + marking the red-lead pin.
const meterSymbol = (letter: string) => `
  <path d="M -40 0 H -14 M 14 0 H 40 M -30 -10 H -24 M -27 -13 V -7" />
  <circle r="14" />
  <text class="meter-letter upright" y="5" text-anchor="middle">${letter}</text>`;

// Transistors: base/gate on the left, the other two leads leave up and down,
// so the label goes beside the envelope (or below it when turned).
const transistorLabel = (vertical: boolean): LabelSpot => (vertical ? [0, 54, 'middle'] : [32, 4, 'start']);

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
      capacity: { label: 'Capacity', unit: 'Ah', value: 0.5, min: 0.0001 },
      charge: { label: 'Charge', unit: '', value: 1, hidden: true },
    },
    tag: (p) => formatSI(p.voltage, 'V'),
    gauge: true,
    draw: () => `
      <path d="M -40 0 H -4 M -4 -14 V 14 M 4 0 H 40 M -16 -14 H -10 M -13 -17 V -11" />
      <path class="thick" d="M 4 -7 V 7" />`,
  },
  // The common 0 V (DIN EN 60617 earth symbol). Carries no reference.
  ground: {
    name: 'Ground',
    letter: 'X',
    category: 'sources',
    group: 'Reference',
    pins: [{ x: 0, y: -20 }],
    props: {},
    noLabel: true,
    draw: () => `
      <path d="M 0 -20 V 0 M -12 0 H 12 M -7 5 H 7 M -2 10 H 2" />`,
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
      <path class="upright" d="M -10 0 C -7 -10 -3 -10 0 0 S 7 10 10 0" />`,
  },
  resistor: {
    name: 'Resistor',
    letter: 'R',
    category: 'passive',
    group: 'Resistors',
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
  capacitor: {
    name: 'Capacitor',
    letter: 'C',
    category: 'passive',
    group: 'Capacitors & inductors',
    pins: [{ x: -40, y: 0 }, { x: 40, y: 0 }],
    props: {
      capacitance: { label: 'Capacitance', unit: 'F', value: 10e-6, min: 1e-12 },
      ratedVoltage: { label: 'Rated voltage', unit: 'V', value: 25, min: 0.1 },
    },
    tag: (p) => formatSI(p.capacitance, 'F'),
    gauge: true,
    draw: () => `
      <path d="M -40 0 H -4 M 4 0 H 40" />
      <path class="thick" d="M -4 -14 V 14 M 4 -14 V 14" />`,
  },
  // Polarised: pin 0 is +. The + plate is drawn hollow (DIN EN 60617).
  electrolytic: {
    name: 'Electrolytic cap',
    letter: 'C',
    category: 'passive',
    group: 'Capacitors & inductors',
    pins: [{ x: -40, y: 0 }, { x: 40, y: 0 }], // +, −
    props: {
      capacitance: { label: 'Capacitance', unit: 'F', value: 470e-6, min: 1e-9 },
      ratedVoltage: { label: 'Rated voltage', unit: 'V', value: 16, min: 0.1 },
    },
    tag: (p) => `${formatSI(p.capacitance, 'F')} ${formatSI(p.ratedVoltage, 'V')}`,
    gauge: true,
    draw: () => `
      <path d="M -40 0 H -7 M 5 0 H 40 M -16 -14 H -10 M -13 -17 V -11" />
      <rect x="-7" y="-14" width="4" height="28" />
      <path class="thick" d="M 5 -14 V 14" />`,
  },
  // IEC coil: four half-turns. `resistance` is the winding's own resistance.
  inductor: {
    name: 'Inductor',
    letter: 'R',
    category: 'passive',
    group: 'Capacitors & inductors',
    pins: [{ x: -40, y: 0 }, { x: 40, y: 0 }],
    props: {
      inductance: { label: 'Inductance', unit: 'H', value: 10e-3, min: 1e-9 },
      resistance: { label: 'Winding resistance', unit: 'Ω', value: 1, min: 0 },
      maxCurrent: { label: 'Max current', unit: 'A', value: 1, min: 0.001 },
    },
    tag: (p) => formatSI(p.inductance, 'H'),
    draw: () => `
      <path d="M -40 0 H -20 A 5 5 0 0 1 -10 0 A 5 5 0 0 1 0 0 A 5 5 0 0 1 10 0 A 5 5 0 0 1 20 0 H 40" />`,
  },
  // Track between pins 0 and 1, wiper on pin 2. `position` 0 puts the wiper
  // at pin 0, 100 at pin 1.
  potentiometer: {
    name: 'Potentiometer',
    letter: 'R',
    category: 'passive',
    group: 'Resistors',
    pins: [{ x: -40, y: 0 }, { x: 40, y: 0 }, { x: 0, y: -40 }],
    props: {
      resistance: { label: 'Resistance', unit: 'Ω', value: 10e3, min: 1 },
      position: { label: 'Wiper position', unit: '%', value: 50, min: 0, max: 100, slider: true },
      powerRating: { label: 'Power rating', unit: 'W', value: 0.5, min: 0.001 },
    },
    tag: (p) => `${formatSI(p.resistance, 'Ω')} ${Math.round(p.position)} %`,
    labelBelow: true,
    draw: () => `
      <path d="M -40 0 H -18 M 18 0 H 40 M 0 -40 V -9" />
      <path class="fill" d="M 0 -6 L -4 -13 H 4 Z" />
      <rect x="-18" y="-6" width="36" height="12" />`,
  },
  // Resistance between the pins is `position` % of the maximum.
  rheostat: {
    name: 'Variable resistor',
    letter: 'R',
    category: 'passive',
    group: 'Resistors',
    pins: [{ x: -40, y: 0 }, { x: 40, y: 0 }],
    props: {
      resistance: { label: 'Max resistance', unit: 'Ω', value: 1000, min: 1 },
      position: { label: 'Setting', unit: '%', value: 50, min: 0, max: 100, slider: true },
      powerRating: { label: 'Power rating', unit: 'W', value: 0.5, min: 0.001 },
    },
    tag: (p) => formatSI((p.resistance * p.position) / 100, 'Ω'),
    draw: () => `
      <path d="M -40 0 H -18 M 18 0 H 40 M -16 14 L 14 -12" />
      <path class="fill" d="M 18 -15.5 L 9.5 -12.5 L 14.5 -7 Z" />
      <rect x="-18" y="-6" width="36" height="12" />`,
  },
  // Light-dependent resistor: two arrows of incoming light.
  ldr: {
    name: 'LDR',
    letter: 'R',
    category: 'passive',
    group: 'Sensors',
    pins: [{ x: -40, y: 0 }, { x: 40, y: 0 }],
    props: {
      darkResistance: { label: 'Dark resistance', unit: 'Ω', value: 1e6, min: 1 },
      lightResistance: { label: 'Bright resistance', unit: 'Ω', value: 1000, min: 1 },
      ambient: { label: 'Ambient light', unit: '%', value: 20, min: 0, max: 100, slider: true },
      powerRating: { label: 'Power rating', unit: 'W', value: 0.1, min: 0.001 },
    },
    draw: () => `
      <path d="M -40 0 H -18 M 18 0 H 40 M -14 -24 L -6 -11 M 0 -24 L 8 -11" />
      <path class="fill" d="M -4 -7.5 L -5 -14 L -9.5 -11.5 Z M 10 -7.5 L 9 -14 L 4.5 -11.5 Z" />
      <rect x="-18" y="-6" width="36" height="12" />`,
  },
  // NTC thermistor: resistance falls as it warms (B-parameter model).
  ntc: {
    name: 'NTC thermistor',
    letter: 'R',
    category: 'passive',
    group: 'Sensors',
    pins: [{ x: -40, y: 0 }, { x: 40, y: 0 }],
    props: {
      resistance: { label: 'Resistance at 25 °C', unit: 'Ω', value: 10e3, min: 1 },
      beta: { label: 'B constant', unit: 'K', value: 3950, min: 100 },
      ambient: { label: 'Ambient temperature', unit: '°C', value: 25, min: -40, max: 150 },
      powerRating: { label: 'Power rating', unit: 'W', value: 0.5, min: 0.001 },
    },
    tag: (p) => formatSI(p.resistance, 'Ω'),
    draw: () => `
      <path d="M -40 0 H -18 M 18 0 H 40 M -22 14 H -16 L 16 -14" />
      <rect x="-18" y="-6" width="36" height="12" />
      <text class="sym-text upright" x="6" y="20" data-x="12" data-y="17">−ϑ</text>`,
  },
  // Two coupled windings on an iron core (DIN EN 60617 winding form). Pins:
  // primary 1 (dotted) and 2 on the left, secondary 3 (dotted) and 4 on the
  // right. The windings are isolated from each other.
  transformer: {
    name: 'Transformer',
    letter: 'T',
    category: 'passive',
    group: 'Transformers',
    pins: [{ x: -40, y: -20 }, { x: -40, y: 20 }, { x: 40, y: -20 }, { x: 40, y: 20 }],
    props: {
      ratio: { label: 'Turns ratio (primary : secondary)', unit: ': 1', value: 2, min: 0.01, max: 100 },
      inductance: { label: 'Primary inductance', unit: 'H', value: 1, min: 1e-6 },
      coupling: { label: 'Coupling', unit: '', value: 0.99, min: 0.1, max: 0.999 },
      resistance: { label: 'Primary winding resistance', unit: 'Ω', value: 1, min: 0.001 },
      maxCurrent: { label: 'Max secondary current', unit: 'A', value: 1, min: 0.001 },
    },
    tag: (p) => (p.ratio >= 1 ? `${formatNumber(p.ratio)}:1` : `1:${formatNumber(1 / p.ratio)}`),
    draw: () => `
      <path d="M -40 -20 H -12 M -40 20 H -12 M 40 -20 H 12 M 40 20 H 12" />
      <path d="M -12 -20 A 5 5 0 0 1 -12 -10 A 5 5 0 0 1 -12 0 A 5 5 0 0 1 -12 10 A 5 5 0 0 1 -12 20" />
      <path d="M 12 -20 A 5 5 0 0 0 12 -10 A 5 5 0 0 0 12 0 A 5 5 0 0 0 12 10 A 5 5 0 0 0 12 20" />
      <path d="M -2 -22 V 22 M 2 -22 V 22" />
      <circle class="dot" cx="-20" cy="-13" r="2" />
      <circle class="dot" cx="20" cy="-13" r="2" />`,
  },
  fuse: {
    name: 'Fuse',
    letter: 'F',
    category: 'passive',
    group: 'Protection',
    pins: [{ x: -40, y: 0 }, { x: 40, y: 0 }],
    props: {
      ratedCurrent: { label: 'Rated current', unit: 'A', value: 0.5, min: 0.001 },
    },
    tag: (p) => formatSI(p.ratedCurrent, 'A'),
    draw: () => `
      <path d="M -40 0 H 40" />
      <rect x="-14" y="-6" width="28" height="12" />`,
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
    group: 'Toggle',
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
    name: 'Push button (NO)',
    letter: 'S',
    category: 'switches',
    group: 'Push buttons',
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
  // Normally-closed push button: conducts until held down. DIN break contact:
  // the blade rests against a stop on the fixed contact; pressing lifts it off.
  buttonNC: {
    name: 'Push button (NC)',
    letter: 'S',
    category: 'switches',
    group: 'Push buttons',
    pins: [{ x: -40, y: 0 }, { x: 40, y: 0 }],
    props: {
      pressed: { label: 'Pressed', value: false, hidden: true },
      maxCurrent: { label: 'Max current', unit: 'A', value: 5, min: 0.001 },
    },
    actuator: { prop: 'pressed', momentary: true },
    draw: ({ pressed }, broken) => {
      const open = pressed && !broken;
      const tip = open ? -20 : -10; // blade end height
      const head = open ? -32 : -24;
      return `
        <path d="M -40 0 H -14 L 18 ${tip} M 40 0 H 14 V -10" />
        <path d="M -6 ${head - 4} V ${head} H 8 V ${head - 4}" />
        <path class="link" d="M 1 ${head} V ${open ? -14 : -7}" />
        ${broken ? '<circle class="weld" cx="14" cy="-9" r="3.5" />' : ''}`;
    },
  },
  and: gate('AND', '&amp;', false, 2),
  or: gate('OR', '≥1', false, 2),
  not: gate('NOT', '1', true, 1),
  nand: gate('NAND', '&amp;', true, 2),
  nor: gate('NOR', '≥1', true, 2),
  xor: gate('XOR', '=1', false, 2),
  xnor: gate('XNOR', '=1', true, 2),
  dff: flipFlop('D flip-flop', 'D', [['1D', -20], ['C1', 20]]),
  jkff: flipFlop('JK flip-flop', 'JK', [['1J', -20], ['C1', 0], ['1K', 20]]),
  tff: flipFlop('T flip-flop', 'T', [['1T', -20], ['C1', 20]]),
  // A logic level set by hand: its toggle switches the output between 1 and 0.
  logicSwitch: {
    name: 'Logic switch',
    letter: 'S',
    category: 'digital',
    group: 'Input/Output',
    pins: [{ x: 40, y: 0 }],
    props: {
      high: { label: 'Output high', value: false },
      supply: { label: 'Logic supply', unit: 'V', value: 5, min: 1, max: 15 },
    },
    actuator: { prop: 'high', momentary: false },
    draw: ({ high }) => `
      <path d="M 14 0 H 40" />
      <rect x="-14" y="-12" width="28" height="24" />
      <text class="gate-text upright" y="5" text-anchor="middle">${high ? 1 : 0}</text>`,
  },
  // Square-wave clock (the box shows a pulse).
  clock: {
    name: 'Clock',
    letter: 'G',
    category: 'digital',
    group: 'Input/Output',
    pins: [{ x: 40, y: 0 }],
    props: {
      frequency: { label: 'Frequency', unit: 'Hz', value: 1, min: 0.01, max: 1000 },
      duty: { label: 'Duty cycle', unit: '%', value: 50, min: 1, max: 99, slider: true },
      supply: { label: 'Logic supply', unit: 'V', value: 5, min: 1, max: 15 },
    },
    tag: (p) => formatSI(p.frequency, 'Hz'),
    draw: () => `
      <path d="M 20 0 H 40" />
      <rect x="-20" y="-16" width="40" height="32" />
      <path d="M -12 6 H -6 V -6 H 2 V 6 H 8 V -6 H 12" />`,
  },
  // Shows a logic level: lights red for 1; its display reads 1 or 0.
  probe: {
    name: 'Logic probe',
    letter: 'P',
    category: 'digital',
    group: 'Input/Output',
    pins: [{ x: -40, y: 0 }],
    props: {
      supply: { label: 'Logic supply', unit: 'V', value: 5, min: 1, max: 15 },
    },
    glow: { color: () => 'red', radius: 24 },
    display: true,
    draw: () => `
      <path d="M -40 0 H -12" />
      <circle class="bulb tinted" r="12" />`,
  },
  // NE555 timer, pins in datasheet order 1–8.
  ne555: {
    name: '555 timer',
    letter: 'K',
    category: 'chips',
    group: 'Timers',
    pins: [
      { x: -20, y: 60 }, // 1 GND
      { x: -60, y: 20 }, // 2 TRIG
      { x: 60, y: 0 }, // 3 OUT
      { x: -20, y: -60 }, // 4 RESET
      { x: 20, y: 60 }, // 5 CTRL
      { x: -60, y: 0 }, // 6 THR
      { x: -60, y: -20 }, // 7 DIS
      { x: 20, y: -60 }, // 8 VCC
    ],
    props: {
      maxCurrent: { label: 'Max output current', unit: 'A', value: 0.2, min: 0.001 },
      maxSupply: { label: 'Max supply voltage', unit: 'V', value: 16, min: 1 },
    },
    tag: () => 'NE555',
    hit: { w: 80, h: 80 },
    labelAt: () => [44, -48, 'start'],
    draw: () =>
      chip({ w: 40, h: 40 }, '555', [
        ['GND', 1, -20, 60], ['TR', 2, -60, 20], ['Q', 3, 60, 0], ['R', 4, -20, -60],
        ['CV', 5, 20, 60], ['THR', 6, -60, 0], ['DIS', 7, -60, -20], ['VCC', 8, 20, -60],
      ]),
  },
  // Fixed linear voltage regulator, 78xx family (7805 by default).
  regulator: {
    name: 'Voltage regulator',
    letter: 'T',
    category: 'chips',
    group: 'Regulators',
    pins: [{ x: -40, y: 0 }, { x: 0, y: 40 }, { x: 40, y: 0 }], // 1 IN, 2 GND, 3 OUT
    props: {
      outputVoltage: { label: 'Output voltage', unit: 'V', value: 5, min: 1.25, max: 24 },
      dropout: { label: 'Dropout voltage', unit: 'V', value: 2, min: 0.1 },
      maxCurrent: { label: 'Max output current', unit: 'A', value: 1.5, min: 0.001 },
      powerRating: { label: 'Power rating', unit: 'W', value: 2, min: 0.01 },
    },
    tag: (p) => `78${String(Math.round(p.outputVoltage)).padStart(2, '0')}`,
    draw: (p) =>
      chip({ w: 32, h: 18 }, `${formatNumber(p.outputVoltage)} V`, [['IN', 1, -40, 0], ['GND', 2, 0, 40], ['OUT', 3, 40, 0]]),
  },
  // Reads the voltage from + to COM: almost no current drawn.
  voltmeter: {
    name: 'Voltmeter',
    letter: 'P',
    category: 'meters',
    pins: [{ x: -40, y: 0 }, { x: 40, y: 0 }],
    props: {
      resistance: { label: 'Input resistance', unit: 'Ω', value: 10e6, min: 1000 },
      maxVoltage: { label: 'Max voltage', unit: 'V', value: 1000, min: 1 },
    },
    display: true,
    draw: () => meterSymbol('V'),
  },
  // Reads the current flowing in at + and out at COM: almost no voltage
  // dropped. An internal fuse protects it.
  ammeter: {
    name: 'Ammeter',
    letter: 'P',
    category: 'meters',
    pins: [{ x: -40, y: 0 }, { x: 40, y: 0 }],
    props: {
      resistance: { label: 'Internal resistance', unit: 'Ω', value: 0.05, min: 0.0001 },
      maxCurrent: { label: 'Fuse rating', unit: 'A', value: 10, min: 0.001 },
    },
    display: true,
    draw: () => meterSymbol('A'),
  },
  // Pin 0 is the anode, pin 1 the cathode (the bar), as for the LED.
  diode: {
    name: 'Diode',
    letter: 'R',
    category: 'semiconductors',
    group: 'Diodes',
    pins: [{ x: -40, y: 0 }, { x: 40, y: 0 }],
    props: {
      forwardVoltage: { label: 'Forward voltage (10 mA)', unit: 'V', value: 0.7, min: 0.1 },
      maxCurrent: { label: 'Max current', unit: 'A', value: 1, min: 0.001 },
      reverseVoltage: { label: 'Max reverse voltage', unit: 'V', value: 100, min: 1 },
    },
    draw: () => `
      <path d="M -40 0 H 40 M 10 -10 V 10 M -10 -10 V 10 L 10 0 Z" />`,
  },
  schottky: {
    name: 'Schottky diode',
    letter: 'R',
    category: 'semiconductors',
    group: 'Diodes',
    pins: [{ x: -40, y: 0 }, { x: 40, y: 0 }],
    props: {
      forwardVoltage: { label: 'Forward voltage (10 mA)', unit: 'V', value: 0.3, min: 0.05 },
      maxCurrent: { label: 'Max current', unit: 'A', value: 1, min: 0.001 },
      reverseVoltage: { label: 'Max reverse voltage', unit: 'V', value: 40, min: 1 },
    },
    draw: () => `
      <path d="M -40 0 H 40 M -10 -10 V 10 L 10 0 Z M 15 -6 V -10 H 10 V 10 H 5 V 6" />`,
  },
  // Conducts forward like a diode; in reverse it breaks down at its zener
  // voltage and holds it there.
  zener: {
    name: 'Zener diode',
    letter: 'R',
    category: 'semiconductors',
    group: 'Diodes',
    pins: [{ x: -40, y: 0 }, { x: 40, y: 0 }],
    props: {
      forwardVoltage: { label: 'Forward voltage (10 mA)', unit: 'V', value: 0.7, min: 0.1 },
      zenerVoltage: { label: 'Zener voltage', unit: 'V', value: 5.1, min: 0.5 },
      powerRating: { label: 'Power rating', unit: 'W', value: 0.5, min: 0.001 },
    },
    tag: (p) => formatSI(p.zenerVoltage, 'V'),
    draw: () => `
      <path d="M -40 0 H 40 M -10 -10 V 10 L 10 0 Z M 5 -13 L 10 -10 V 10 L 15 13" />`,
  },
  // Pins: base, collector, emitter. The emitter arrow points out of an NPN.
  npn: {
    name: 'NPN transistor',
    letter: 'K',
    category: 'semiconductors',
    group: 'Transistors',
    pins: [{ x: -40, y: 0 }, { x: 20, y: -40 }, { x: 20, y: 40 }],
    props: {
      gain: { label: 'Current gain (hFE)', unit: '', value: 100, min: 1 },
      maxCurrent: { label: 'Max collector current', unit: 'A', value: 0.5, min: 0.001 },
      powerRating: { label: 'Power rating', unit: 'W', value: 0.5, min: 0.001 },
    },
    labelAt: transistorLabel,
    draw: () => `
      <circle r="24" cx="4" />
      <path d="M -40 0 H -8 M -8 -14 V 14 M -8 -6 L 20 -22 V -40 M -8 6 L 20 22 V 40" />
      <path class="fill" d="M 18 21 L 7.5 19.5 L 11.5 13 Z" />`,
  },
  // Pins: base, collector, emitter; collector at the bottom, emitter on top
  // (the usual way up for a PNP), the emitter arrow pointing in.
  pnp: {
    name: 'PNP transistor',
    letter: 'K',
    category: 'semiconductors',
    group: 'Transistors',
    pins: [{ x: -40, y: 0 }, { x: 20, y: 40 }, { x: 20, y: -40 }],
    props: {
      gain: { label: 'Current gain (hFE)', unit: '', value: 100, min: 1 },
      maxCurrent: { label: 'Max collector current', unit: 'A', value: 0.5, min: 0.001 },
      powerRating: { label: 'Power rating', unit: 'W', value: 0.5, min: 0.001 },
    },
    labelAt: transistorLabel,
    draw: () => `
      <circle r="24" cx="4" />
      <path d="M -40 0 H -8 M -8 -14 V 14 M -8 -6 L 20 -22 V -40 M -8 6 L 20 22 V 40" />
      <path class="fill" d="M -6 -7 L 4.5 -8 L 1 -14.5 Z" />`,
  },
  // N-channel enhancement MOSFET. Pins: gate, drain, source. The broken
  // channel line marks enhancement mode; the arrow points into the channel.
  nmos: {
    name: 'N-MOSFET',
    letter: 'K',
    category: 'semiconductors',
    group: 'Transistors',
    pins: [{ x: -40, y: 0 }, { x: 20, y: -40 }, { x: 20, y: 40 }],
    props: {
      thresholdVoltage: { label: 'Threshold voltage', unit: 'V', value: 2, min: 0.1 },
      onResistance: { label: 'On-resistance (Vgs 10 V)', unit: 'Ω', value: 2, min: 0.001 },
      maxCurrent: { label: 'Max drain current', unit: 'A', value: 0.5, min: 0.001 },
      powerRating: { label: 'Power rating', unit: 'W', value: 0.4, min: 0.001 },
    },
    labelAt: transistorLabel,
    draw: () => `
      <circle r="24" cx="4" />
      <path d="M -40 0 H -10 M -10 -12 V 12" />
      <path class="thick" d="M -4 -14 V -6 M -4 -4 V 4 M -4 6 V 14" />
      <path d="M -4 -10 H 20 V -40 M -4 10 H 20 V 40 M 6 0 H 20 V 10" />
      <path class="fill" d="M -2 0 L 6 -4 V 4 Z" />`,
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

// Glyphs marked `upright` (letters, the generator's sine) stay level when the
// part is turned: each is turned back about its centre (data-x, data-y, else
// the part's origin).
export function keepUpright(root: Element, rotation: number) {
  for (const el of root.querySelectorAll<SVGElement>('.upright')) {
    el.setAttribute('transform', `rotate(${-rotation} ${el.dataset.x ?? 0} ${el.dataset.y ?? 0})`);
  }
}

export function symbolMarkup(type: PartType, props: Props, broken = false): string {
  const part = PARTS[type];
  const pins = part.pins.map((p, i) => `<circle class="pin" data-pin="${i}" cx="${p.x}" cy="${p.y}" r="3" />`);
  return part.draw(props, broken) + pins.join('');
}
