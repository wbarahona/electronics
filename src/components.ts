import { DEFS } from './parts/index.ts';
import type { AnyPartDef, HitBox } from './parts/defs.ts';
import type { Point, Props, PropsByType, PartType, PropValue } from './types.ts';

// The parts as the rest of the app sees them: every part type's symbol and
// settings, gathered from src/parts (one file per part or family), plus the
// helpers that work on any part.
export {
  CATEGORIES,
  LIGHT_COLORS,
  isChoiceSpec,
  isSwitchSpec,
  type AnyPartDef,
  type CategoryId,
  type ChoiceSpec,
  type HitBox,
  type LabelSpot,
  type LightColor,
  type NumberSpec,
  type PropSpec,
  type SwitchSpec,
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
