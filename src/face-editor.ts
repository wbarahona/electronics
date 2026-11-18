import { snap, type Board } from './board.ts';
import { symbolMarkup } from './components.ts';
import type { Face } from './modules.ts';
import { PANEL_HALF, blockLayout, decodePanel, decodePorts, encodeLayout, encodePanel, encodePorts, type Side, type TitleSpot } from './parts/modules/block.ts';
import type { PropsByType } from './types.ts';

const SVG_NS = 'http://www.w3.org/2000/svg';
const STEP = 20; // grid step: pins sit on it, the box grows by it

type BlockProps = PropsByType['module'];

// Edit module's Face view: the module's block at real size, at the board's
// origin, to lay out by hand. Drag its edges or corners to resize it (never
// smaller than its pins and title need), and its pins along an edge or round
// to another side (on the grid, never two in one spot), and its front-panel
// parts anywhere inside the box (in half grid steps). `onChange` gets the
// face after each drag; the title's spot is set from outside (setTitle).
export function createFaceEditor(board: Board, onChange: (face: Face) => void) {
  const g = document.createElementNS(SVG_NS, 'g');
  g.setAttribute('class', 'face-editor');
  board.world.append(g);

  let props: BlockProps | null = null;
  let ids: string[] = []; // the Terminal behind each pin, in pin order
  let face: Face | null = null;
  let label: (id: string) => string = (id) => id; // a front-panel part's reference
  let drag:
    | { id: number; what: 'pin'; k: number }
    | { id: number; what: 'size'; x: boolean; y: boolean }
    | { id: number; what: 'panel'; part: string }
    | null = null;

  // The block's values for the face as it stands.
  const valuesOf = (f: Face): BlockProps => {
    const names = decodePorts(props!.ports).map(([, name]) => name);
    return {
      ...props!,
      ports: encodePorts(ids.map((id, k) => [f.pins[id].side, names[k], f.pins[id].at])),
      layout: encodeLayout({ hw: f.hw, hh: f.hh, title: f.title }),
      panel: encodePanel(decodePanel(props!.panel).map(([id]) => (f.panel?.[id] ? [id, f.panel[id].x, f.panel[id].y] : [id]))),
    };
  };

  // The face as a block with these values lays itself out (every pin placed).
  function faceOf(p: BlockProps): Face {
    const { hw, hh, title, pins, panel } = blockLayout(p);
    const out: Face = { hw, hh, title, pins: {}, panel: Object.fromEntries(panel.map((q) => [q.id, { x: q.x, y: q.y }])) };
    pins.forEach((pin, k) => {
      const side: Side = pin.x < -hw ? 'L' : pin.x > hw ? 'R' : pin.y < 0 ? 'T' : 'B';
      out.pins[ids[k]] = { side, at: side === 'L' || side === 'R' ? pin.y : pin.x };
    });
    return out;
  }

  function show(values: BlockProps, terminals: string[], refOf: (id: string) => string) {
    props = values;
    ids = terminals;
    label = refOf;
    face = faceOf(values);
    render();
  }

  function hide() {
    props = null;
    face = null;
    drag = null;
    g.replaceChildren();
  }

  function setTitle(title: TitleSpot) {
    if (!face) return;
    face = faceOf(valuesOf({ ...face, title }));
    render();
    onChange(face);
  }

  function render() {
    if (!face) return;
    const { hw, hh } = face;
    const { pins, panel } = blockLayout(valuesOf(face));
    const edge = (side: string, x1: number, y1: number, x2: number, y2: number) =>
      `<line class="face-edge ${side === 'L' || side === 'R' ? 'ew' : 'ns'}" data-edge="${side}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" />`;
    const corner = (x: number, y: number) =>
      `<g class="face-handle ${x * y > 0 ? 'nwse' : 'nesw'}" data-corner="" transform="translate(${x} ${y})"><circle class="face-handle-hit" r="12" /><circle class="face-handle-dot" r="5" /></g>`;
    g.innerHTML = `
      <g class="part">${symbolMarkup('module', valuesOf(face))}</g>
      ${edge('L', -hw, -hh, -hw, hh)}${edge('R', hw, -hh, hw, hh)}${edge('T', -hw, -hh, hw, -hh)}${edge('B', -hw, hh, hw, hh)}
      ${corner(-hw, -hh)}${corner(hw, -hh)}${corner(-hw, hh)}${corner(hw, hh)}
      ${pins.map((p, k) => `<circle class="face-pin" data-k="${k}" cx="${p.x}" cy="${p.y}" r="9" />`).join('')}
      ${panel
        .map(
          (q) => `<g class="face-panel" data-part="${q.id}" transform="translate(${q.x} ${q.y})">
            <rect x="${-PANEL_HALF.w}" y="${-PANEL_HALF.h}" width="${2 * PANEL_HALF.w}" height="${2 * PANEL_HALF.h}" rx="4" />
            <text y="0" text-anchor="middle" dominant-baseline="central">${label(q.id)}</text>
          </g>`,
        )
        .join('')}`;
  }

  // Move pin k toward world point p: onto the nearest side, at the grid spot
  // nearest along it within the side's reach (clear of the corners, and of a
  // title row along the top), or the free spot nearest that.
  function movePin(k: number, p: { x: number; y: number }) {
    const f = face!;
    const near = [
      ['L', Math.abs(p.x + f.hw)],
      ['R', Math.abs(p.x - f.hw)],
      ['T', Math.abs(p.y + f.hh)],
      ['B', Math.abs(p.y - f.hh)],
    ] as [Side, number][];
    const side = near.sort((a, b) => a[1] - b[1])[0][0];
    const vertical = side === 'L' || side === 'R';
    const [lo, hi] = vertical ? [-f.hh + (f.title === 'top' ? 2 * STEP : STEP), f.hh - STEP] : [-f.hw + STEP, f.hw - STEP];
    const taken = new Set(ids.filter((id, j) => j !== k && f.pins[id].side === side).map((id) => f.pins[id].at));
    const want = Math.min(hi, Math.max(lo, snap(vertical ? p.y : p.x)));
    for (let d = 0; d <= hi - lo; d += STEP) {
      for (const at of [want + d, want - d]) {
        if (at < lo || at > hi || taken.has(at)) continue;
        f.pins[ids[k]] = { side, at };
        face = faceOf(valuesOf(f));
        render();
        return;
      }
    }
  }

  // Put front-panel part `id` at world point p: in half grid steps, inside the box.
  function movePanel(id: string, p: { x: number; y: number }) {
    const f = face!;
    const half = (v: number) => Math.round(v / (STEP / 2)) * (STEP / 2);
    const [mx, my] = [f.hw - PANEL_HALF.w - 4, f.hh - PANEL_HALF.h - 6];
    const x = Math.min(mx, Math.max(-mx, half(p.x)));
    const y = Math.min(my, Math.max(-my, half(p.y)));
    face = faceOf(valuesOf({ ...f, panel: { ...f.panel, [id]: { x, y } } }));
    render();
  }

  // Resize to reach world point p (the box stays centred, so it grows a grid
  // step at each end; the layout keeps it from shrinking past what it needs).
  function resize(x: boolean, y: boolean, p: { x: number; y: number }) {
    const f = face!;
    const hw = x ? Math.max(2 * STEP, snap(Math.abs(p.x))) : f.hw;
    const hh = y ? Math.max(2 * STEP, snap(Math.abs(p.y))) : f.hh;
    face = faceOf(valuesOf({ ...f, hw, hh }));
    render();
  }

  g.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || !face) return;
    const t = (e.target as Element).closest<SVGElement>('[data-k], [data-edge], [data-corner], [data-part]');
    if (!t) return;
    e.stopPropagation();
    e.preventDefault();
    if (t.dataset.k !== undefined) drag = { id: e.pointerId, what: 'pin', k: Number(t.dataset.k) };
    else if (t.dataset.part) drag = { id: e.pointerId, what: 'panel', part: t.dataset.part };
    else if (t.dataset.edge) drag = { id: e.pointerId, what: 'size', x: 'LR'.includes(t.dataset.edge), y: 'TB'.includes(t.dataset.edge) };
    else drag = { id: e.pointerId, what: 'size', x: true, y: true };
    g.setPointerCapture(e.pointerId);
  });

  g.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const p = board.screenToWorld(e.clientX, e.clientY);
    if (drag.what === 'pin') movePin(drag.k, p);
    else if (drag.what === 'panel') movePanel(drag.part, p);
    else resize(drag.x, drag.y, p);
  });

  const drop = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.id) return;
    drag = null;
    if (face) onChange(face);
  };
  g.addEventListener('pointerup', drop);
  g.addEventListener('pointercancel', drop);

  return { show, hide, setTitle };
}
