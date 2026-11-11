import { DEFS } from './parts/index.ts';
import type { AnyPartDef, HitBox, Preset } from './parts/defs.ts';
import type { Point, Props, PropsByType, PartType, PropValue } from './types.ts';

// The parts as the rest of the app sees them: every part type's symbol and
// settings, gathered from src/parts (one file per part or family), plus the
// helpers that work on any part.
export {
  CATEGORIES,
  LIGHT_COLORS,
  isChoiceSpec,
  isSwitchSpec,
  isTextSpec,
  type AnyPartDef,
  type CategoryId,
  GENERIC,
  type ChoiceSpec,
  type HitBox,
  type LabelSpot,
  type LightColor,
  type NumberSpec,
  type PropSpec,
  type SliderRange,
  type SwitchSpec,
  type TextSpec,
} from './parts/defs.ts';

export const PARTS = DEFS as unknown as Record<PartType, AnyPartDef>;

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

// The values a new part of this type starts with.
// (A part with part numbers starts as its default one, with its values.)
export function defaults<T extends PartType>(type: T): PropsByType[T] {
  const entries = Object.entries(PARTS[type].props).map(([key, spec]): [string, PropValue] => [key, spec.value]);
  const props = Object.fromEntries(entries) as PropsByType[T];
  Object.assign(props, presetOf(type, props)?.values);
  return props;
}

// --- Part numbers ----------------------------------------------------------------
// Parts with presets carry a `partNumber`; picking one sets the part's values
// to that device's. Values changed by hand afterwards mark it modified: it
// keeps its part number, shown with a * on the board.

const partNumberOf = (props: Props) => (props as { partNumber?: string }).partNumber;

export function presetOf(type: PartType, props: Props): Preset<Props> | undefined {
  const code = partNumberOf(props);
  return PARTS[type].presets?.find((p) => p.code === code);
}

export function applyPreset(type: PartType, props: Props, code: string) {
  (props as { partNumber?: string }).partNumber = code;
  Object.assign(props, presetOf(type, props)?.values);
}

export function isModified(type: PartType, props: Props): boolean {
  const preset = presetOf(type, props);
  if (!preset) return false;
  return Object.entries(preset.values).some(([key, v]) => (props as Record<string, unknown>)[key] !== v);
}

// The values a reset brings a part back to: its part number's datasheet
// values, or else its defaults. Hidden state (a battery's charge) is left
// alone, and so is the part number itself.
export function resetValues(type: PartType, props: Props): Partial<Props> {
  const preset = presetOf(type, props);
  if (preset) return preset.values;
  const fresh = defaults(type) as Record<string, PropValue>;
  return Object.fromEntries(
    Object.entries(PARTS[type].props)
      .filter(([key, spec]) => !spec.hidden && key !== 'partNumber')
      .map(([key]) => [key, fresh[key]]),
  ) as Partial<Props>;
}

// Whether any value differs from what a reset would bring back.
export const canReset = (type: PartType, props: Props) =>
  Object.entries(resetValues(type, props)).some(([key, v]) => (props as Record<string, unknown>)[key] !== v);

// What follows the reference on the board: the part number (with * when
// modified), or the part's own tag (its value) when it has none.
export function tagOf(type: PartType, props: Props): string | undefined {
  const preset = presetOf(type, props);
  if (preset) return `${preset.code}${isModified(type, props) ? '*' : ''}`;
  return PARTS[type].tag?.(props);
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
