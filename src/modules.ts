import { snap } from './board.ts';
import { FRAME_MIN, frameSize } from './parts/annotate/frame.ts';
import { PARTS } from './components.ts';
import { PANEL_HALF, encodeLayout, encodePanel, encodePorts, type Layout, type PanelSpot, type Side } from './parts/modules/block.ts';
import { createCircuit, type Circuit } from './model.ts';
import type { LibModule } from './library.ts';
import { keyOf, pinKey } from './nets.ts';
import type { End, Joint, Part, PartType, Point, PropValue, Wire } from './types.ts';

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
  box?: Box; // its frame, where it's edited (made before it was kept: see boxOf)
  face?: Face; // its block as laid out by hand (none: laid out automatically)
  panel?: string[]; // the parts inside mounted on its block's face, by id
  source?: Source; // the library module it was saved as or placed from
}

// Where a module in a circuit came from in the library: the library module's
// id and this module's id within it ("lib-…#m2"), and the version it was.
export interface Source {
  id: string;
  version: number;
}

// A block face laid out by hand (Edit module's Face view): the box and title,
// and where each pin sits, by its Terminal's id. Pins it doesn't place (added
// since) take free spots on their frame side.
export interface Face extends Layout {
  pins: Record<string, { side: Side; at: number }>;
  panel?: Record<string, Point & { s?: number }>; // where its front-panel parts sit (others: in a row), and a display's size
}

// Parts that can be mounted on a block's face, like the controls, pilot
// lights and displays on a panel door: those you operate (switches, buttons),
// those that light up as a single lamp, and those with a look of their own
// there (onPanel: displays, RGB and bi-colour LEDs).
const PANEL_LAMPS: PartType[] = ['led', 'lamp', 'pilot', 'probe'];
export const canMount = (type: PartType) => !!PARTS[type].actuator || PANEL_LAMPS.includes(type) || !!PARTS[type].onPanel;

// The sizes a display can be mounted at, as shares of its full size.
export const PANEL_SCALES = [0.5, 0.75, 1];

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

// --- Its pins --------------------------------------------------------------------

type Port = { c: Part; side: Side };

// The Terminals on the box's edge, in pin order: the left and right edges top
// to bottom, then the top and bottom left to right.
function portsOn(box: Box, parts: readonly Part[]): Port[] {
  const sideOf = (p: Point): Side | null =>
    p.x === box.x ? 'L' : p.x === box.x + box.w ? 'R' : p.y === box.y ? 'T' : p.y === box.y + box.h ? 'B' : null;
  const order: Side[] = ['L', 'R', 'T', 'B'];
  return parts
    .filter((c) => c.type === 'terminal' && sideOf(c))
    .map((c) => ({ c, side: sideOf(c)! }))
    .sort((a, b) => order.indexOf(a.side) - order.indexOf(b.side) || (a.side === 'L' || a.side === 'R' ? a.c.y - b.c.y : a.c.x - b.c.x));
}

// The block's `ports` value: each pin's side and name (its Terminal's, or its
// number), and where the face puts it.
const portsValue = (ports: Port[], face?: Face) =>
  encodePorts(
    ports.map(({ c, side }, k) => {
      const name = (c.props as { name: string }).name.trim() || String(k + 1);
      const at = face?.pins[c.id];
      return at ? [at.side, name, at.at] : [side, name];
    }),
  );

const layoutValue = (face?: Face) => encodeLayout(face ? { hw: face.hw, hh: face.hh, title: face.title } : null);

// The block's `panel` value: its front-panel parts that are still there, each
// with what it takes up at its size, and where the face puts them.
const panelValue = (ids: readonly string[] | undefined, parts: readonly Part[], face?: Face) =>
  encodePanel(
    (ids ?? []).flatMap((id): PanelSpot[] => {
      const c = parts.find((p) => p.id === id);
      if (!c || !canMount(c.type)) return [];
      const at = face?.panel?.[id];
      const look = PARTS[c.type].onPanel?.(c.props);
      const s = look ? (at?.s ?? look.scale ?? 1) : undefined;
      const size = look ? { w: look.hw * s!, h: look.hh * s!, s } : PANEL_HALF;
      return [{ id, ...size, ...(at ? { x: at.x, y: at.y } : {}) }];
    }),
  );

