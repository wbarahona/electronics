import type { ModelDefs } from '../../sim/models.ts';
import type { LabelSpot, PartDefs } from '../defs.ts';
import type { Point, PropsByType } from '../../types.ts';

// The values each of these parts carries: what the properties panel edits
// and the simulator reads (gathered into PropsByType in src/types.ts).
export interface PartProps {
  // A placed copy of a module (see src/modules.ts): `module` is its
  // definition's id, `title` its name, `ports` its pins (encodePorts),
  // `layout` its face as laid out in Edit module (encodeLayout; empty: laid
  // out automatically), `panel` the parts inside mounted on its face
  // (encodePanel). All are set from the definition. `settings` is this copy's
  // own: how its switches inside are set ({part id: {value: …}}, JSON). All
  // come along when it's copied.
  module: { module: string; title: string; ports: string; layout: string; panel: string; settings: string };
}

// A part inside mounted on the face: its id in the module and, when placed
// by hand, where (from the block's middle).
export type PanelSpot = [string, number?, number?];

export const encodePanel = (spots: PanelSpot[]): string => (spots.length ? JSON.stringify(spots) : '');

export function decodePanel(text: string): PanelSpot[] {
  try {
    const v: unknown = JSON.parse(text);
    if (!Array.isArray(v)) return [];
    return v
      .filter((q): q is PanelSpot => Array.isArray(q) && typeof q[0] === 'string')
      .map(([id, x, y]): PanelSpot => (Number.isFinite(x) && Number.isFinite(y) ? [id, x, y] : [id]));
  } catch {
    return [];
  }
}

// What a front-panel part takes up on the face, each way from its middle.
export const PANEL_HALF = { w: 13, h: 10 };

// Which side of the block a pin comes out of: left, right, top, bottom.
export type Side = 'L' | 'R' | 'T' | 'B';

const SIDES: readonly Side[] = ['L', 'R', 'T', 'B'];

// A pin as stored in `ports`: its side, its name and, when laid out by hand,
// where along that side it sits (from the middle, in grid steps of 20).
export type Port = [Side, string, number?];

// The pins as stored in `ports`: in pin order, as JSON.
export const encodePorts = (ports: Port[]): string => JSON.stringify(ports);

export function decodePorts(text: string): Port[] {
  try {
    const v: unknown = JSON.parse(text);
    if (!Array.isArray(v)) return [];
    return v
      .filter((p): p is Port => Array.isArray(p) && SIDES.includes(p[0]) && typeof p[1] === 'string')
      .map(([side, name, at]): Port => (Number.isFinite(at) ? [side, name, Math.round(at! / STEP) * STEP] : [side, name]));
  } catch {
    return [];
  }
}

// Where the title sits: along the top, in the middle, or not shown.
export type TitleSpot = 'top' | 'centre' | 'hidden';

// A face laid out by hand: the box's half width and height, and the title.
export interface Layout {
  hw: number;
  hh: number;
  title: TitleSpot;
}

export const encodeLayout = (l: Layout | null): string => (l ? JSON.stringify(l) : '');

export function decodeLayout(text: string): Layout | null {
  try {
    const v = JSON.parse(text) as Partial<Layout> | null;
    if (!v || !Number.isFinite(v.hw) || !Number.isFinite(v.hh)) return null;
    return { hw: v.hw!, hh: v.hh!, title: v.title === 'centre' || v.title === 'hidden' ? v.title : 'top' };
  } catch {
    return null;
  }
}

const CHAR_W = 6; // a 10px label character, roughly
const TITLE_W = 7; // a title character
const STEP = 20; // between pins, and a pin's lead

const escape = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

// Up to the next whole grid step.
const ceilStep = (v: number) => Math.ceil(v / STEP) * STEP;

