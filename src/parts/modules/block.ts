import type { ModelDefs } from '../../sim/models.ts';
import type { LabelSpot, PartDefs } from '../defs.ts';
import type { Point, PropsByType } from '../../types.ts';

// The values each of these parts carries: what the properties panel edits
// and the simulator reads (gathered into PropsByType in src/types.ts).
export interface PartProps {
  // A placed copy of a module (see src/modules.ts): `module` is its
  // definition's id, `title` its name, `ports` its pins (encodePorts). All
  // three are set when the module is made and come along when it's copied.
  module: { module: string; title: string; ports: string };
}

// Which side of the block a pin comes out of: left, right, top, bottom.
export type Side = 'L' | 'R' | 'T' | 'B';

const SIDES: readonly Side[] = ['L', 'R', 'T', 'B'];

// The pins as stored in `ports`: [side, name] in pin order, as JSON.
export const encodePorts = (ports: [Side, string][]): string => JSON.stringify(ports);

export function decodePorts(text: string): [Side, string][] {
  try {
    const v: unknown = JSON.parse(text);
    if (!Array.isArray(v)) return [];
    return v.filter((p): p is [Side, string] => Array.isArray(p) && SIDES.includes(p[0]) && typeof p[1] === 'string');
  } catch {
    return [];
  }
}

const CHAR_W = 6; // a 10px label character, roughly
const TITLE_W = 7; // a title character
const STEP = 20; // between pins, and a pin's lead

const escape = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

// Up to the next whole grid step.
const ceilStep = (v: number) => Math.ceil(v / STEP) * STEP;

// The block: a box only as big as its pins and names need, its title in a
// row along the top. Pins come out of each side on the grid, centred (an even
// number one step lower); each pin's lead is one grid step, so pins land on
// the grid wherever the block is put. Left and right pins are named inside the
// box; top and bottom ones beside their lead.
export function blockLayout(p: PropsByType['module']) {
  const ports = decodePorts(p.ports);
  const on = (side: Side) => ports.map(([s, name], k) => ({ s, name, k })).filter((q) => q.s === side);
  const offsets = (n: number) => Array.from({ length: n }, (_, k) => (k - Math.floor((n - 1) / 2)) * STEP);
  const [left, right, top, bottom] = SIDES.map(on);
  const widest = (list: { name: string }[]) => Math.max(0, ...list.map((q) => q.name.length * CHAR_W));
  const across = [...offsets(top.length), ...offsets(bottom.length)].map(Math.abs);
  const down = [...offsets(left.length), ...offsets(right.length)].map(Math.abs);
  const hw = Math.max(2 * STEP, ceilStep((p.title.length * TITLE_W + 16) / 2), ceilStep((widest(left) + widest(right) + 24) / 2), Math.max(0, ...across) + STEP);
  const hh = Math.max(2 * STEP, Math.max(0, ...down) + 2 * STEP);
  const pins: Point[] = [];
  const place = (list: { k: number }[], at: (o: number) => Point) => offsets(list.length).forEach((o, j) => (pins[list[j].k] = at(o)));
  place(left, (o) => ({ x: -hw - STEP, y: o }));
  place(right, (o) => ({ x: hw + STEP, y: o }));
  place(top, (o) => ({ x: o, y: -hh - STEP }));
  place(bottom, (o) => ({ x: o, y: hh + STEP }));
  return { ports, pins, hw, hh, sides: { left, right, top, bottom } };
}

// Text kept upright about its own middle (so turning the block moves it, but
// it always reads left to right).
const upright = (text: string, x: number, y: number, cls: string, w = CHAR_W) => {
  const mx = x + (text.length * w) / 2;
  return `<text class="${cls} upright" x="${mx}" y="${y}" text-anchor="middle" dominant-baseline="central" data-x="${mx}" data-y="${y}">${escape(text)}</text>`;
};

// Its reference above the box, at its left end, wherever it's turned (and
// clear of top pins).
function blockLabel(vertical: boolean, p: PropsByType['module']): LabelSpot {
  const { hw, hh, sides } = blockLayout(p);
  const [w, h] = vertical ? [hh, hw] : [hw, hh];
  const above = vertical ? sides.left.length + sides.right.length > 0 : sides.top.length + sides.bottom.length > 0;
  return [-w, -h - 8 - (above ? STEP : 0), 'start'];
}

export const defs: PartDefs<'module'> = {
  // EN 81346-2 class A (an assembly), as under ASME Y14.44.
  module: {
    name: 'Module',
    letter: 'A',
    category: 'modules',
    pins: (p) => blockLayout(p).pins,
    pinNames: (p) => decodePorts(p.ports).map(([, name]) => name),
    props: {
      module: { label: 'Module', value: '', text: true, hidden: true, kept: true },
      title: { label: 'Title', value: 'Module', text: true, hidden: true, kept: true },
      ports: { label: 'Pins', value: '[]', text: true, hidden: true, kept: true },
    },
    hit: (p) => {
      const { hw, hh } = blockLayout(p);
      return { w: 2 * hw, h: 2 * hh };
    },
    labelAt: (vertical, p) => blockLabel(vertical, p),
    draw: (p) => {
      const { hw, hh, pins, sides } = blockLayout(p);
      const leads = pins.map((pin) =>
        Math.abs(pin.x) > hw ? `M ${pin.x} ${pin.y} H ${Math.sign(pin.x) * hw}` : `M ${pin.x} ${pin.y} V ${Math.sign(pin.y) * hh}`,
      );
      const names = [
        ...sides.left.map((q) => upright(q.name, -hw + 5, pins[q.k].y, 'sym-text')),
        ...sides.right.map((q) => upright(q.name, hw - 5 - q.name.length * CHAR_W, pins[q.k].y, 'sym-text')),
        ...sides.top.map((q) => upright(q.name, pins[q.k].x + 4, -hh - 10, 'sym-text')),
        ...sides.bottom.map((q) => upright(q.name, pins[q.k].x + 4, hh + 10, 'sym-text')),
      ];
      return `
        <rect x="${-hw}" y="${-hh}" width="${2 * hw}" height="${2 * hh}" />
        <path d="${leads.join(' ')}" />
        ${upright(p.title, -(p.title.length * TITLE_W) / 2, -hh + 14, 'sym-text module-title', TITLE_W)}
        ${names.join('')}`;
    },
  },
};

export const models: ModelDefs<'module'> = {
  // Nothing of its own: the simulator works on the parts inside (see
  // flatten in src/modules.ts), and fills in what flows through each pin.
  // Its pins aren't joined inside it, except through those parts.
  module: {
    groups: [],
    stamp() {},
    current: () => 0,
    pinCurrents: (el) => el.nodes.map(() => 0),
    readout: (_r, p) => [['Module', p.title]],
  },
};