// The block an edit (editCopy) would make now, as a block's values, with the
// Terminal behind each pin: for the Face view. null without its frame.
export function editedBlock(
  def: ModuleDef,
  edit: Circuit,
  frameId: string,
  face?: Face,
  panel = def.panel,
): { props: PropsOf<'module'>; ids: string[] } | null {
  const frame = edit.part(frameId) as Part<'frame'> | undefined;
  if (!frame) return null;
  const parts = edit.components.filter((c) => c.type !== 'frame');
  const ports = portsOn(frameBox(frame), parts);
  return {
    props: {
      module: def.id,
      title: frame.props.text.trim() || 'Module',
      ports: portsValue(ports, face),
      layout: layoutValue(face),
      panel: panelValue(panel, parts, face),
      settings: '',
    },
    ids: ports.map((p) => p.c.id),
  };
}

type PropsOf<T extends PartType> = Part<T>['props'];

const frameBox = (frame: Part<'frame'>): Box => ({ x: frame.x, y: frame.y, ...frameSize(frame.props) });

// A module's frame: as kept, or (made before it was) round its parts and joints.
export function boxOf(def: ModuleDef): Box {
  if (def.box) return def.box;
  const points: Point[] = [...def.parts, ...def.joints];
  const [x1, y1] = [Math.min(...points.map((p) => p.x)), Math.min(...points.map((p) => p.y))];
  const [x2, y2] = [Math.max(...points.map((p) => p.x)), Math.max(...points.map((p) => p.y))];
  return { x: x1, y: y1, w: Math.max(FRAME_MIN, x2 - x1), h: Math.max(FRAME_MIN, y2 - y1) };
}

// --- Making a module ---------------------------------------------------------

