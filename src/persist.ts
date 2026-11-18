import { GENERIC, PARTS, defaults, isChoiceSpec, isSwitchSpec, isTextSpec, pinsOf, usLetterOf } from './components.ts';
import { AMBIENT, freeRef, type Circuit } from './model.ts';
import { modulesInUse, type Face, type ModuleDef } from './modules.ts';
import type { LibModule } from './library.ts';
import type { Side } from './parts/modules/block.ts';
import type { End, Fault, Joint, Part, PartType, Point, PropValue, Wire } from './types.ts';

// A circuit as stored in a file (and in the browser's autosave): what was
// built, not the live simulation, so capacitors load empty and parts cool.
// Bump VERSION when the shape changes, and keep reading older versions.
// Version 2 added module definitions; a file without modules is still
// written as version 1, so older copies of the app keep opening it.

export const FORMAT = 'electronics-circuit';
export const VERSION = 2;

export interface View extends Point {
  scale: number;
}

export interface SavedCircuit {
  format: typeof FORMAT;
  version: number;
  parts: Part[];
  joints: Joint[];
  wires: Wire[];
  modules?: ModuleDef[]; // the definitions its module blocks use (version 2)
  name?: string; // the circuit's name as typed (its file name has dashes for spaces)
  ambient?: number; // °C around the circuit; 25 when left out (files from before)
  view?: View;
}

