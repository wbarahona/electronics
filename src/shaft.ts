import { MODELS } from './sim/models.ts';
import type { Part, PartType, Point } from './types.ts';
import { turn } from './wires.ts';

// A mechanical load docks onto a motor's shaft the way pins connect: by
// position. The motor's shaft ends at SHAFT_END (local, above the symbol); a
// load's coupling is at COUPLING (local, below its symbol). When the two meet,
// turned the same way, the motor drives the load. Nothing is saved beyond the
// parts' positions, so copy, paste and rotate keep a docked pair together.
export const SHAFT_END: Point = { x: 0, y: -40 };
export const COUPLING: Point = { x: 0, y: 40 };
export const DOCK_REACH = 30; // px: how near a dragged load snaps onto a shaft

export const hasShaft = (type: PartType) => type === 'motor';
export const isShaftLoad = (type: PartType) => !!MODELS[type].shaftLoad;

const at = (c: { x: number; y: number; rotation: number }, local: Point): Point => {
  const o = turn(local.x, local.y, c.rotation);
  return { x: c.x + o.x, y: c.y + o.y };
};

export const shaftEnd = (motor: Part): Point => at(motor, SHAFT_END);
export const couplingOf = (load: { x: number; y: number; rotation: number }): Point => at(load, COUPLING);

// Where a load placed with its centre near `p` would dock: on the nearest
// free motor shaft, turned as that motor is, if its docked spot is within
// DOCK_REACH; else null. `self` is the load being placed (its own docking
// doesn't count as taking a shaft).
export function dockSpot(parts: readonly Part[], p: Point, self?: string): (Point & { rotation: number }) | null {
  const taken = new Set(dockings(parts.filter((c) => c.id !== self)).keys());
  let best: (Point & { rotation: number }) | null = null;
  let bestD = DOCK_REACH;
  for (const m of parts) {
    if (!hasShaft(m.type) || taken.has(m.id)) continue;
    const end = shaftEnd(m);
    const o = turn(COUPLING.x, COUPLING.y, m.rotation);
    const spot = { x: end.x - o.x, y: end.y - o.y, rotation: m.rotation };
    const d = Math.hypot(spot.x - p.x, spot.y - p.y);
    if (d < bestD) {
      bestD = d;
      best = spot;
    }
  }
  return best;
}

// Which load each motor drives: motor id → load id, for every load whose
// coupling sits on a motor's shaft end, turned the same way.
export function dockings(parts: readonly Part[]): Map<string, string> {
  const ends = new Map<string, Part>();
  for (const m of parts) {
    if (!hasShaft(m.type)) continue;
    const e = shaftEnd(m);
    ends.set(`${e.x},${e.y},${m.rotation}`, m);
  }
  const out = new Map<string, string>();
  for (const l of parts) {
    if (!isShaftLoad(l.type)) continue;
    const c = couplingOf(l);
    const m = ends.get(`${c.x},${c.y},${l.rotation}`);
    if (m && !out.has(m.id)) out.set(m.id, l.id);
  }
  return out;
}