// Make the frame's contents into a module and put a block in their place, at
// the frame's centre. Terminals on the frame's edge are the module's pins
// (see portsOn); wires from outside to them now end on the block's pins.
// Other wires that cross the edge can't come along and are cut. Frames
// inside are dropped (annotation of a section that is now a block).
export function makeModule(circuit: Circuit, frame: Part<'frame'>): { block: Part; cut: number } | { error: string } {
  const box = frameBox(frame);
  const inside = (p: Point) => p.x >= box.x && p.x <= box.x + box.w && p.y >= box.y && p.y <= box.y + box.h;
  const frames = circuit.components.filter((c) => c !== frame && c.type === 'frame' && inside(c));
  const parts = circuit.components.filter((c) => c !== frame && c.type !== 'frame' && inside(c));
  if (!parts.some((c) => c.type !== 'terminal')) return { error: 'The frame has no parts to make a module of.' };
  const joints = circuit.joints.filter(inside);
  const ports = portsOn(box, parts);
  if (!ports.length) return { error: 'Put Terminals on the frame’s edge: they become the module’s pins.' };

  const ids = new Set([...parts, ...joints].map((n) => n.id));
  const isIn = (e: End) => ids.has(e.joint ?? e.part);
  const wires = circuit.wires.filter((wi) => isIn(wi.from) && isIn(wi.to));
  const crossing = circuit.wires.filter((wi) => isIn(wi.from) !== isIn(wi.to));

  const used = new Set(circuit.modules.map((m) => Number(m.id.slice(1)) || 0));
  let n = 1;
  while (used.has(n)) n++;
  const name = frame.props.text.trim() || 'Module';
  const def: ModuleDef = { id: `m${n}`, name, parts, joints, wires, ports: ports.map((p) => p.c.id), box };

  const block = circuit.add('module', snap(box.x + box.w / 2), snap(box.y + box.h / 2));
  Object.assign(block.props, { module: def.id, title: name, ports: portsValue(ports) });

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

// --- Editing a module ----------------------------------------------------------

// A module's definition laid out to edit, as a circuit of its own: its parts,
// joints and wires (copies, so cancelling leaves it as it was) and its frame,
// whose edge's Terminals are its pins. `frame` is that frame's id.
export function editCopy(def: ModuleDef, circuit: Circuit): { edit: Circuit; frame: string } {
  const edit = createCircuit();
  edit.load(structuredClone(def.parts), structuredClone(def.joints), structuredClone(def.wires), circuit.ambient, [...circuit.modules]);
  const box = boxOf(def);
  const frame = edit.add('frame', box.x, box.y);
  Object.assign(frame.props, { text: def.name, width: box.w, height: box.h });
  return { edit, frame: frame.id };
}

// Put an edited copy (editCopy) back as the module's definition, and bring
// every block of it up to date, on the board and inside other modules: its
// title, and its pins, which follow their Terminals; wires to a pin whose
// Terminal is gone are cut. Everything in the edit is the module's, except
// frames: its own frame marks the pins, others are dropped as when made.
// Modules made while editing join the circuit's. `face`: its block laid out
// anew, or null to lay it out automatically again; `panel`: its front-panel
// parts anew (each left out: as it was).
export function updateModule(
  circuit: Circuit,
  def: ModuleDef,
  edit: Circuit,
  frameId: string,
  face?: Face | null,
  panel?: string[],
): { cut: number } | { error: string } {
  const frame = edit.part(frameId) as Part<'frame'> | undefined;
  if (!frame) return { error: 'Keep the module’s frame: the Terminals on its edge are its pins.' };
  const box = frameBox(frame);
  const parts = edit.components.filter((c) => c.type !== 'frame');
  if (!parts.some((c) => c.type !== 'terminal')) return { error: 'A module needs parts besides its terminals.' };
  const ports = portsOn(box, parts);
  if (!ports.length) return { error: 'Put Terminals on the frame’s edge: they become the module’s pins.' };
  const modules = [...circuit.modules, ...edit.modules.filter((m) => !circuit.modules.some((o) => o.id === m.id))];
  if (modulesInUse(parts, modules).some((m) => m.id === def.id)) return { error: 'A module can’t contain a copy of itself.' };

  const before = def.ports;
  Object.assign(def, {
    name: frame.props.text.trim() || 'Module',
    parts,
    joints: [...edit.joints],
    wires: [...edit.wires],
    ports: ports.map((p) => p.c.id),
    box,
  });
  if (face === null) delete def.face;
  else if (face) def.face = face;
  if (panel) def.panel = panel;
  def.panel = def.panel?.filter((id) => parts.some((c) => c.id === id && canMount(c.type)));
  if (!def.panel?.length) delete def.panel;
  circuit.modules.splice(0, circuit.modules.length, ...modules);
  return { cut: refreshBlocks(circuit, def, before) };
}

// Bring every block of a changed module up to date, on the board and inside
// other modules: its title, face and front panel, and its pins, which follow
// their Terminals (`before`: the module's pins before the change); wires to a
// pin whose Terminal is gone are cut. Returns how many were.
function refreshBlocks(circuit: Circuit, def: ModuleDef, before: string[]): number {
  const { title, ports, layout, panel } = blockValues(def);
  let cut = 0;
  const update = (list: Part[], wires: Wire[], remove: (w: Wire) => void) => {
    for (const block of list) {
      if (block.type !== 'module' || (block.props as { module: string }).module !== def.id) continue;
      Object.assign(block.props, { title, ports, layout, panel });
      for (const w of [...wires]) {
        for (const at of ['from', 'to'] as const) {
          if (w[at].part !== block.id) continue;
          const k = def.ports.indexOf(before[w[at].pin!]);
          if (k >= 0) w[at] = { part: block.id, pin: k };
          else {
            remove(w);
            cut++;
            break;
          }
        }
      }
    }
  };
  update(circuit.components, circuit.wires, (w) => circuit.remove(w.id));
  for (const m of circuit.modules) update(m.parts, m.wires, (w) => (m.wires = m.wires.filter((x) => x !== w)));
  return cut;
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
  // How the block a part is in has its switches set (applied to its copy).
  const pending: Record<string, Record<string, PropValue>> = {};
  // A copy's reference is its block's and its own (EN 81346's product
  // aspect: K6 in block A1 is -A1-K6, and so on down).
  const walk = (parts: readonly Part[], joints: readonly Joint[], wires: readonly Wire[], space: string, home: Part | null, depth: number, block?: Part) => {
    for (const c of parts) {
      let part = c;
      if (space) {
        const id = space + c.id;
        const had = copies.get(id);
        part = had?.from === c ? had.part : { ...structuredClone(c), id };
        if (pending[id]) Object.assign(part.props, pending[id]);
        if (block) Object.assign(part, { ref: `${block.ref}-${c.ref}`, usRef: `${block.usRef}-${c.usRef}` });
        kept.set(id, { from: c, part });
      }
      out.parts.push({ part, space, home: home ?? part });
      const def = part.type === 'module' ? defs.get((part.props as { module: string }).module) : undefined;
      if (!def || depth >= MAX_DEPTH) continue;
      const inner = `${part.id}/`;
      settingsOf(part).forEach((values, id) => (pending[inner + id] = values));
      def.ports.forEach((t, k) => out.ports.push([pinKey(part.id, k), pinKey(inner + t, 0)]));
      walk(def.parts, def.joints, def.wires, inner, home ?? part, depth + 1, part);
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

// --- A copy's own settings ---------------------------------------------------------

// How a block has the switches inside it set: part id → values.
function settingsOf(block: Part): Map<string, Record<string, PropValue>> {
  try {
    const v: unknown = JSON.parse((block.props as { settings: string }).settings || '{}');
    return new Map(Object.entries(v && typeof v === 'object' ? (v as Record<string, Record<string, PropValue>>) : {}));
  } catch {
    return new Map();
  }
}

// Remember that a part inside a block (`id` as flatten gives it, "c12/c3")
// was set this way, in the block's own `settings`, so the copy keeps it: on
// the next rebuild, and in the file when the block is on the board.
export function rememberSetting(circuit: Circuit, id: string, key: string, value: PropValue) {
  const cut = id.lastIndexOf('/');
  if (cut < 0) return;
  const block = flatten(circuit).parts.find((f) => f.part.id === id.slice(0, cut))?.part;
  if (block?.type !== 'module') return;
  const settings = Object.fromEntries(settingsOf(block));
  const local = id.slice(cut + 1);
  settings[local] = { ...settings[local], [key]: value };
  (block.props as { settings: string }).settings = JSON.stringify(settings);
}

// A part as the simulator sees it, by its flattened id (a block's copy of a
// part inside it, or a part on the board).
export function flatPart(circuit: Circuit, id: string): Part | undefined {
  return flatten(circuit).parts.find((f) => f.part.id === id)?.part;
}

// --- The library ---------------------------------------------------------------------

// A block's values for a module as it stands: its pins on their frame sides (or
// as its face puts them), its layout and its front panel.
export function blockValues(def: ModuleDef): PropsOf<'module'> {
  const sides = new Map(portsOn(boxOf(def), def.parts).map((p) => [p.c.id, p.side]));
  const ports = def.ports.flatMap((id) => {
    const c = def.parts.find((p) => p.id === id);
    return c ? [{ c, side: sides.get(id) ?? 'L' }] : [];
  });
  return {
    module: def.id,
    title: def.name,
    ports: portsValue(ports, def.face),
    layout: layoutValue(def.face),
    panel: panelValue(def.panel, def.parts, def.face),
    settings: '',
  };
}

// A module of the circuit as a library module: it and the modules inside it,
// copied, as `id`'s next version (or a new one). The circuit's modules then
// know they came from it, so placing it again reuses them.
export function toLibrary(circuit: Circuit, def: ModuleDef, id: string, version: number): LibModule {
  const all = [def, ...modulesInUse(def.parts, circuit.modules).filter((m) => m !== def)];
  const modules = all.map((m) => {
    const copy = structuredClone(m);
    delete copy.source;
    return copy;
  });
  for (const m of all) m.source = { id: `${id}#${m.id}`, version };
  return { id, name: def.name, main: def.id, modules, version, saved: new Date().toISOString() };
}

// Bring a library module into the circuit, to place a block of it: its
// modules join the circuit's under ids of their own (reusing ones already
// placed from the same version). Returns the circuit's id for the module itself.
export const fromLibrary = (circuit: Circuit, lib: LibModule): string => bring(circuit, lib).get(lib.main)!;

// Copy a library module's modules into the circuit (all but `except`), each
// under an id of its own unless the same version is there already. Returns
// each one's id in the circuit, by its id in the library module.
function bring(circuit: Circuit, lib: LibModule, except?: string): Map<string, string> {
  const ids = new Map<string, string>();
  const used = new Set(circuit.modules.map((m) => m.id));
  for (const m of lib.modules) {
    const source = `${lib.id}#${m.id}`;
    const have = circuit.modules.find((o) => o.source?.id === source && o.source.version === lib.version);
    if (have) ids.set(m.id, have.id);
    else {
      let n = 1;
      while (used.has(`m${n}`)) n++;
      used.add(`m${n}`);
      ids.set(m.id, `m${n}`);
    }
  }
  for (const m of lib.modules) {
    const id = ids.get(m.id)!;
    if (m.id === except || circuit.modules.some((o) => o.id === id)) continue;
    const copy = structuredClone(m);
    copy.id = id;
    copy.source = { id: `${lib.id}#${m.id}`, version: lib.version };
    for (const c of copy.parts) {
      if (c.type === 'module') (c.props as { module: string }).module = ids.get((c.props as { module: string }).module) ?? '';
    }
    circuit.modules.push(copy);
  }
  return ids;
}

// The library module (among `libs`) that has a newer version of this one,
// if any: the one it was saved as or placed from, saved again since.
export function newerIn(def: ModuleDef, libs: readonly LibModule[]): LibModule | undefined {
  if (!def.source) return undefined;
  const [libId, mainId] = def.source.id.split('#');
  return libs.find((l) => l.id === libId && l.main === mainId && l.version > def.source!.version);
}

// Bring a module of the circuit up to that newer version: it becomes the
// library's (every copy follows, as after an edit: pins follow their
// Terminals, wires to pins that are gone are cut), and the modules inside it
// join the circuit as when placed. Returns how many wires were cut.
export function adoptVersion(circuit: Circuit, def: ModuleDef, lib: LibModule): number {
  const ids = bring(circuit, lib, lib.main);
  const latest = structuredClone(lib.modules.find((m) => m.id === lib.main)!);
  for (const c of latest.parts) {
    if (c.type === 'module') (c.props as { module: string }).module = ids.get((c.props as { module: string }).module) ?? '';
  }
  const before = def.ports;
  delete def.face;
  delete def.panel;
  Object.assign(def, {
    name: latest.name,
    parts: latest.parts,
    joints: latest.joints,
    wires: latest.wires,
    ports: latest.ports,
    ...(latest.box ? { box: latest.box } : {}),
    ...(latest.face ? { face: latest.face } : {}),
    ...(latest.panel ? { panel: latest.panel } : {}),
    source: { id: `${lib.id}#${lib.main}`, version: lib.version },
  });
  return refreshBlocks(circuit, def, before);
}
