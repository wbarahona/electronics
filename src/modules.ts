import { snap } from './board.ts';
import { frameSize } from './parts/annotate/frame.ts';
import { encodePorts, type Side } from './parts/modules/block.ts';
import { createCircuit, type Circuit } from './model.ts';
import { keyOf, pinKey } from './nets.ts';
import type { End, Joint, Part, Point, Wire } from './types.ts';

// Modules: a section of a circuit made into one reusable block. Its
// definition (the parts, joints and wires inside, and which of its Terminals
// are its pins) is kept with the circuit; each block placed is a copy of it,
// all copies one definition. The simulator sees no blocks: flatten() expands
// each into its own copy of the parts inside, ids prefixed with the block's
// ("c12/c3"), so the solver, heat and readouts work on plain parts.

export interface ModuleDef {
  id: string; // "m1", unique in the circuit; blocks name it in their `module`
  name: string;
  parts: Part[];
  joints: Joint[];
  wires: Wire[];
  ports: string[]; // the Terminals that are its pins, by part id, in pin order
}

// --- Making a module ---------------------------------------------------------

// Make the frame's contents into a module and put a block in their place, at
// the frame's centre. Terminals on the frame's edge are the module's pins
// (left and right edges top to bottom, then top and bottom left to right);
// wires from outside to them now end on the block's pins. Other wires that
// cross the edge can't come along and are cut. Frames inside are dropped
// (annotation of a section that is now a block).
export function makeModule(circuit: Circuit, frame: Part<'frame'>): { block: Part; cut: number } | { error: string } {
  const { w, h } = frameSize(frame.props);
  const [x1, y1, x2, y2] = [frame.x, frame.y, frame.x + w, frame.y + h];
  const inside = (p: Point) => p.x >= x1 && p.x <= x2 && p.y >= y1 && p.y <= y2;
  const frames = circuit.components.filter((c) => c !== frame && c.type === 'frame' && inside(c));
  const parts = circuit.components.filter((c) => c !== frame && c.type !== 'frame' && inside(c));
  if (!parts.some((c) => c.type !== 'terminal')) return { error: 'The frame has no parts to make a module of.' };
  const joints = circuit.joints.filter(inside);

  const sideOf = (p: Point): Side | null =>
    p.x === x1 ? 'L' : p.x === x2 ? 'R' : p.y === y1 ? 'T' : p.y === y2 ? 'B' : null;
  const order: Side[] = ['L', 'R', 'T', 'B'];
  const ports = parts
    .filter((c) => c.type === 'terminal' && sideOf(c))
    .map((c) => ({ c, side: sideOf(c)! }))
    .sort((a, b) => order.indexOf(a.side) - order.indexOf(b.side) || (a.side === 'L' || a.side === 'R' ? a.c.y - b.c.y : a.c.x - b.c.x));
  if (!ports.length) return { error: 'Put Terminals on the frame’s edge: they become the module’s pins.' };

  const ids = new Set([...parts, ...joints].map((n) => n.id));
  const isIn = (e: End) => ids.has(e.joint ?? e.part);
  const wires = circuit.wires.filter((wi) => isIn(wi.from) && isIn(wi.to));
  const crossing = circuit.wires.filter((wi) => isIn(wi.from) !== isIn(wi.to));

  const used = new Set(circuit.modules.map((m) => Number(m.id.slice(1)) || 0));
  let n = 1;
  while (used.has(n)) n++;
  const name = frame.props.text.trim() || 'Module';
  const def: ModuleDef = { id: `m${n}`, name, parts, joints, wires, ports: ports.map((p) => p.c.id) };

  const block = circuit.add('module', snap(frame.x + w / 2), snap(frame.y + h / 2));
  Object.assign(block.props, {
    module: def.id,
    title: name,
    ports: encodePorts(ports.map(({ c, side }, k) => [side, (c.props as { name: string }).name.trim() || String(k + 1)])),
  });

  // Wires from outside: to a pin of the block, or cut.
  let cut = 0;
  for (const wi of crossing) {
    const inner = isIn(wi.from) ? 'from' : 'to';
    const k = def.ports.indexOf(wi[inner].part ?? '');
    if (k < 0) {
      circuit.remove(wi.id);
      cut++;
    } else {
      wi[inner] = { part: block.id, pin: k };
      wi.via = [];
    }
  }
  for (const id of [...ids, ...wires.map((wi) => wi.id), ...frames.map((f) => f.id), frame.id]) circuit.remove(id);
  circuit.modules.push(def);
  return { block, cut };
}

