import type { MeterMode, Point, Props, PropsByType, PartType, PropValue } from './types.ts';
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
// a small readout on the board showing the model's `reading`; a `selector`
// (a two-option choice prop, like a meter's AC/DC mode) is shown as a tab on
// that readout and flips between its options when clicked. `noLabel`
// parts show no reference on the board (Ground). `hit` sizes the invisible
// grab box when the symbol is bigger than the usual 80×40. `labelBelow` moves the
// label under the symbol when something else (like a third pin) is above it;
// `labelAt` places it exactly, as [x, y, text-anchor] in screen space for the
// part lying horizontally or vertically.

export const LIGHT_COLORS = {
  warm: '#ffc94d', // a plain filament lamp
  red: '#ff3b30',
  yellow: '#ffd60a',
  green: '#30d158',
  blue: '#0a84ff',
  white: '#e6f2ff',
} as const;

export type LightColor = keyof typeof LIGHT_COLORS;

export type CategoryId = 'sources' | 'passive' | 'semiconductors' | 'digital' | 'chips' | 'signals' | 'loads' | 'switches' | 'meters';

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
  { id: 'signals', label: 'Signals', icon: 'lightbulb' },
  { id: 'loads', label: 'Loads', icon: 'mode_fan' },
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
type ChoiceKeys<P> = { [K in keyof P]: P[K] extends string ? K : never }[keyof P] & string;

// One part type's definition, checked against its values P.
interface PartDef<P> {
  name: string;
  letter: string;
  category: CategoryId;
  group?: string;
  pins: Point[] | ((p: P) => Point[]);
  pinNames?: (p: P) => string[];
  props: { [K in keyof P]: SpecFor<P[K]> };
  tag?: (p: P) => string;
  glow?: { color: (p: P) => LightColor; radius: number };
  actuator?: { prop: BooleanKeys<P>; momentary: boolean };
  gauge?: boolean;
  display?: boolean;
  selector?: ChoiceKeys<P>;
  noLabel?: boolean;
  hit?: HitBox | ((p: P) => HitBox);
  labelBelow?: boolean;
  labelAt?: (vertical: boolean, p: P, rotation: number) => LabelSpot;
  draw: (p: P, broken: boolean) => string;
}

export type LabelSpot = [number, number, 'start' | 'middle' | 'end'];

// The invisible grab box: its size, centred on the part unless `x` says
// otherwise.
export interface HitBox {
  w: number;
  h: number;
  x?: number;
}