export function serialize(circuit: Circuit, view?: View, name?: string): SavedCircuit {
  const modules = modulesInUse(circuit.components, circuit.modules);
  return structuredClone({
    format: FORMAT,
    version: modules.length ? 2 : 1,
    ...(name ? { name } : {}),
    parts: circuit.components,
    joints: circuit.joints,
    wires: circuit.wires,
    ...(modules.length ? { modules } : {}),
    ...(circuit.ambient !== AMBIENT ? { ambient: circuit.ambient } : {}),
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

  const { parts, joints, wires } = readNetwork(d);
  const modules = list(d.modules, 'modules').map((m, i) => readModule(obj(m, `module ${i + 1}`)));

  let view: View | undefined;
  if (d.view !== undefined) {
    const v = obj(d.view, 'view');
    view = { x: num(v.x, 'view x'), y: num(v.y, 'view y'), scale: num(v.scale, 'view scale') };
  }
  // An ambient temperature outside what parts are rated for is a damaged file:
  // the default.
  const ambient = typeof d.ambient === 'number' && d.ambient >= -40 && d.ambient <= 150 ? d.ambient : AMBIENT;
  const name = typeof d.name === 'string' && d.name.trim() ? d.name.trim().slice(0, 80) : undefined;
  return { format: FORMAT, version: VERSION, ...(name ? { name } : {}), parts, joints, wires, modules, ambient, view };
}

// The parts, joints and wires of `src` (a file, or a module inside one).
function readNetwork(src: Record<string, unknown>, what = ''): { parts: Part[]; joints: Joint[]; wires: Wire[] } {
  const parts = list(src.parts, `${what}parts`).map((p, i) => readPart(obj(p, `part ${i + 1}`)));
  // Saved before parts carried a US reference: each gets one now, with its EU
  // number where that is free (-R3, an inductor, becomes L3).
  const usRefs = new Set(parts.map((p) => p.usRef).filter(Boolean));
  for (const p of parts) {
    if (p.usRef) continue;
    const letter = usLetterOf(p.type);
    const same = `${letter}${p.ref.match(/\d+$/)?.[0] ?? ''}`;
    p.usRef = /\d$/.test(same) && !usRefs.has(same) ? same : freeRef(letter, usRefs);
    usRefs.add(p.usRef);
  }
  const joints = list(src.joints, `${what}joints`).map((j, i) => {
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
  const wires = list(src.wires, `${what}wires`).map((w, i) => {
    const o = obj(w, `wire ${i + 1}`);
    return {
      id: str(o.id, 'wire id'),
      from: end(o.from, `wire ${i + 1} start`),
      to: end(o.to, `wire ${i + 1} end`),
      via: list(o.via, 'wire bends').map((p) => point(p, 'wire bend')),
    };
  });
  return { parts, joints, wires };
}

// A module's definition: its own parts, joints and wires, and the Terminals
// among its parts that are its pins.
function readModule(o: Record<string, unknown>): ModuleDef {
  const { parts, joints, wires } = readNetwork(o, 'module ');
  const ports = list(o.ports, 'module pins').map((t) => {
    if (!parts.some((p) => p.id === t && p.type === 'terminal')) throw new Error('A module pin isn’t one of its terminals.');
    return t as string;
  });
  // Its frame, where it's edited (files from before it was kept have none).
  const b = o.box === undefined ? undefined : obj(o.box, 'module frame');
  const box = b && { x: num(b.x, 'module frame x'), y: num(b.y, 'module frame y'), w: num(b.w, 'module frame width'), h: num(b.h, 'module frame height') };
  const face = o.face === undefined ? undefined : readFace(obj(o.face, 'module face'));
  // The library module it came from, if any.
  const src = o.source === undefined ? undefined : obj(o.source, 'module source');
  const source = src && typeof src.id === 'string' && Number.isFinite(src.version) ? { id: src.id, version: src.version as number } : undefined;
  // Its front-panel parts: ids of its parts (others are dropped).
  const panel = list(o.panel, 'module front panel').filter((id): id is string => parts.some((p) => p.id === id));
  return {
    id: str(o.id, 'module id'),
    name: typeof o.name === 'string' ? o.name : 'Module',
    parts,
    joints,
    wires,
    ports,
    ...(box ? { box } : {}),
    ...(face ? { face } : {}),
    ...(panel.length ? { panel } : {}),
    ...(source ? { source } : {}),
  };
}

// A module's block as laid out by hand. Pins placed oddly are dropped (they
// take a free spot instead).
function readFace(o: Record<string, unknown>): Face {
  const pins: Face['pins'] = {};
  for (const [id, v] of Object.entries(obj(o.pins ?? {}, 'module face pins'))) {
    const pin = obj(v, 'module face pin');
    if (['L', 'R', 'T', 'B'].includes(pin.side as string) && Number.isFinite(pin.at)) pins[id] = { side: pin.side as Side, at: pin.at as number };
  }
  const title = o.title === 'centre' || o.title === 'hidden' ? o.title : 'top';
  const panel: NonNullable<Face['panel']> = {};
  for (const [id, v] of Object.entries(obj(o.panel ?? {}, 'module face panel'))) {
    const at = obj(v, 'module face panel spot');
    if (Number.isFinite(at.x) && Number.isFinite(at.y)) {
      panel[id] = { x: at.x as number, y: at.y as number, ...(Number.isFinite(at.s) ? { s: at.s as number } : {}) };
    }
  }
  return { hw: num(o.hw, 'module face width'), hh: num(o.hh, 'module face height'), title, pins, ...(Object.keys(panel).length ? { panel } : {}) };
}

function readPart(o: Record<string, unknown>): Part {
  const type = str(o.type, 'part type');
  if (!(type in PARTS)) throw new Error(`Unknown part type “${type}”.`);
  const props = defaults(type as PartType) as Record<string, PropValue>;
  const saved = o.props === undefined ? {} : obj(o.props, 'part values');
  for (const [key, spec] of Object.entries(PARTS[type as PartType].props)) {
    const v = saved[key];
    const ok = isSwitchSpec(spec)
      ? typeof v === 'boolean'
      : isChoiceSpec(spec)
        ? spec.options.includes(v as string)
        : isTextSpec(spec)
          ? typeof v === 'string'
          : Number.isFinite(v);
    if (ok) {
      props[key] = v as PropValue;
    }
  }
  // Saved before it had part numbers: its values may be any part's.
  if (PARTS[type as PartType].presets && saved.partNumber === undefined) props.partNumber = GENERIC;
  const f = o.fault === undefined ? undefined : obj(o.fault, 'part fault');
  const fault: Fault | undefined = f && (f.kind === 'open' || f.kind === 'short') ? { kind: f.kind, shown: f.shown !== false } : undefined;
  const rotation = num(o.rotation ?? 0, 'part rotation');
  if (rotation % 90 !== 0) throw new Error('A part is rotated by something other than a quarter turn.');
  return {
    id: str(o.id, 'part id'),
    ref: str(o.ref, 'part reference'),
    usRef: typeof o.usRef === 'string' ? o.usRef : '',
    type: type as PartType,
    x: num(o.x, 'part x'),
    y: num(o.y, 'part y'),
    rotation: ((rotation % 360) + 360) % 360,
    props: props as Part['props'],
    broken: o.broken === true,
    ...(fault ? { fault } : {}),
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

// --- Module files ----------------------------------------------------------------------
// Modules exported from my modules, to back them up or share them: one file
// with one module or all of them, each as kept in the library (it and the
// modules inside it).

export const MODULES_FORMAT = 'ampage-modules';
export const MODULES_EXTENSION = 'ampage-modules';

export const serializeModules = (modules: LibModule[]): string =>
  JSON.stringify({ format: MODULES_FORMAT, version: 1, modules }, null, 2);

// Read and check a module file, as parse() a circuit: throws saying what's
// wrong, so a bad file adds nothing.
export function parseModules(text: string): LibModule[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('This file isn’t valid JSON.');
  }
  const d = obj(data, 'file');
  if (d.format !== MODULES_FORMAT) throw new Error('This isn’t a modules file from this app.');
  if (typeof d.version !== 'number' || d.version > 1) throw new Error('These modules were saved by a newer version of the app.');
  return list(d.modules, 'modules').map((m, i) => {
    const o = obj(m, `module ${i + 1}`);
    const modules = list(o.modules, 'modules inside it').map((x, k) => readModule(obj(x, `module ${i + 1}.${k + 1}`)));
    const main = str(o.main, 'module');
    if (!modules.some((x) => x.id === main)) throw new Error('A module in the file is missing its own definition.');
    return {
      id: str(o.id, 'module id'),
      name: typeof o.name === 'string' && o.name.trim() ? o.name.trim().slice(0, 80) : 'Module',
      main,
      modules,
      version: typeof o.version === 'number' && o.version >= 1 ? Math.floor(o.version) : 1,
      saved: typeof o.saved === 'string' ? o.saved : new Date().toISOString(),
    };
  });
}