// The block: a box only as big as its pins and names need (or as laid out,
// if bigger), its title in a row along the top unless set elsewhere. Pins
// come out of each side on the grid: where they were put, else centred (an
// even number one step lower), or in the free spots nearest the middle when
// some were put by hand. Each pin's lead is one grid step, so pins land on the
// grid wherever the block is put. Left and right pins are named inside the
// box; top and bottom ones beside their lead.
export function blockLayout(p: PropsByType['module']) {
  const ports = decodePorts(p.ports);
  const layout = decodeLayout(p.layout);
  const title = layout?.title ?? 'top';
  const on = (side: Side) => ports.map(([s, name, at], k) => ({ s, name, at, k })).filter((q) => q.s === side);
  const [left, right, top, bottom] = SIDES.map(on);
  const offsets = (list: { at?: number }[]): number[] => {
    if (list.every((q) => q.at === undefined)) return list.map((_, k) => (k - Math.floor((list.length - 1) / 2)) * STEP);
    const taken = new Set(list.map((q) => q.at).filter((at) => at !== undefined));
    return list.map((q) => {
      if (q.at !== undefined) return q.at;
      let at = 0;
      for (let d = 1; taken.has(at); d++) at = d % 2 ? (Math.ceil(d / 2) * STEP) : -(d / 2) * STEP;
      taken.add(at);
      return at;
    });
  };
  const [lo, ro, to, bo] = [left, right, top, bottom].map(offsets);
  // Front-panel parts: where placed, else in a row below the side pins.
  const spots = decodePanel(p.panel);
  const rowY = Math.max(0, ...lo, ...ro) + 30;
  const loose = spots.filter((q) => q.length < 3);
  const panel = spots.map(([id, x, y]) => {
    if (x !== undefined && y !== undefined) return { id, x, y };
    const j = loose.findIndex((q) => q[0] === id);
    return { id, x: (j - (loose.length - 1) / 2) * 30, y: rowY };
  });
  const widest = (list: { name: string }[]) => Math.max(0, ...list.map((q) => q.name.length * CHAR_W));
  const titleW = title === 'hidden' ? 0 : p.title.length * TITLE_W + 16;
  const names = widest(left) + widest(right) + 24;
  const down = [...lo, ...ro];
  const across = [...to, ...bo].map(Math.abs);
  const needW = Math.max(
    2 * STEP,
    Math.max(0, ...panel.map((q) => ceilStep(Math.abs(q.x) + PANEL_HALF.w + 4))),
    ceilStep((title === 'centre' ? titleW + names : Math.max(titleW, names)) / 2),
    Math.max(0, ...across) + STEP,
  );
  // Room above the top side pin for a title row.
  const needH = Math.max(
    2 * STEP,
    Math.max(0, ...down) + STEP,
    -Math.min(0, ...down) + (title === 'top' ? 2 * STEP : STEP),
    ...panel.map((q) => ceilStep(Math.abs(q.y) + PANEL_HALF.h + 6)),
  );
  const hw = Math.max(needW, layout?.hw ?? 0);
  const hh = Math.max(needH, layout?.hh ?? 0);
  const pins: Point[] = [];
  const place = (list: { k: number }[], at: number[], to: (o: number) => Point) => list.forEach((q, j) => (pins[q.k] = to(at[j])));
  place(left, lo, (o) => ({ x: -hw - STEP, y: o }));
  place(right, ro, (o) => ({ x: hw + STEP, y: o }));
  place(top, to, (o) => ({ x: o, y: -hh - STEP }));
  place(bottom, bo, (o) => ({ x: o, y: hh + STEP }));
  return { ports, pins, hw, hh, title, panel, sides: { left, right, top, bottom } };
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
      layout: { label: 'Layout', value: '', text: true, hidden: true, kept: true },
      panel: { label: 'Front panel', value: '', text: true, hidden: true, kept: true },
      settings: { label: 'Settings', value: '', text: true, hidden: true, kept: true },
    },
    hit: (p) => {
      const { hw, hh } = blockLayout(p);
      return { w: 2 * hw, h: 2 * hh };
    },
    labelAt: (vertical, p) => blockLabel(vertical, p),
    draw: (p) => {
      const { hw, hh, pins, sides, title } = blockLayout(p);
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
        ${title === 'hidden' ? '' : upright(p.title, -(p.title.length * TITLE_W) / 2, title === 'top' ? -hh + 14 : 0, 'sym-text module-title', TITLE_W)}
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