// The definitions a circuit's blocks use, directly or through blocks inside
// other modules: what a saved file needs to carry.
export function modulesInUse(parts: readonly Part[], modules: readonly ModuleDef[]): ModuleDef[] {
  const byId = new Map(modules.map((m) => [m.id, m]));
  const used = new Map<string, ModuleDef>();
  const visit = (list: readonly Part[]) => {
    for (const c of list) {
      const def = c.type === 'module' ? byId.get((c.props as { module: string }).module) : undefined;
      if (def && !used.has(def.id)) {
        used.set(def.id, def);
        visit(def.parts);
      }
    }
  };
  visit(parts);
  return [...used.values()];
}

// --- Flattening ----------------------------------------------------------------

export interface FlatPart {
  part: Part; // a top-level part itself, or a block's own copy of one inside it
  space: string; // "" at the top level, else the prefix of its block's copies ("c12/")
  home: Part; // the top-level part it is, or sits inside
}

export interface Flat {
  parts: FlatPart[];
  joints: { key: string; space: string; at: Point }[];
  wires: [string, string][]; // the connection keys (see nets.ts) each wire joins
  ports: [string, string][]; // a block's pin and the Terminal inside it that is that pin
}

// Each block's copies of the parts inside it, kept while its definition does,
// so what a copy carries in its values (a battery's charge) lasts from one
// rebuild to the next.
let copies = new Map<string, { from: Part; part: Part }>();

const MAX_DEPTH = 8; // modules in modules; deeper means a module that contains itself

// The circuit as plain parts: the top level, and every block's copy of what's
// inside it (blocks in blocks too).
export function flatten(circuit: Circuit): Flat {
  const out: Flat = { parts: [], joints: [], wires: [], ports: [] };
  const defs = new Map(circuit.modules.map((m) => [m.id, m]));
  const kept = new Map<string, { from: Part; part: Part }>();
  const walk = (parts: readonly Part[], joints: readonly Joint[], wires: readonly Wire[], space: string, home: Part | null, depth: number) => {
    for (const c of parts) {
      let part = c;
      if (space) {
        const id = space + c.id;
        const had = copies.get(id);
        part = had?.from === c ? had.part : { ...structuredClone(c), id };
        kept.set(id, { from: c, part });
      }
      out.parts.push({ part, space, home: home ?? part });
      const def = part.type === 'module' ? defs.get((part.props as { module: string }).module) : undefined;
      if (!def || depth >= MAX_DEPTH) continue;
      const inner = `${part.id}/`;
      def.ports.forEach((t, k) => out.ports.push([pinKey(part.id, k), pinKey(inner + t, 0)]));
      walk(def.parts, def.joints, def.wires, inner, home ?? part, depth + 1);
    }
    for (const j of joints) out.joints.push({ key: space + j.id, space, at: j });
    for (const w of wires) out.wires.push([space + keyOf(w.from), space + keyOf(w.to)]);
  };
  walk(circuit.components, circuit.joints, circuit.wires, '', null, 0);
  copies = kept;
  return out;
}

// --- Inside a block ------------------------------------------------------------

// What's inside a placed block, to show it: `id` is the block's id as flatten
// gives it ("c12", or "c12/c5" for a block inside another). Its parts are the
// block's own live copies (so their readouts are the simulator's, and a button
// pressed there is pressed in the simulation), its joints and wires the
// definition's, renamed to match. null if that isn't a block, or its
// definition isn't in the circuit.
export function insideOf(circuit: Circuit, id: string): Circuit | null {
  const flat = flatten(circuit);
  const block = flat.parts.find((f) => f.part.id === id)?.part;
  if (block?.type !== 'module') return null;
  const def = circuit.modules.find((m) => m.id === (block.props as { module: string }).module);
  if (!def) return null;
  const space = `${id}/`;
  const end = (e: End): End => (e.joint !== undefined ? { joint: space + e.joint } : { part: space + e.part, pin: e.pin });
  const inside = createCircuit();
  inside.load(
    flat.parts.filter((f) => f.space === space).map((f) => f.part),
    def.joints.map((j) => ({ ...j, id: space + j.id })),
    def.wires.map((w) => ({ id: space + w.id, from: end(w.from), to: end(w.to), via: w.via.map((p) => ({ ...p })) })),
    circuit.ambient,
    circuit.modules,
  );
  return inside;
}

// The block a flattened id names ("c12", "c12/c5"), for its reference and title.
export function blockAt(circuit: Circuit, id: string): Part | undefined {
  return flatten(circuit).parts.find((f) => f.part.id === id && f.part.type === 'module')?.part;
}
