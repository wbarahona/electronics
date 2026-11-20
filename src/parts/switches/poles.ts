import type { LabelSpot, NumberSpec } from '../defs.ts';
import type { Point } from '../../types.ts';

// Ganged switches: further poles of a switch stand below the first, `pitch`
// apart, worked by the same handle and joined to it by a dashed line of
// action (DIN EN 60617-7). Adding or removing a pole leaves the others (and
// their wires) where they are: each pole's pins follow the ones before.

// The Poles setting.
export const POLES: NumberSpec = { label: 'Poles', unit: '', value: 1, min: 1, max: 4, slider: true };

// How many poles a switch has: its setting, as a whole number from 1 to 4.
export const poleCount = (p: { poles: number }) => Math.min(4, Math.max(1, Math.round(p.poles)));

// The y of each pole.
export const poleYs = (p: { poles: number }, pitch: number) => Array.from({ length: poleCount(p) }, (_, k) => k * pitch);

// The pins of every pole: `pins` laid out for each pole in turn.
export const polePins = (p: { poles: number }, pitch: number, pins: Point[]): Point[] =>
  poleYs(p, pitch).flatMap((y) => pins.map((pin) => ({ x: pin.x, y: pin.y + y })));

// Pin indexes of each pole, `size` pins each.
export const poleGroups = (p: { poles: number }, size: number) =>
  poleYs(p, 0).map((_, k) => Array.from({ length: size }, (_, j) => k * size + j));

// The grab box over all poles, `top` and `bottom` the first pole's reach.
export const poleHit = (p: { poles: number }, pitch: number, top = -20, bottom = 20) => {
  const span = (poleCount(p) - 1) * pitch + bottom - top;
  return { w: 80, h: span, y: top + span / 2 };
};

// A ganged switch's handle stays above the first pole, on the side away from
// the others, however the part is turned; the label goes past the last pole.
// (With one pole, both are where they'd be on any switch.)
export function poleActuatorAt(_vertical: boolean, p: { poles: number }, rotation: number): Point | undefined {
  if (poleCount(p) === 1) return undefined;
  return turned({ x: 0, y: -34 }, rotation);
}

export function poleLabelAt(pitch: number) {
  return (vertical: boolean, p: { poles: number }, rotation: number): LabelSpot => {
    if (poleCount(p) === 1) return vertical ? [-26, 4, 'end'] : [0, 32, 'middle'];
    return labelBelow((poleCount(p) - 1) * pitch + 28, rotation);
  };
}

// The label `depth` below the part's centre (local +y), as it shows on screen
// with the part turned.
export function labelBelow(depth: number, rotation: number): LabelSpot {
  const { x, y } = turned({ x: 0, y: depth }, rotation);
  if (x < 0) return [x, 4, 'end'];
  if (x > 0) return [x, 4, 'start'];
  return [0, y < 0 ? y + 8 : y + 4, 'middle'];
}

// A point of the part as it shows on screen with the part turned.
export function turned({ x, y }: Point, rotation: number): Point {
  switch (((rotation % 360) + 360) % 360) {
    case 90:
      return { x: -y, y: x };
    case 180:
      return { x: -x, y: -y };
    case 270:
      return { x: y, y: -x };
    default:
      return { x, y };
  }
}