// The same, seen by code that handles any part type.
export interface AnyPartDef {
  name: string;
  letter: string;
  category: CategoryId;
  group?: string;
  pins: Point[] | ((p: Props) => Point[]);
  pinNames?: (p: Props) => string[];
  props: Record<string, PropSpec>;
  tag?: (p: Props) => string;
  glow?: { color: (p: Props) => LightColor; radius: number };
  actuator?: { prop: string; momentary: boolean };
  gauge?: boolean;
  display?: boolean;
  selector?: string;
  noLabel?: boolean;
  hit?: HitBox | ((p: Props) => HitBox);
  labelBelow?: boolean;
  labelAt?: (vertical: boolean, p: Props, rotation: number) => LabelSpot;
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

// A pin name with a bar over it (active low).
const OVER = (name: string) => `<tspan text-decoration="overline">${name}</tspan>`;

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

// A meter's knob: DC (average) or AC (true RMS of the AC part).
const METER_MODE: ChoiceSpec<MeterMode> = { label: 'Mode', value: 'DC', options: ['DC', 'AC'] };

// A small pin number or name beside a lead, kept level.
const pinText = (text: string, x: number, y: number, anchor = 'start') =>
  `<text class="chip-num upright" x="${x}" y="${y}" text-anchor="${anchor}" data-x="${x}" data-y="${y - 3}">${text}</text>`;

// Supply rails (one pin, against the board's 0 V): a bar with the voltage
// written over it.
const railSymbol = (text: string) => `
  <path d="M 0 20 V 0 M -12 0 H 12" />
  <text class="sym-text upright" y="-6" text-anchor="middle" data-y="-10">${text}</text>`;

// Arcs above a sounder while it sounds (shown when the part is .active).
const SOUND_WAVES = `
  <path class="when-on waves" d="M 18 -14 A 10 10 0 0 1 18 -26 M 23 -10 A 16 16 0 0 1 23 -30" />`;

// Seven-segment display: segments a–g, then the dot, as [path or circle].
const SEGMENTS = [
  'M -8 -22 H 8', // a
  'M 10 -20 V -6', // b
  'M 10 -2 V 12', // c
  'M -8 14 H 8', // d
  'M -10 -2 V 12', // e
  'M -10 -20 V -6', // f
  'M -8 -4 H 8', // g
];
const segmentMarkup = (cls: string, lit: boolean) =>
  SEGMENTS.map((d, k) => `<path class="${cls}" d="${d}"${lit ? ` data-seg="${k}" style="opacity: 0"` : ''} />`).join('') +
  `<circle class="${cls} dot" cx="16" cy="14" r="2"${lit ? ' data-seg="7" style="opacity: 0"' : ''} />`;

// Relays and contactors (DIN EN 60617-7): the coil is a rectangle between A1
// (top) and A2, its contacts stand beside it, joined to it by a dashed line
// of action. Contacts are drawn at rest; while the coil is energized (the
// part is .active) the moving blades show in their other position. Further
// contacts are added to the right, so changing how many contacts a relay
// has leaves the coil and the other pins (and their wires) where they are; a
// make contact stands in one line, its make pin straight above the common.

// How many contacts a relay has: its setting, as a whole number from 1 to 4.
export const relayContacts = (p: { contacts: number }) => Math.min(4, Math.max(1, Math.round(p.contacts)));

function relayLayout(p: { contacts: number }) {
  const coil = -40;
  const contacts = Array.from({ length: relayContacts(p) }, (_, k) => coil + 60 + 60 * k);
  return { coil, contacts };
}

// A relay's pins, named: the coil's A1 and A2, then per contact k its common
// (`c<k>`), break (`nc<k>`, changeover only) and make (`no<k>`).
export function relayPins(p: PropsByType['relay']): (Point & { name: string })[] {
  const { coil, contacts } = relayLayout(p);
  return [
    { name: 'A1', x: coil, y: -40 },
    { name: 'A2', x: coil, y: 40 },
    ...contacts.flatMap((x, k) => [
      { name: `c${k}`, x, y: 40 },
      ...(p.contactType === 'SPDT'
        ? [{ name: `nc${k}`, x: x - 20, y: -40 }, { name: `no${k}`, x: x + 20, y: -40 }]
        : [{ name: `no${k}`, x, y: -40 }]),
    ]),
  ];
}

// Label to the left of the coil, wherever that ends up on screen.
function coilLabel(coil: number, rotation: number): LabelSpot {
  const x = coil - 18;
  switch (((rotation % 360) + 360) % 360) {
    case 90:
      return [0, x, 'middle'];
    case 180:
      return [-x, 4, 'start'];
    case 270:
      return [0, -x + 8, 'middle'];
    default:
      return [x, 4, 'end'];
  }
}

const coilMarkup = (c: number) => `
  <path d="M ${c} -40 V -8 M ${c} 8 V 40" />
  <rect x="${c - 14}" y="-8" width="28" height="16" />
  ${pinText('A1', c + 4, -30)}${pinText('A2', c + 4, 36)}`;

// Contact k around x, numbered as in EN 50005: a changeover's common (k1)
// below, break (k2) and make (k4) above; a make contact's k3 below, k4 above.
const changeover = (x: number, k: number) => `
  <path d="M ${x} 40 V 14 M ${x - 20} -40 V -14 H ${x - 8} M ${x + 20} -40 V -14 H ${x + 8}" />
  <path class="when-off" d="M ${x} 14 L ${x - 9} -16" />
  <path class="when-on" d="M ${x} 14 L ${x + 9} -16" />
  ${pinText(`${k}1`, x + 4, 36)}${pinText(`${k}2`, x - 17, -30)}${pinText(`${k}4`, x + 23, -30)}`;

const makeContact = (x: number, k: number) => `
  <path d="M ${x} 40 V 14 M ${x} -40 V -12" />
  <path class="when-off" d="M ${x} 14 L ${x - 10} -10" />
  <path class="when-on" d="M ${x} 14 V -12" />
  ${pinText(`${k}3`, x + 4, 36)}${pinText(`${k}4`, x + 4, -30)}`;

// How many main poles a contactor has: its setting, as a whole number 1–4.
// They stand at 40-unit steps right of the coil, so adding or removing one
// leaves the others (and their wires) in place.
export const contactorPoles = (p: { poles: number }) => Math.min(4, Math.max(1, Math.round(p.poles)));
const poleXs = (p: { poles: number }) => Array.from({ length: contactorPoles(p) }, (_, k) => -20 + 40 * k);

// A contactor's make contact at x, with the contactor function's half-circle
// closing the end of its fixed contact (on the side away from the blade);
// pins numbered `top` and `top + 1`.
const mainContact = (x: number, top: number) => `
  <path d="M ${x} -40 V -10 M ${x} 40 V 14" />
  <path d="M ${x} -18 A 4 4 0 0 1 ${x} -10" />
  <path class="when-off" d="M ${x} 14 L ${x - 10} -10" />
  <path class="when-on" d="M ${x} 14 V -10" />
  ${pinText(String(top), x + 4, -30)}${pinText(String(top + 1), x + 4, 36)}`;

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
  // Supply rails, each held against the board's 0 V (Ground) like a supply
  // whose other terminal is grounded.
  rail: {
    name: '+V rail',
    letter: 'X',
    category: 'sources',
    group: 'Rails',
    pins: [{ x: 0, y: 20 }],
    props: {
      voltage: { label: 'Voltage', unit: 'V', value: 5 },
      maxCurrent: { label: 'Max current', unit: 'A', value: 3, min: 0.001 },
    },
    noLabel: true,
    draw: (p) => railSymbol(`${p.voltage >= 0 ? '+' : ''}${formatSI(p.voltage, 'V')}`),
  },
  // One phase of the mains (voltage as RMS), against neutral at 0 V.
  phase: {
    name: 'AC phase',
    letter: 'X',
    category: 'sources',
    group: 'Rails',
    pins: [{ x: 0, y: 20 }],
    props: {
      voltage: { label: 'Voltage (rms)', unit: 'V', value: 120, min: 0 },
      frequency: { label: 'Frequency', unit: 'Hz', value: 50, min: 0.01, max: 1000 },
      phase: { label: 'Phase', unit: '°', value: 0 },
      maxCurrent: { label: 'Breaker rating', unit: 'A', value: 16, min: 0.001 },
    },
    noLabel: true,
    draw: (p) => railSymbol(`L ${formatSI(p.voltage, 'V')}~ ${formatSI(p.frequency, 'Hz')}`),
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
    category: 'signals',
    group: 'Lights',
    pins: [{ x: -40, y: 0 }, { x: 40, y: 0 }],
    props: {
      color: { label: 'Colour', value: 'warm', options: ['warm', 'red', 'yellow', 'green', 'blue', 'white'] },
      ratedVoltage: { label: 'Rated voltage', unit: 'V', value: 6, min: 0.001 },
      ratedPower: { label: 'Rated power', unit: 'W', value: 1, min: 0.001 },
    },
    tag: (p) => `${formatSI(p.ratedVoltage, 'V')} ${formatSI(p.ratedPower, 'W')}`,
    glow: { color: (p) => p.color, radius: 40 },
    draw: () => `
      <circle class="bulb" r="14" />
      <path d="M -40 0 H -14 M 14 0 H 40 M -10 -10 L 10 10 M 10 -10 L -10 10" />`,
  },
  led: {
    name: 'LED',
    letter: 'P',
    category: 'signals',
    group: 'Lights',
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
  // A panel indicator: the lamp behind a lens (the outer ring).
  pilot: {
    name: 'Pilot lamp',
    letter: 'P',
    category: 'signals',
    group: 'Indicators',
    pins: [{ x: -40, y: 0 }, { x: 40, y: 0 }],
    props: {
      color: { label: 'Lens colour', value: 'green', options: ['warm', 'red', 'yellow', 'green', 'blue', 'white'] },
      ratedVoltage: { label: 'Rated voltage', unit: 'V', value: 120, min: 0.001 },
      ratedPower: { label: 'Rated power', unit: 'W', value: 1, min: 0.001 },
    },
    tag: (p) => formatSI(p.ratedVoltage, 'V'),
    glow: { color: (p) => p.color, radius: 34 },
    draw: () => `
      <circle class="bulb tinted" r="14" />
      <circle r="18" />
      <path d="M -40 0 H -18 M 18 0 H 40 M -10 -10 L 10 10 M 10 -10 L -10 10" />`,
  },
  // Red, amber and green lamps stacked, each from its pin to a common bus.
  stackLight: {
    name: 'Stack light',
    letter: 'P',
    category: 'signals',
    group: 'Indicators',
    pins: [{ x: -40, y: -40 }, { x: -40, y: 0 }, { x: -40, y: 40 }, { x: 40, y: 60 }],
    props: {
      ratedVoltage: { label: 'Rated voltage', unit: 'V', value: 24, min: 0.001 },
      ratedPower: { label: 'Rated power (each)', unit: 'W', value: 2, min: 0.001 },
    },
    hit: { w: 80, h: 140 },
    labelAt: () => [28, -52, 'start'],
    draw: () => `
      <path d="M -40 -40 H -14 M -40 0 H -14 M -40 40 H -14 M 14 -40 H 24 M 14 0 H 24 M 14 40 H 24 M 24 -40 V 60 H 40" />
      ${(['red', 'yellow', 'green'] as const)
        .map((c, k) => {
          const y = -40 + 40 * k;
          return `<rect class="rgb-off" x="-14" y="${y - 14}" width="28" height="28" rx="5" style="fill: ${LIGHT_COLORS[c]}" />
            <rect class="seg-lit rgb-lit" data-seg="${k}" x="-14" y="${y - 14}" width="28" height="28" rx="5" style="opacity: 0; fill: ${LIGHT_COLORS[c]}" />
            <rect x="-14" y="${y - 14}" width="28" height="28" rx="5" />`;
        })
        .join('')}
      ${pinText('R', -37, -44)}${pinText('A', -37, -4)}${pinText('G', -37, 36)}`,
  },
  // Pins R, G, B, then the common one. Inside, a spot of each colour lights
  // with its LED; where spots overlap their light adds up (red + green =
  // yellow, all three = white).
  rgbLed: {
    name: 'RGB LED',
    letter: 'P',
    category: 'signals',
    group: 'Lights',
    pins: [{ x: -40, y: -20 }, { x: -40, y: 0 }, { x: -40, y: 20 }, { x: 40, y: 0 }],
    props: {
      common: { label: 'Common', value: 'cathode', options: ['cathode', 'anode'] },
      redVoltage: { label: 'Red forward voltage', unit: 'V', value: 2, min: 0.1 },
      greenVoltage: { label: 'Green forward voltage', unit: 'V', value: 3, min: 0.1 },
      blueVoltage: { label: 'Blue forward voltage', unit: 'V', value: 3, min: 0.1 },
      maxCurrent: { label: 'Max current (each)', unit: 'A', value: 0.02, min: 0.0001 },
    },
    draw: (p) => `
      <path d="M -40 -20 H -24 L -13 -9 M -40 0 H -16 M -40 20 H -24 L -13 9 M 40 0 H 16" />
      <circle r="16" />
      <g class="rgb-mix">
        ${['red', 'green', 'blue']
          .map((c, k) => {
            const [x, y] = [[-3.5, -3], [3.5, -3], [0, 3.5]][k];
            return `<circle class="rgb-off" cx="${x}" cy="${y}" r="7" style="fill: ${LIGHT_COLORS[c as LightColor]}" />
              <circle class="seg-lit rgb-lit" data-seg="${k}" cx="${x}" cy="${y}" r="7" style="opacity: 0; fill: ${LIGHT_COLORS[c as LightColor]}" />`;
          })
          .join('')}
      </g>
      <path d="M 8 -18 L 15 -25 M 10 -25 H 15 V -20 M 15 -13 L 22 -20 M 17 -20 H 22 V -15" />
      ${pinText('R', -37, -24)}${pinText('G', -37, -4)}${pinText('B', -37, 16)}${pinText(p.common === 'cathode' ? 'K' : 'A', 30, -4)}`,
  },
  // Ten segments (pins 1–10 down the left), then the common pin.
  barGraph: {
    name: 'LED bar graph',
    letter: 'P',
    category: 'signals',
    group: 'Displays',
    pins: [...Array.from({ length: 10 }, (_, k) => ({ x: -40, y: -100 + 20 * k })), { x: 40, y: 80 }],
    props: {
      color: { label: 'Colour', value: 'green', options: ['red', 'yellow', 'green', 'blue', 'white'] },
      common: { label: 'Common', value: 'cathode', options: ['cathode', 'anode'] },
      forwardVoltage: { label: 'Forward voltage', unit: 'V', value: 2, min: 0.1 },
      maxCurrent: { label: 'Max current (segment)', unit: 'A', value: 0.02, min: 0.0001 },
    },
    glow: { color: (p) => p.color, radius: 0 },
    hit: { w: 80, h: 220 },
    labelAt: () => [24, -114, 'start'],
    draw: (p) => `
      <rect x="-20" y="-110" width="40" height="200" rx="3" />
      <path d="${Array.from({ length: 10 }, (_, k) => `M -40 ${-100 + 20 * k} H -20`).join(' ')} M 20 80 H 40" />
      ${Array.from({ length: 10 }, (_, k) => {
        const y = -104 + 20 * k;
        return `<rect class="bar-off" x="-10" y="${y}" width="20" height="8" rx="1" />
          <rect class="bar-lit" data-seg="${k}" x="-10" y="${y}" width="20" height="8" rx="1" style="opacity: 0" />`;
      }).join('')}
      ${pinText(p.common === 'cathode' ? 'K' : 'A', 23, 76)}`,
  },
  // Two LED symbols back to back: red (top) conducts from pin 0, green
  // (bottom) from pin 1.
  bicolorLed: {
    name: 'Bi-colour LED',
    letter: 'P',
    category: 'signals',
    group: 'Lights',
    pins: [{ x: -40, y: 0 }, { x: 40, y: 0 }],
    props: {
      redVoltage: { label: 'Red forward voltage', unit: 'V', value: 2, min: 0.1 },
      greenVoltage: { label: 'Green forward voltage', unit: 'V', value: 2.2, min: 0.1 },
      maxCurrent: { label: 'Max current', unit: 'A', value: 0.02, min: 0.0001 },
    },
    draw: () => `
      <path d="M -40 0 H -24 M 24 0 H 40 M -24 -12 V 12 M 24 -12 V 12 M -24 -12 H -8 M 8 -12 H 24 M -24 12 H -8 M 8 12 H 24" />
      <path class="rgb-off" d="M -8 -20 V -4 L 8 -12 Z" style="fill: ${LIGHT_COLORS.red}" />
      <path class="seg-lit rgb-lit" data-seg="0" d="M -8 -20 V -4 L 8 -12 Z" style="opacity: 0; fill: ${LIGHT_COLORS.red}" />
      <path d="M -8 -20 V -4 L 8 -12 Z M 8 -20 V -4" />
      <path class="rgb-off" d="M 8 4 V 20 L -8 12 Z" style="fill: ${LIGHT_COLORS.green}" />
      <path class="seg-lit rgb-lit" data-seg="1" d="M 8 4 V 20 L -8 12 Z" style="opacity: 0; fill: ${LIGHT_COLORS.green}" />
      <path d="M 8 4 V 20 L -8 12 Z M -8 4 V 20" />
      <path d="M 4 -24 L 11 -31 M 6 -31 H 11 V -26 M 11 -19 L 18 -26 M 13 -26 H 18 V -21" />`,
  },
  // Pins: segments a–g and the dot (dp), then the common pin.
  sevenSeg: {
    name: '7-segment display',
    letter: 'P',
    category: 'signals',
    group: 'Displays',
    pins: [
      ...[-30, -10, 10, 30].map((y) => ({ x: -60, y })),
      ...[-30, -10, 10, 30].map((y) => ({ x: 60, y })),
      { x: 0, y: 60 },
    ],
    props: {
      color: { label: 'Colour', value: 'red', options: ['red', 'yellow', 'green', 'blue', 'white'] },
      common: { label: 'Common', value: 'cathode', options: ['cathode', 'anode'] },
      forwardVoltage: { label: 'Forward voltage', unit: 'V', value: 2, min: 0.1 },
      maxCurrent: { label: 'Max current (segment)', unit: 'A', value: 0.02, min: 0.0001 },
    },
    glow: { color: (p) => p.color, radius: 44 },
    hit: { w: 120, h: 100 },
    labelAt: (vertical) => (vertical ? [64, -44, 'start'] : [44, -46, 'start']),
    draw: (p) =>
      chip({ w: 40, h: 40 }, '', [
        ['a', null, -60, -30], ['b', null, -60, -10], ['c', null, -60, 10], ['d', null, -60, 30],
        ['e', null, 60, -30], ['f', null, 60, -10], ['g', null, 60, 10], ['dp', null, 60, 30],
        [p.common === 'cathode' ? 'K' : 'A', null, 0, 60],
      ]) +
      `<g class="segments">${segmentMarkup('seg-off', false)}${segmentMarkup('seg-lit', true)}</g>`,
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
  // Two-way (stairway) switch, DIN: the blade from the common (left) rests on
  // throw 1 (top right) or, thrown, on throw 2 (bottom right).
  changeover: {
    name: 'Changeover switch',
    letter: 'S',
    category: 'switches',
    group: 'Toggle',
    pins: [{ x: -40, y: 0 }, { x: 40, y: -20 }, { x: 40, y: 20 }], // common, 1, 2
    props: {
      thrown: { label: 'Thrown (to 2)', value: false },
      maxCurrent: { label: 'Max current', unit: 'A', value: 5, min: 0.001 },
    },
    actuator: { prop: 'thrown', momentary: false },
    draw: ({ thrown }) => `
      <path d="M -40 0 H -14 L 14 ${thrown ? 20 : -20} M 40 -20 H 14 M 40 20 H 14" />`,
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
  // DIN EN 60617: a circle with M, and = (DC), 1~ or 3~ under it. Pins 0
  // and 1 left and right (+ and − for DC); a three-phase motor's third
  // terminal below. While it turns, a rotor mark spins round it.
  motor: {
    name: 'Motor',
    letter: 'M',
    category: 'loads',
    group: 'Motors',
    pins: (p) => [{ x: -40, y: 0 }, { x: 40, y: 0 }, ...(p.supply === 'AC 3~' ? [{ x: 0, y: 40 }] : [])],
    props: {
      supply: { label: 'Supply', value: 'DC', options: ['DC', 'AC 1~', 'AC 3~'] },
      ratedVoltage: { label: 'Rated voltage', unit: 'V', value: 12, min: 0.1 },
      ratedPower: { label: 'Rated power', unit: 'W', value: 10, min: 0.01 },
    },
    tag: (p) => `${formatSI(p.ratedVoltage, 'V')} ${formatSI(p.ratedPower, 'W')}`,
    labelAt: (vertical) => (vertical ? [30, 4, 'start'] : [0, -30, 'middle']),
    draw: (p) => `
      <path d="M -40 0 H -18 M 18 0 H 40${p.supply === 'AC 3~' ? ' M 0 18 V 40' : ''}" />
      <circle r="18" />
      <text class="meter-letter upright" y="2" text-anchor="middle" data-y="-2">M</text>
      <text class="sym-text upright" y="12" text-anchor="middle" data-y="9">${p.supply === 'DC' ? '=' : p.supply === 'AC 1~' ? '1~' : '3~'}</text>
      ${p.supply === 'DC' ? '<text class="sym-text" x="-30" y="-6" text-anchor="middle">+</text>' : ''}
      <g class="when-on">
        <path class="rotor" d="M 0 -23 A 23 23 0 0 1 20 -11.5 M 20 -11.5 l -1 -5 M 20 -11.5 l -5 1" />
        <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="0.8s" repeatCount="indefinite" />
      </g>`,
  },
  // Heating element (a resistance with heating marks); glows red when hot.
  heater: {
    name: 'Heater',
    letter: 'E',
    category: 'loads',
    group: 'Heat',
    pins: [{ x: -40, y: 0 }, { x: 40, y: 0 }],
    props: {
      ratedVoltage: { label: 'Rated voltage', unit: 'V', value: 120, min: 0.1 },
      ratedPower: { label: 'Rated power', unit: 'W', value: 1000, min: 0.01 },
    },
    tag: (p) => `${formatSI(p.ratedVoltage, 'V')} ${formatSI(p.ratedPower, 'W')}`,
    glow: { color: () => 'red', radius: 36 },
    draw: () => `
      <path d="M -40 0 H -20 M 20 0 H 40" />
      <rect class="bulb" x="-20" y="-8" width="40" height="16" />
      <path d="M -16 4 L -12 -4 M -6 4 L -2 -4 M 4 4 L 8 -4 M 14 4 L 18 -4" />`,
  },
  // A coil (DIN actuator rectangle) with its plunger above: out at rest, in
  // when pulled.
  solenoid: {
    name: 'Solenoid',
    letter: 'M',
    category: 'loads',
    group: 'Electromagnetic',
    pins: [{ x: -40, y: 0 }, { x: 40, y: 0 }],
    props: {
      ratedVoltage: { label: 'Rated voltage', unit: 'V', value: 12, min: 0.1 },
      ratedCurrent: { label: 'Rated current', unit: 'A', value: 0.5, min: 0.0001 },
      inductance: { label: 'Inductance', unit: 'H', value: 0.05, min: 1e-6 },
    },
    tag: (p) => formatSI(p.ratedVoltage, 'V'),
    draw: () => `
      <path d="M -40 0 H -14 M 14 0 H 40" />
      <rect x="-14" y="-8" width="28" height="16" />
      <path class="when-off" d="M 0 -8 V -22 M -6 -22 H 6" />
      <path class="when-on" d="M 0 -8 V -13 M -6 -13 H 6" />`,
  },
  // Fluorescent tube: filament A (pins 0–1) at the left end, B (pins 2–3) at
  // the right; the arc runs between them.
  tube: {
    name: 'Fluorescent tube',
    letter: 'E',
    category: 'loads',
    group: 'Fluorescent',
    pins: [{ x: -60, y: -20 }, { x: -60, y: 20 }, { x: 60, y: -20 }, { x: 60, y: 20 }],
    props: {
      ratedPower: { label: 'Rated power', unit: 'W', value: 20, min: 0.1 },
      arcVoltage: { label: 'Arc voltage', unit: 'V', value: 60, min: 1 },
      strikeVoltage: { label: 'Strike voltage', unit: 'V', value: 250, min: 1 },
    },
    tag: (p) => formatSI(p.ratedPower, 'W'),
    glow: { color: () => 'white', radius: 60 },
    hit: { w: 130, h: 60 },
    draw: () => `
      <rect class="bulb" x="-50" y="-10" width="100" height="20" rx="3" />
      <path d="M -60 -20 H -44 V 6 M -60 20 H -44 V 6 M 60 -20 H 44 V 6 M 60 20 H 44 V 6" />
      <path d="M -44 -6 V 6 M 44 -6 V 6" />`,
  },
  // The tube's choke: a coil on an iron core.
  ballast: {
    name: 'Ballast',
    letter: 'R',
    category: 'loads',
    group: 'Fluorescent',
    pins: [{ x: -40, y: 0 }, { x: 40, y: 0 }],
    props: {
      inductance: { label: 'Inductance', unit: 'H', value: 0.95, min: 1e-6 },
      resistance: { label: 'Winding resistance', unit: 'Ω', value: 10, min: 0 },
      maxCurrent: { label: 'Max current', unit: 'A', value: 0.6, min: 0.001 },
    },
    tag: (p) => formatSI(p.inductance, 'H'),
    draw: () => `
      <path d="M -40 0 H -20 A 5 5 0 0 1 -10 0 A 5 5 0 0 1 0 0 A 5 5 0 0 1 10 0 A 5 5 0 0 1 20 0 H 40 M -20 -9 H 20" />`,
  },
  // Glow starter: a bimetal contact inside a small glow lamp.
  starter: {
    name: 'Starter',
    letter: 'S',
    category: 'loads',
    group: 'Fluorescent',
    pins: [{ x: -40, y: 0 }, { x: 40, y: 0 }],
    props: {
      glowVoltage: { label: 'Glow voltage (rms)', unit: 'V', value: 80, min: 1 },
    },
    glow: { color: () => 'red', radius: 22 },
    draw: () => `
      <path d="M -40 0 H -12 M 12 0 H 40" />
      <circle class="bulb" r="12" />
      <path class="when-off" d="M -12 0 H -6 V -5 Q 0 -10 4 -5" />
      <path class="when-on" d="M -12 0 H -6 V -5 Q 2 -7 6 0" />
      <path d="M 6 0 H 12" />`,
  },
  // Magnetic buzzer (DIN: a dome on its base); + is pin 0.
  buzzer: {
    name: 'Buzzer',
    letter: 'P',
    category: 'signals',
    group: 'Sounders',
    pins: [{ x: -40, y: 0 }, { x: 40, y: 0 }],
    props: {
      ratedVoltage: { label: 'Rated voltage', unit: 'V', value: 12, min: 0.1 },
      ratedCurrent: { label: 'Rated current', unit: 'A', value: 0.03, min: 0.0001 },
    },
    draw: () => `
      <path d="M -40 0 H 40 M -14 0 A 14 14 0 0 1 14 0" />
      <text class="sym-text" x="-30" y="-6" text-anchor="middle">+</text>
      ${SOUND_WAVES}`,
  },
  // Piezo sounder: a crystal between two plates; + is pin 0.
  piezo: {
    name: 'Piezo buzzer',
    letter: 'P',
    category: 'signals',
    group: 'Sounders',
    pins: [{ x: -40, y: 0 }, { x: 40, y: 0 }],
    props: {
      ratedVoltage: { label: 'Rated voltage', unit: 'V', value: 5, min: 0.1 },
      ratedCurrent: { label: 'Rated current', unit: 'A', value: 0.01, min: 0.0001 },
      frequency: { label: 'Tone', unit: 'Hz', value: 2700, min: 100, max: 8000 },
    },
    draw: () => `
      <path d="M -40 0 H -8 M 8 0 H 40 M -8 -12 V 12 M 8 -12 V 12" />
      <rect x="-4" y="-9" width="8" height="18" />
      <text class="sym-text" x="-30" y="-6" text-anchor="middle">+</text>
      ${SOUND_WAVES}`,
  },
  // Electromechanical bell (DIN: a bowl under its base).
  bell: {
    name: 'Bell',
    letter: 'P',
    category: 'signals',
    group: 'Sounders',
    pins: [{ x: -40, y: 0 }, { x: 40, y: 0 }],
    props: {
      ratedVoltage: { label: 'Rated voltage (rms)', unit: 'V', value: 120, min: 0.1 },
      ratedCurrent: { label: 'Rated current', unit: 'A', value: 0.1, min: 0.0001 },
    },
    draw: () => `
      <path d="M -40 0 H 40 M -14 0 A 14 14 0 0 0 14 0" />
      ${SOUND_WAVES}`,
  },
  // Loudspeaker (DIN: magnet and cone).
  speaker: {
    name: 'Speaker',
    letter: 'P',
    category: 'signals',
    group: 'Sounders',
    pins: [{ x: -40, y: 0 }, { x: 40, y: 0 }],
    props: {
      impedance: { label: 'Impedance', unit: 'Ω', value: 8, min: 0.1 },
      ratedPower: { label: 'Rated power', unit: 'W', value: 0.5, min: 0.001 },
    },
    tag: (p) => formatSI(p.impedance, 'Ω'),
    draw: () => `
      <path d="M -40 0 H -14 M 40 0 H 24 V 20 H -9 V 6" />
      <rect x="-14" y="-6" width="10" height="12" />
      <path d="M -4 -6 L 8 -16 V 16 L -4 6" />
      ${SOUND_WAVES}`,
  },
  // Pins: see relayPins.
  relay: {
    name: 'Relay',
    letter: 'K',
    category: 'switches',
    group: 'Relays',
    pins: (p) => relayPins(p).map(({ x, y }) => ({ x, y })),
    pinNames: (p) => relayPins(p).map(({ name }) => name),
    props: {
      coilVoltage: { label: 'Coil voltage', unit: 'V', value: 12, min: 0.1 },
      coilResistance: { label: 'Coil resistance', unit: 'Ω', value: 400, min: 0.1 },
      contacts: { label: 'Contacts', unit: '', value: 1, min: 1, max: 4 },
      contactType: { label: 'Contact type', value: 'SPDT', options: ['SPDT', 'SPST'] },
      maxCurrent: { label: 'Contact rating', unit: 'A', value: 10, min: 0.001 },
    },
    hit: (p) => {
      const { coil, contacts } = relayLayout(p);
      const [left, right] = [coil - 16, contacts[contacts.length - 1] + 26];
      return { w: right - left, h: 90, x: (left + right) / 2 };
    },
    labelAt: (_vertical, p, rotation) => coilLabel(relayLayout(p).coil, rotation),
    draw: (p) => {
      const { coil, contacts } = relayLayout(p);
      return `
        ${coilMarkup(coil)}
        ${contacts.map((x, k) => (p.contactType === 'SPDT' ? changeover : makeContact)(x, k + 1)).join('')}
        <path class="link" d="M ${coil + 14} 0 H ${contacts[contacts.length - 1] - 4}" />`;
    },
  },
  // Pins: A1, A2, then per pole its line and load side: 1–2, 3–4, 5–6, 7–8
  // (L1–T1, L2–T2, L3–T3, and a fourth pole).
  contactor: {
    name: 'Contactor (AC)',
    letter: 'Q',
    category: 'switches',
    group: 'Relays',
    pins: (p) => [
      { x: -60, y: -40 },
      { x: -60, y: 40 },
      ...poleXs(p).flatMap((x) => [{ x, y: -40 }, { x, y: 40 }]),
    ],
    props: {
      coilVoltage: { label: 'Coil voltage (rms)', unit: 'V', value: 120, min: 0.1 },
      coilResistance: { label: 'Coil impedance', unit: 'Ω', value: 2400, min: 0.1 },
      poles: { label: 'Poles', unit: '', value: 3, min: 1, max: 4 },
      maxCurrent: { label: 'Contact rating', unit: 'A', value: 16, min: 0.001 },
    },
    hit: (p) => {
      const right = poleXs(p)[contactorPoles(p) - 1] + 16;
      return { w: right + 76, h: 90, x: (right - 76) / 2 };
    },
    labelAt: (_vertical, _p, rotation) => coilLabel(-60, rotation),
    draw: (p) => {
      const xs = poleXs(p);
      return `
        ${coilMarkup(-60)}
        ${xs.map((x, k) => mainContact(x, 2 * k + 1)).join('')}
        <path class="link" d="M -46 0 H ${xs[xs.length - 1] - 5}" />`;
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
  // CD4511: BCD in (A–D), latch enable LE, lamp test L̄T̄ and blanking B̄L̄
  // (active low); segment outputs a–g that source current for a common-
  // cathode display. Pins in DIP order 1–16.
  cd4511: {
    name: 'CD4511 decoder',
    letter: 'K',
    category: 'chips',
    group: 'Counters & decoders',
    pins: [
      { x: -60, y: -40 }, { x: -60, y: -20 }, { x: -60, y: 20 }, { x: -60, y: 40 }, { x: -60, y: 60 }, { x: -60, y: 0 },
      { x: -60, y: -60 }, { x: 0, y: 80 }, { x: 60, y: 20 }, { x: 60, y: 0 }, { x: 60, y: -20 }, { x: 60, y: -40 },
      { x: 60, y: -60 }, { x: 60, y: 60 }, { x: 60, y: 40 }, { x: 0, y: -80 },
    ],
    props: { maxCurrent: { label: 'Max output current', unit: 'A', value: 0.025, min: 0.001 } },
    tag: () => 'CD4511',
    hit: { w: 120, h: 160 },
    labelAt: () => [44, -84, 'start'],
    draw: () =>
      chip({ w: 40, h: 70 }, '4511', [
        ['B', 1, -60, -40], ['C', 2, -60, -20], [OVER('LT'), 3, -60, 20], [OVER('BL'), 4, -60, 40], ['LE', 5, -60, 60],
        ['D', 6, -60, 0], ['A', 7, -60, -60], ['VSS', 8, 0, 80], ['e', 9, 60, 20], ['d', 10, 60, 0], ['c', 11, 60, -20],
        ['b', 12, 60, -40], ['a', 13, 60, -60], ['g', 14, 60, 60], ['f', 15, 60, 40], ['VDD', 16, 0, -80],
      ]),
  },
  // CD4017: decade counter; each rising CLK edge (with INH low) moves the one
  // high output Q0 → Q9 → Q0; RST high returns to Q0; CO is high for 0–4.
  cd4017: {
    name: 'CD4017 counter',
    letter: 'K',
    category: 'chips',
    group: 'Counters & decoders',
    pins: [
      { x: 60, y: 0 }, { x: 60, y: -80 }, { x: 60, y: -100 }, { x: 60, y: -60 }, { x: 60, y: 20 }, { x: 60, y: 40 },
      { x: 60, y: -40 }, { x: 0, y: 120 }, { x: 60, y: 60 }, { x: 60, y: -20 }, { x: 60, y: 80 }, { x: 60, y: 100 },
      { x: -60, y: -20 }, { x: -60, y: -60 }, { x: -60, y: 20 }, { x: 0, y: -120 },
    ],
    props: { maxCurrent: { label: 'Max output current', unit: 'A', value: 0.01, min: 0.001 } },
    tag: () => 'CD4017',
    hit: { w: 120, h: 250 },
    labelAt: () => [44, -124, 'start'],
    draw: () =>
      chip({ w: 40, h: 110 }, '4017', [
        ['Q5', 1, 60, 0], ['Q1', 2, 60, -80], ['Q0', 3, 60, -100], ['Q2', 4, 60, -60], ['Q6', 5, 60, 20], ['Q7', 6, 60, 40],
        ['Q3', 7, 60, -40], ['VSS', 8, 0, 120], ['Q8', 9, 60, 60], ['Q4', 10, 60, -20], ['Q9', 11, 60, 80], ['CO', 12, 60, 100],
        ['INH', 13, -60, -20], ['<tspan dx="5">CLK</tspan>', 14, -60, -60], ['RST', 15, -60, 20], ['VDD', 16, 0, -120],
      ]) + '<path class="clock-mark" d="M -40 -64 L -34 -60 L -40 -56" />',
  },
  // LM358: two op-amps on one supply (GND to VCC); outputs swing from GND up
  // to about VCC − 1.5 V.
  lm358: {
    name: 'LM358 op-amp',
    letter: 'K',
    category: 'chips',
    group: 'Op-amps',
    pins: [
      { x: 60, y: -20 }, { x: -60, y: -20 }, { x: -60, y: -40 }, { x: 0, y: 60 },
      { x: -60, y: 20 }, { x: -60, y: 40 }, { x: 60, y: 20 }, { x: 0, y: -60 },
    ],
    props: { maxCurrent: { label: 'Max output current', unit: 'A', value: 0.04, min: 0.001 } },
    tag: () => 'LM358',
    hit: { w: 120, h: 120 },
    labelAt: () => [44, -64, 'start'],
    draw: () =>
      chip({ w: 40, h: 50 }, '358', [
        ['1OUT', 1, 60, -20], ['1IN−', 2, -60, -20], ['1IN+', 3, -60, -40], ['GND', 4, 0, 60],
        ['2IN+', 5, -60, 20], ['2IN−', 6, -60, 40], ['2OUT', 7, 60, 20], ['VCC', 8, 0, -60],
      ]),
  },
  // ULN2003: seven Darlington sinks. A high input (pins 1–7) pulls its output
  // (16–10) down to GND; each output has a flyback diode to COM (pin 9).
  uln2003: {
    name: 'ULN2003 driver',
    letter: 'K',
    category: 'chips',
    group: 'Drivers',
    pins: [
      ...Array.from({ length: 7 }, (_, k) => ({ x: -60, y: -60 + 20 * k })),
      { x: 0, y: 80 },
      { x: 0, y: -80 },
      ...Array.from({ length: 7 }, (_, k) => ({ x: 60, y: 60 - 20 * k })),
    ],
    props: { maxCurrent: { label: 'Max output current', unit: 'A', value: 0.5, min: 0.001 } },
    tag: () => 'ULN2003',
    hit: { w: 120, h: 160 },
    labelAt: () => [44, -84, 'start'],
    draw: () =>
      chip({ w: 40, h: 70 }, '2003', [
        ...Array.from({ length: 7 }, (_, k): ChipPin => [`IN${k + 1}`, k + 1, -60, -60 + 20 * k]),
        ['GND', 8, 0, 80],
        ['COM', 9, 0, -80],
        ...Array.from({ length: 7 }, (_, k): ChipPin => [`OUT${7 - k}`, 10 + k, 60, 60 - 20 * k]),
      ]),
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
  // A probe tip touching its pin, the channel written above it in the
  // trace's colour.
  scopeProbe: {
    name: 'Scope probe',
    letter: 'P',
    category: 'meters',
    group: 'Oscilloscope',
    pins: [{ x: 0, y: 20 }],
    props: {
      channel: { label: 'Channel', value: 'CH1', options: ['CH1', 'CH2'] },
    },
    noLabel: true,
    draw: (p) => `
      <g class="scope-probe ${p.channel.toLowerCase()}">
        <path d="M 0 20 V 10" />
        <path class="probe-body" d="M -5 10 L 0 16 L 5 10 V -8 H -5 Z" />
        <text class="sym-text upright" y="-13" text-anchor="middle" data-y="-16">${p.channel}</text>
      </g>`,
  },
  // Moving-coil panel meter: a needle sweeping a 100° scale (DIN EN 60617
  // indicating instrument with a pointer); + is pin 0.
  panelMeter: {
    name: 'Panel meter',
    letter: 'P',
    category: 'meters',
    group: 'Analog',
    pins: [{ x: -40, y: 0 }, { x: 40, y: 0 }],
    props: {
      fullScale: { label: 'Full scale', unit: 'V', value: 10, min: 0.001 },
      resistance: { label: 'Resistance', unit: 'Ω', value: 100e3, min: 1 },
      mode: METER_MODE,
    },
    tag: (p) => `${formatSI(p.fullScale, 'V')} ${p.mode}`,
    hit: { w: 80, h: 50 },
    labelAt: (vertical) => (vertical ? [40, 4, 'start'] : [0, -40, 'middle']),
    draw: () => `
      <path d="M -40 0 H -28 M 28 0 H 40" />
      <rect x="-28" y="-32" width="56" height="42" rx="4" />
      <path class="meter-scale" d="M -21.4 -12 A 28 28 0 0 1 21.4 -12 M -21.4 -12 L -24.5 -14.6 M -11.8 -19.4 L -13.5 -22.3 M 0 -22 V -26 M 11.8 -19.4 L 13.5 -22.3 M 21.4 -12 L 24.5 -14.6" />
      <line class="needle" x1="0" y1="6" x2="0" y2="-22" transform="rotate(-50 0 6)" />
      <circle class="needle-hub" cy="6" r="2" />
      <text class="sym-text" x="-22" y="6">+</text>`,
  },
  // Reads the voltage from + to COM: almost no current drawn.
  voltmeter: {
    name: 'Voltmeter',
    letter: 'P',
    category: 'meters',
    group: 'Multimeter',
    pins: [{ x: -40, y: 0 }, { x: 40, y: 0 }],
    props: {
      resistance: { label: 'Input resistance', unit: 'Ω', value: 10e6, min: 1000 },
      maxVoltage: { label: 'Max voltage', unit: 'V', value: 1000, min: 1 },
      mode: METER_MODE,
    },
    display: true,
    selector: 'mode',
    draw: () => meterSymbol('V'),
  },
  // Reads the current flowing in at + and out at COM: almost no voltage
  // dropped. An internal fuse protects it.
  ammeter: {
    name: 'Ammeter',
    letter: 'P',
    category: 'meters',
    group: 'Multimeter',
    pins: [{ x: -40, y: 0 }, { x: 40, y: 0 }],
    props: {
      resistance: { label: 'Internal resistance', unit: 'Ω', value: 0.05, min: 0.0001 },
      maxCurrent: { label: 'Fuse rating', unit: 'A', value: 10, min: 0.001 },
      mode: METER_MODE,
    },
    display: true,
    selector: 'mode',
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
// A part's pins and grab box, which for some parts (a relay's contacts)
// depend on its values.
export const pinsOf = (type: PartType, props: Props): Point[] => {
  const pins = PARTS[type].pins;
  return typeof pins === 'function' ? pins(props) : pins;
};
// What each pin is, so a wire can follow its pin when a change of values
// adds, removes or reorders pins. Parts whose pins never change don't name
// them: their pins are simply numbered.
export const pinNamesOf = (type: PartType, props: Props): string[] =>
  PARTS[type].pinNames?.(props) ?? pinsOf(type, props).map((_, i) => String(i));
export const hitOf = (type: PartType, props: Props): HitBox | undefined => {
  const hit = PARTS[type].hit;
  return typeof hit === 'function' ? hit(props) : hit;
};

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
  const pins = pinsOf(type, props).map((p, i) => `<circle class="pin" data-pin="${i}" cx="${p.x}" cy="${p.y}" r="3" />`);
  return part.draw(props, broken) + pins.join('');
}
