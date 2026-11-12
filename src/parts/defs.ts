import type { PartType, Point, Props, PropsByType } from '../types.ts';

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

export type CategoryId = 'sources' | 'passive' | 'semiconductors' | 'digital' | 'chips' | 'signals' | 'loads' | 'switches' | 'meters' | 'notes';

// Groups shown as the clickable entries of the parts bar, in order. `icon` is
// a Material Symbols name (it must also be listed in index.html's icon_names),
// or inline SVG on a 24×24 grid where no symbol fits.

// A diode, for Semiconductors: Material Symbols has nothing that says
// "diode or transistor".
export const DIODE_ICON =
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
  { id: 'notes', label: 'Notes', icon: 'sticky_note_2' },
];

// How the panel edits one value.
export interface FieldSpec {
  label: string;
  hidden?: boolean;
}

export interface NumberSpec extends FieldSpec {
  value: number;
  // A value each new part draws for itself instead of `value` (a hidden one,
  // like a component's deviation within its tolerance).
  fresh?: () => number;
  unit: string;
  min?: number;
  max?: number;
  // Also edit with an M3 slider (beside a text field for exact values): true
  // for min to max in steps of 1, or a range of its own (where min or max are
  // open-ended, or a finer step). Up to 20 steps get tick marks.
  slider?: boolean | SliderRange;
}

export interface SliderRange {
  min: number;
  max: number;
  step?: number; // default 1
}

export interface ChoiceSpec<V extends string = string> extends FieldSpec {
  value: V;
  options: readonly V[];
}

export interface SwitchSpec extends FieldSpec {
  value: boolean;
}

// Free text, such as a net label's name.
export interface TextSpec extends FieldSpec {
  value: string;
  text: true;
  multiline?: boolean; // several lines (a note), not one (a name)
  maxLength?: number;
}

export type PropSpec = NumberSpec | ChoiceSpec | SwitchSpec | TextSpec;

export const isSwitchSpec = (s: PropSpec): s is SwitchSpec => typeof s.value === 'boolean';

export const isChoiceSpec = (s: PropSpec): s is ChoiceSpec => 'options' in s;

export const isTextSpec = (s: PropSpec): s is TextSpec => 'text' in s;

// The field kind that matches a value's type ([V] stops unions distributing).
// A plain string value is a choice (a part number) or free text; a string
// union is a choice among its members.
export type SpecFor<V> = [V] extends [boolean]
  ? SwitchSpec
  : [V] extends [number]
    ? NumberSpec
    : string extends V
      ? ChoiceSpec<string> | TextSpec
      : ChoiceSpec<V & string>;

export type BooleanKeys<P> = { [K in keyof P]: P[K] extends boolean ? K : never }[keyof P] & string;

export type ChoiceKeys<P> = { [K in keyof P]: P[K] extends string ? K : never }[keyof P] & string;

// One part type's definition, checked against its values P.
export interface PartDef<P> {
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
  presets?: Preset<P>[];
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
  presets?: Preset<Props>[];
  labelBelow?: boolean;
  labelAt?: (vertical: boolean, p: Props, rotation: number) => LabelSpot;
  draw: (p: Props, broken: boolean) => string;
}

// Definitions for the part types K, each checked against its values.
// A real part number (e.g. 1N4007): its datasheet values for the part's
// settings, and a one-line note about it. A part with presets has a
// `partNumber` setting (see partNumberSpec); GENERIC means none.
export interface Preset<P> {
  code: string;
  note: string;
  values: Partial<P>;
}

export const GENERIC = 'Generic';

// The Part number setting for a list of presets, starting on `initial`.
export const partNumberSpec = (presets: { code: string }[], initial: string): ChoiceSpec<string> => ({
  label: 'Part number',
  value: initial,
  options: [GENERIC, ...presets.map((p) => p.code)],
});

export type PartDefs<K extends PartType> = { [T in K]: PartDef<PropsByType[T]> };
