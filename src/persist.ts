import { GENERIC, PARTS, defaults, isChoiceSpec, isSwitchSpec, pinsOf } from './components.ts';
import type { Circuit } from './model.ts';
import type { End, Joint, Part, PartType, Point, PropValue, Wire } from './types.ts';

// A circuit as stored in a file (and in the browser's autosave): what was
// built, not the live simulation, so capacitors load empty and parts cool.
// Bump VERSION when the shape changes, and keep reading older versions.

export const FORMAT = 'electronics-circuit';
export const VERSION = 1;

export interface View extends Point {
  scale: number;
}

export interface SavedCircuit {
  format: typeof FORMAT;
  version: number;
  parts: Part[];
  joints: Joint[];
  wires: Wire[];
  view?: View;
}

export function serialize(circuit: Circuit, view?: View): SavedCircuit {
  return structuredClone({
    format: FORMAT,
    version: VERSION,
    parts: circuit.components,
    joints: circuit.joints,
    wires: circuit.wires,
    view,
  });
}

// Read and check a saved circuit. Throws an Error saying what's wrong, so a
// bad file never half-loads. Values a part doesn't have are dropped, and ones
// it gained since the file was written take their defaults.
export function parse(text: string): SavedCircuit {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('This file isn’t valid JSON.');
  }
  const d = obj(data, 'file');
  if (d.format !== FORMAT) throw new Error('This isn’t a circuit file from this app.');
  if (typeof d.version !== 'number' || d.version > VERSION) {
    throw new Error('This circuit was saved by a newer version of the app.');
  }

  const parts = list(d.parts, 'parts').map((p, i) => readPart(obj(p, `part ${i + 1}`)));
  const joints = list(d.joints, 'joints').map((j, i) => {
    const o = obj(j, `joint ${i + 1}`);
    return { id: str(o.id, 'joint id'), x: num(o.x, 'joint x'), y: num(o.y, 'joint y') };
  });
  const byId = new Map<string, Part | Joint>([...parts, ...joints].map((n) => [n.id, n]));
  if (byId.size !== parts.length + joints.length) throw new Error('Two items in the file share an id.');

  const end = (e: unknown, what: string): End => {
    const o = obj(e, what);
    if (typeof o.joint === 'string') {
      if (!joints.some((j) => j.id === o.joint)) throw new Error(`A wire ends at a missing joint (${o.joint}).`);
      return { joint: o.joint };
    }
    const part = parts.find((p) => p.id === o.part);
    const pin = num(o.pin, `${what} pin`);
    if (!part || !pinsOf(part.type, part.props)[pin]) throw new Error(`A wire ends at a missing pin (${String(o.part)}:${pin}).`);
    return { part: part.id, pin };
  };
  const wires = list(d.wires, 'wires').map((w, i) => {
    const o = obj(w, `wire ${i + 1}`);
    return {
      id: str(o.id, 'wire id'),
      from: end(o.from, `wire ${i + 1} start`),
      to: end(o.to, `wire ${i + 1} end`),
      via: list(o.via, 'wire bends').map((p) => point(p, 'wire bend')),
    };
  });

  let view: View | undefined;
  if (d.view !== undefined) {
    const v = obj(d.view, 'view');
    view = { x: num(v.x, 'view x'), y: num(v.y, 'view y'), scale: num(v.scale, 'view scale') };
  }
  return { format: FORMAT, version: VERSION, parts, joints, wires, view };
}

function readPart(o: Record<string, unknown>): Part {
  const type = str(o.type, 'part type');
  if (!(type in PARTS)) throw new Error(`Unknown part type “${type}”.`);
  const props = defaults(type as PartType) as Record<string, PropValue>;
  const saved = o.props === undefined ? {} : obj(o.props, 'part values');
  for (const [key, spec] of Object.entries(PARTS[type as PartType].props)) {
    const v = saved[key];
    if (isSwitchSpec(spec) ? typeof v === 'boolean' : isChoiceSpec(spec) ? spec.options.includes(v as string) : Number.isFinite(v)) {
      props[key] = v as PropValue;
    }
  }
  // Saved before it had part numbers: its values may be any part's.
  if (PARTS[type as PartType].presets && saved.partNumber === undefined) props.partNumber = GENERIC;
  const rotation = num(o.rotation ?? 0, 'part rotation');
  if (rotation % 90 !== 0) throw new Error('A part is rotated by something other than a quarter turn.');
  return {
    id: str(o.id, 'part id'),
    ref: str(o.ref, 'part reference'),
    type: type as PartType,
    x: num(o.x, 'part x'),
    y: num(o.y, 'part y'),
    rotation: ((rotation % 360) + 360) % 360,
    props: props as Part['props'],
    broken: o.broken === true,
  };
}

const obj = (v: unknown, what: string): Record<string, unknown> => {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new Error(`The ${what} is malformed.`);
  return v as Record<string, unknown>;
};
const list = (v: unknown, what: string): unknown[] => {
  if (v === undefined) return [];
  if (!Array.isArray(v)) throw new Error(`The ${what} list is malformed.`);
  return v;
};
const str = (v: unknown, what: string): string => {
  if (typeof v !== 'string' || !v) throw new Error(`A ${what} is missing.`);
  return v;
};
const num = (v: unknown, what: string): number => {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`A ${what} isn’t a number.`);
  return v;
};
const point = (v: unknown, what: string): Point => {
  const o = obj(v, what);
  return { x: num(o.x, `${what} x`), y: num(o.y, `${what} y`) };
};
