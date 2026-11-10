import { GRID, snap } from './board.js';
import { LIGHT_COLORS, PARTS, symbolMarkup } from './components.js';
import {
  endHorizontal, endId, endPos, moveSegment, pinPos, pointOnPath, route, simplify, toPoints, wirePoints,
} from './wires.js';
import { fromControl } from './keys.js';
import { buildNets, keyOf, pinKey } from './nets.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const PART_W = 80;
const PART_H = 40;
const DOUBLE_CLICK_MS = 500;
const DOT_SPACING = 16; // must match .wire-flow's stroke-dasharray
const FLOW_MIN = 1e-6; // A; below this a wire shows no flow
const FLOW_REF = 1e-4; // A
const FLOW_SPEED = 40; // world units/s per decade of current above FLOW_REF
// Real time over which the eye blends changing light and motion: at full speed
// a 50 Hz flicker blurs into a steady glow, in slow motion it shows.
const PERSISTENCE = 0.04; // s
// Invisible box over each symbol so thin strokes are easy to grab.
const HIT = `<rect class="hit" x="${-PART_W / 2}" y="${-PART_H / 2}" width="${PART_W}" height="${PART_H}" />`;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const isWire = (x) => 'from' in x;
const isPart = (x) => 'type' in x;
const samePoint = (a, b) => a.x === b.x && a.y === b.y;

// Wire ends are a pin { part, pin } or a joint { joint }. While drawing, an end
// can also be a spot on an existing wire { wire, at }, which becomes a joint
// once the new wire is placed.
function sameEnd(a, b) {
  if (a.wire || b.wire) return a.wire === b.wire && samePoint(a.at, b.at);
  return endId(a) === endId(b) && a.pin === b.pin;
}

// Does a part's (rotated) box, or a joint's point, fall in the selection box?
function touches(box, n) {
  const vertical = n.rotation % 180 !== 0;
  const hw = isPart(n) ? (vertical ? PART_H : PART_W) / 2 : 0;
  const hh = isPart(n) ? (vertical ? PART_W : PART_H) / 2 : 0;
  return n.x + hw >= box.x1 && n.x - hw <= box.x2 && n.y + hh >= box.y1 && n.y - hh <= box.y2;
}

// The pin or joint under a pointer event target, or null.
function endOf(target) {
  const pin = target.closest?.('.pin-hit');
  if (pin) return { part: pin.closest('.part').dataset.id, pin: Number(pin.dataset.pin) };
  const joint = target.closest?.('.joint');
  return joint ? { joint: joint.dataset.id } : null;
}

function svgEl(name, className, parent) {
  const el = document.createElementNS(SVG_NS, name);
  el.setAttribute('class', className);
  parent.append(el);
  return el;
}

// `onSelect(ids)` is called whenever the selection changes, `onChange(nets)`
// after every edit to the circuit, `onPropChange(id)` when a part's props were
// changed on the board (e.g. a switch flipped), and `onContextMenu(clientX,
// clientY, worldPoint)` on a right-click, after the selection is updated.
export function createEditor(
  board,
  circuit,
  { onSelect = () => {}, onChange = () => {}, onPropChange = () => {}, onContextMenu = () => {} } = {},
) {
  const { svg, world } = board;
  // Wires sit under joints, joints under parts, so pins stay clickable.
  const wiresLayer = svgEl('g', 'wires', world);
  const jointsLayer = svgEl('g', 'joints', world);
  const partsLayer = svgEl('g', 'parts', world);
  const nodes = new Map(); // part, wire or joint id -> <g>
  const selected = new Set();
  let drag = null; // moving the selection
  let marquee = null; // rubber-band selection on empty board
  let wiring = null; // wire being drawn
  let segDrag = null; // moving one segment of a wire sideways
  let wiringClickAt = -Infinity; // time of the last click used by wiring
  let lit = null; // wire highlighted as the place a dragged part will drop into
  let nets = buildNets(circuit);

  // One soft radial gradient per light colour, fading out to transparent.
  svg.querySelector('defs').insertAdjacentHTML(
    'beforeend',
    Object.entries(LIGHT_COLORS)
      .map(([key, color]) => `
        <radialGradient id="glow-${key}">
          <stop offset="0" stop-color="${color}" stop-opacity="0.9" />
          <stop offset="0.35" stop-color="${color}" stop-opacity="0.45" />
          <stop offset="1" stop-color="${color}" stop-opacity="0" />
        </radialGradient>`)
      .join(''),
  );

  function place(n) {
    const g = nodes.get(n.id);
    g.setAttribute('transform', `translate(${n.x} ${n.y}) rotate(${n.rotation ?? 0})`);
    // Keep a part's label and actuator upright. The label sits above the part
    // (right of it when vertical), or on the opposite side when the actuator
    // takes that spot.
    const vertical = n.rotation % 180 !== 0;
    const text = g.querySelector('.value');
    if (text) {
      const other = !!PARTS[n.type].actuator;
      const offset = vertical ? `${other ? -26 : 26} 4` : `0 ${other ? 32 : -26}`;
      text.setAttribute('transform', `rotate(${-n.rotation}) translate(${offset})`);
      text.setAttribute('text-anchor', vertical ? (other ? 'end' : 'start') : 'middle');
    }
    g.querySelector('.actuator')
      ?.setAttribute('transform', `rotate(${-n.rotation}) translate(${vertical ? '34 0' : '0 -34'})`);
  }

  // The small on-board control for a part you operate by hand: a toggle pill
  // for switches, a round button for momentary ones.
  function actuatorMarkup(c) {
    const { prop, momentary } = PARTS[c.type].actuator;
    const on = c.props[prop] ? ' on' : '';
    const body = momentary
      ? '<circle class="act-bg" r="7" /><circle class="act-knob" r="3.5" />'
      : `<rect class="act-bg" x="-10" y="-6" width="20" height="12" rx="6" />
         <circle class="act-knob" cx="${c.props[prop] ? 4 : -4}" r="3.5" />`;
    return `<g class="actuator${on}">${body}<rect class="act-hit" x="-13" y="-10" width="26" height="20" /></g>`;
  }

  // (Re)draw a part's symbol, value text and hit areas from its current props.
  function renderPart(c) {
    const part = PARTS[c.type];
    const tag = part.tag?.(c.props);
    const pinHits = part.pins.map(
      (p, i) => `<circle class="pin-hit" data-pin="${i}" cx="${p.x}" cy="${p.y}" r="7" />`,
    );
    const g = nodes.get(c.id);
    g.classList.toggle('broken', !!c.broken);
    let glow = '';
    if (part.glow) {
      const key = part.glow.color(c.props);
      glow = `<circle class="glow" r="${part.glow.radius}" fill="url(#glow-${key})" />`;
      g.style.setProperty('--glow-color', LIGHT_COLORS[key]);
    }
    g.innerHTML =
      glow +
      symbolMarkup(c.type, c.props, c.broken) +
      `<text class="value"><tspan class="ref">-${c.ref}</tspan>${tag ? ` ${tag}` : ''}</text>` +
      HIT +
      pinHits.join('') +
      (part.actuator ? actuatorMarkup(c) : '');
    place(c);
  }

  function setProp(c, key, value) {
    c.props[key] = value;
    refreshPart(c.id);
    onPropChange(c.id);
  }

  // Operate a part's actuator: flip a switch, or hold a push button closed
  // until the pointer is released anywhere.
  function actuate(c) {
    const { prop, momentary } = PARTS[c.type].actuator;
    if (!momentary) {
      setProp(c, prop, !c.props[prop]);
      return;
    }
    setProp(c, prop, true);
    const release = () => {
      window.removeEventListener('pointerup', release);
      window.removeEventListener('pointercancel', release);
      if (circuit.get(c.id)) setProp(c, prop, false);
    };
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
  }

  // Show live simulation state per part id: `glow` is brightness (1 = at its
  // rating), `heat` is 0..1 from its rating up to the point where it fails.
  // With `smooth`, light eases toward the new level in animate() the way the
  // eye blends flicker; otherwise it jumps there.
  const glows = new Map(); // part id -> { target, shown } light levels 0..1

  function showLive(live, smooth = false) {
    for (const [id, { glow, heat }] of live) {
      const g = nodes.get(id);
      if (!g) continue;
      const level = Math.min(1, Math.max(0, glow));
      const s = glows.get(id) ?? { shown: level };
      s.target = level;
      if (!smooth) s.shown = level;
      glows.set(id, s);
      paintGlow(g, s.shown);
      g.style.setProperty('--heat', heat.toFixed(3));
    }
    for (const id of glows.keys()) if (!nodes.has(id)) glows.delete(id);
  }

  // The eye sees brightness roughly as a square root, so dim parts still show.
  function paintGlow(g, level) {
    g.style.setProperty('--glow', Math.sqrt(level).toFixed(3));
  }

  // Redraw a part that just failed, with a puff of smoke rising from it.
  function burn(id) {
    const c = circuit.get(id);
    refreshPart(id);
    const g = nodes.get(id);
    g.insertAdjacentHTML(
      'beforeend',
      `<g class="smoke" transform="rotate(${-c.rotation})">
        <circle r="7" /><circle r="5" cx="-7" /><circle r="6" cx="6" />
      </g>`,
    );
    const smoke = g.lastElementChild;
    setTimeout(() => smoke.remove(), 1600);
  }

  // After a part's props were edited.
  function refreshPart(id) {
    renderPart(circuit.get(id));
    refreshNets();
  }

  // Each segment gets its own wide invisible hit line, so the cursor can show
  // which way that segment drags.
  function drawWire(w) {
    const pts = wirePoints(circuit, w);
    const [hits, line, flow] = nodes.get(w.id).children;
    line.setAttribute('points', toPoints(pts));
    flow.setAttribute('points', toPoints(pts));
    hits.innerHTML = pts
      .slice(1)
      .map((b, k) => {
        const a = pts[k];
        if (samePoint(a, b)) return '';
        const dir = a.y === b.y ? 'h' : 'v';
        return `<line class="wire-hit ${dir}" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" />`;
      })
      .join('');
  }

  function setSelected(ids) {
    for (const id of selected) nodes.get(id)?.classList.remove('selected');
    selected.clear();
    for (const id of ids) {
      selected.add(id);
      nodes.get(id).classList.add('selected');
    }
    onSelect([...selected]);
  }

  // Selected parts and joints: the things that have a position of their own.
  const selectedNodes = () => [...selected].map((id) => circuit.get(id)).filter((x) => !isWire(x));

  // Wires attached to the given parts/joints: `touching` need redrawing when
  // they move, `inside` (both ends among them) carry their bend points along.
  function wiresAround(list) {
    const ids = new Set(list.map((n) => n.id));
    const touching = [];
    const inside = [];
    for (const w of circuit.wires) {
      const a = ids.has(endId(w.from));
      const b = ids.has(endId(w.to));
      if (a || b) touching.push(w);
      if (a && b) inside.push(w);
    }
    return { touching, inside };
  }

  // A new part dropped onto a wire is embedded in it.
  function add(type, x, y, rotation = 0) {
    highlight(null);
    const spot = findSpot(type, { x, y }, rotation);
    const c = spot
      ? circuit.add(type, spot.x, spot.y, spot.rotation)
      : circuit.add(type, snap(x), snap(y), rotation);
    mountPart(c);
    if (spot) embed(c, spot);
    else refreshNets();
    setSelected([c.id]);
  }

  // Create the drawing for a part that is already in the circuit.
  function mountPart(c) {
    const g = svgEl('g', 'part', partsLayer);
    g.dataset.id = c.id;
    nodes.set(c.id, g);
    renderPart(c);
  }

  // Where a two-pin part would go for the palette's drag preview: on a wire
  // when one is close, otherwise the nearest grid point.
  function preview(type, p, rotation) {
    const spot = findSpot(type, p, rotation);
    highlight(spot?.wire);
    return spot ?? { x: snap(p.x), y: snap(p.y), rotation };
  }

  function addWire(w) {
    const g = svgEl('g', 'wire', wiresLayer);
    g.dataset.id = w.id;
    g.innerHTML = '<g class="wire-hits"></g><polyline class="wire-line" /><polyline class="wire-flow" />';
    nodes.set(w.id, g);
    drawWire(w);
  }

  function addJoint(x, y) {
    const j = circuit.addJoint(x, y);
    const g = svgEl('g', 'joint', jointsLayer);
    g.dataset.id = j.id;
    g.innerHTML = '<circle class="joint-dot" r="4" /><circle class="joint-hit" r="7" />';
    nodes.set(j.id, g);
    place(j);
    return j;
  }

  function removeNode(id) {
    nodes.get(id).remove();
    nodes.delete(id);
    circuit.remove(id);
  }

  // --- Nets -----------------------------------------------------------------
  // Recomputed after every change. Pins that connect to anything are drawn
  // filled, open ones hollow; hovering a pin, joint or wire lights up its net.

  function refreshNets() {
    nets = buildNets(circuit);
    showNet(null);
    for (const c of circuit.components) {
      for (const el of nodes.get(c.id).querySelectorAll('.pin')) {
        const n = nets.netOf.get(pinKey(c.id, el.dataset.pin));
        el.classList.toggle('linked', nets.nets[n].length > 1);
      }
    }
    onChange(nets);
  }

  function showNet(n) {
    for (const el of world.querySelectorAll('.net-hot')) el.classList.remove('net-hot');
    if (n === undefined || n === null) return;
    for (const key of nets.nets[n]) {
      const [part, pin] = key.split(':');
      const el = pin === undefined ? nodes.get(key) : nodes.get(part).querySelector(`.pin[data-pin="${pin}"]`);
      el.classList.add('net-hot');
    }
    for (const w of circuit.wires) {
      if (nets.netOf.get(keyOf(w.from)) === n) nodes.get(w.id).classList.add('net-hot');
    }
  }

  svg.addEventListener('pointerover', (e) => {
    if (drag || segDrag || marquee) return;
    const end = endOf(e.target);
    const wire = e.target.closest?.('.wire');
    const key = end ? keyOf(end) : wire ? keyOf(circuit.get(wire.dataset.id).from) : null;
    showNet(key && nets.netOf.get(key));
  });

  // --- Joints ---------------------------------------------------------------

  // Cut wire `w` at grid point `at` on its path into two wires meeting at a new
  // joint, keeping its exact shape. Returns the end to attach to there.
  function splitWire(w, at) {
    const pts = wirePoints(circuit, w);
    if (samePoint(at, pts[0])) return w.from;
    if (samePoint(at, pts.at(-1))) return w.to;
    const { i } = pointOnPath(pts, at, 0);
    const end = { joint: addJoint(at.x, at.y).id };
    const before = pts.slice(1, i + 1).filter((p) => !samePoint(p, at));
    const after = pts.slice(i + 1, -1).filter((p) => !samePoint(p, at));
    removeNode(w.id);
    addWire(circuit.connect(w.from, end, before));
    addWire(circuit.connect(end, w.to, after));
    return end;
  }

  // Turn a spot on a wire into a real end. The wire may already have been split
  // by the other end of the same new wire, so fall back to whichever piece now
  // runs through that spot.
  function resolve(end) {
    if (!end.wire) return end;
    const w =
      circuit.get(end.wire) ??
      circuit.wires.find((x) => pointOnPath(wirePoints(circuit, x), end.at, 0));
    return splitWire(w, end.at);
  }

  // Join the two wires meeting at `j` back into one, keeping their shape.
  function mergeAt(j, [w1, w2]) {
    const p1 = wirePoints(circuit, w1);
    const p2 = wirePoints(circuit, w2);
    const into = w1.to.joint === j.id ? p1 : p1.reverse(); // ends at j
    const out = w2.from.joint === j.id ? p2 : p2.reverse(); // starts at j
    const from = w1.to.joint === j.id ? w1.from : w1.to;
    const to = w2.from.joint === j.id ? w2.to : w2.from;
    removeNode(w1.id);
    removeNode(w2.id);
    removeNode(j.id);
    addWire(circuit.connect(from, to, [...into.slice(1), ...out.slice(1, -1)]));
  }

  // Joints only exist where wires meet: drop orphans, fold a joint with just two
  // wires back into one wire, and show the junction dot where three or more meet.
  function tidyJoints() {
    for (const j of [...circuit.joints]) {
      const ws = circuit.wiresOf(j.id);
      if (ws.length === 0) removeNode(j.id);
      else if (ws.length === 2 && ws[0] !== ws[1]) mergeAt(j, ws);
      else nodes.get(j.id).classList.toggle('junction', ws.length >= 3);
    }
    refreshNets();
  }

  // --- Embedding parts in wires ---------------------------------------------

  // Where a two-pin part near `p` would sit inside a wire: centred on a straight
  // stretch long enough for both pins, turned to lie along it, within a grid
  // step of `p`. Pins may not land on the wire's own ends. Returns
  // { x, y, rotation, wire, i } (i = segment index) or null.
  function findSpot(type, p, rotation) {
    const half = Math.abs(PARTS[type].pins[0].x);
    let best = null;
    let bestD = GRID;
    for (const w of circuit.wires) {
      const pts = wirePoints(circuit, w);
      const ends = [pts[0], pts.at(-1)];
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i];
        const b = pts[i + 1];
        if (samePoint(a, b)) continue;
        const horiz = a.y === b.y;
        const lo = (horiz ? Math.min(a.x, b.x) : Math.min(a.y, b.y)) + half;
        const hi = (horiz ? Math.max(a.x, b.x) : Math.max(a.y, b.y)) - half;
        if (lo > hi) continue;
        const along = clamp(snap(horiz ? p.x : p.y), lo, hi);
        const at = horiz ? { x: along, y: a.y } : { x: a.x, y: along };
        const d = Math.hypot(at.x - p.x, at.y - p.y);
        if (d > bestD) continue;
        const pins = horiz
          ? [{ x: along - half, y: a.y }, { x: along + half, y: a.y }]
          : [{ x: a.x, y: along - half }, { x: a.x, y: along + half }];
        if (pins.some((q) => ends.some((e) => samePoint(q, e)))) continue;
        bestD = d;
        const lies = (rotation % 180 === 0) === horiz;
        best = { ...at, rotation: lies ? rotation : (rotation + 90) % 360, wire: w.id, i };
      }
    }
    return best;
  }

  // Put part `c`, already placed at `spot`, into that wire: the wire is cut at
  // both pins and the stretch the part covers is removed.
  function embed(c, spot) {
    const w = circuit.get(spot.wire);
    const pts = wirePoints(circuit, w);
    const start = pts[spot.i];
    const dist = (q) => Math.abs(q.x - start.x) + Math.abs(q.y - start.y);
    const pins = [0, 1].map((pin) => ({ pin, at: pinPos(c, pin) }));
    const [near, far] = dist(pins[0].at) <= dist(pins[1].at) ? pins : [pins[1], pins[0]];
    removeNode(w.id);
    addWire(circuit.connect(w.from, { part: c.id, pin: near.pin },
      pts.slice(1, spot.i + 1).filter((p) => !samePoint(p, near.at))));
    addWire(circuit.connect({ part: c.id, pin: far.pin }, w.to,
      pts.slice(spot.i + 1, -1).filter((p) => !samePoint(p, far.at))));
    tidyJoints();
  }

  function highlight(id) {
    if (lit === (id ?? null)) return;
    if (lit) nodes.get(lit)?.classList.remove('embed-target');
    lit = id ?? null;
    if (lit) nodes.get(lit).classList.add('embed-target');
  }

  // While a lone unwired part is dragged, let it snap into a nearby wire.
  // `drag.rot` is the rotation the user chose; on a wire the part is turned to
  // lie along it, so pressing R there flips it end for end.
  function snapIntoWire() {
    const c = drag.free;
    const spot = findSpot(c.type, c, drag.rot);
    if (spot) Object.assign(c, { x: spot.x, y: spot.y, rotation: spot.rotation });
    else c.rotation = drag.rot;
    place(c);
    highlight(spot?.wire);
  }

  // --- Editing the selection ------------------------------------------------

  // Rotate the selection 90° clockwise about a grid point at its centre,
  // so a single part spins in place and every position stays on the grid.
  function rotateSelected() {
    const list = selectedNodes();
    if (!list.length) return;
    const cx = snap(list.reduce((s, n) => s + n.x, 0) / list.length);
    const cy = snap(list.reduce((s, n) => s + n.y, 0) / list.length);
    const spin = (p) => ({ x: cx - (p.y - cy), y: cy + (p.x - cx) });
    for (const n of list) {
      Object.assign(n, spin(n));
      if (isPart(n)) n.rotation = (n.rotation + 90) % 360;
      place(n);
      // Mid-drag, re-base so the rotated group keeps following the cursor.
      if (drag) drag.base.set(n.id, { x: n.x - drag.dx, y: n.y - drag.dy });
    }
    const { touching, inside } = wiresAround(list);
    for (const w of inside) {
      w.via = w.via.map(spin);
      if (drag) drag.viaBase.set(w.id, w.via.map((p) => ({ x: p.x - drag.dx, y: p.y - drag.dy })));
    }
    touching.forEach(drawWire);
    if (drag?.free) {
      drag.rot = drag.free.rotation;
      snapIntoWire();
    }
    refreshNets();
  }

  // Deleting a part or joint also deletes the wires attached to it.
  function deleteSelected() {
    drag = null;
    segDrag = null;
    highlight(null);
    const doomed = new Set(selected);
    for (const n of selectedNodes()) {
      for (const w of circuit.wiresOf(n.id)) doomed.add(w.id);
    }
    setSelected([]);
    for (const id of doomed) removeNode(id);
    tidyJoints();
  }

  // Esc during a drag puts everything back as it was when the drag started.
  function cancelDrag() {
    for (const n of drag.list) {
      Object.assign(n, drag.orig.get(n.id));
      place(n);
    }
    for (const w of drag.inside) w.via = drag.origVia.get(w.id);
    drag.touching.forEach(drawWire);
    drag = null;
    highlight(null);
    refreshNets();
  }

  function endMarquee() {
    marquee.rect.remove();
    marquee = null;
  }

  // --- Wiring ---------------------------------------------------------------
  // Start on a pin or joint (press), or double-click a wire to branch from it.
  // Then either release on the target, or click empty grid points to add
  // bends and click the target. Targets are pins, joints or any spot on a wire,
  // which makes a junction there. Esc cancels, Backspace removes the last bend.

  // A spot on wire `w` nearest the pointer.
  function tapOn(w, e) {
    const p = board.screenToWorld(e.clientX, e.clientY);
    return { wire: w.id, at: pointOnPath(wirePoints(circuit, w), p, Infinity).at };
  }

  // What the pointer is over that a wire could attach to.
  function targetOf(e) {
    const end = endOf(e.target);
    if (end) return end;
    const g = e.target.closest?.('.wire');
    return g ? tapOn(circuit.get(g.dataset.id), e) : null;
  }

  const posOf = (end) => (end.wire ? end.at : endPos(circuit, end));
  const hintOf = (end) => (end.wire ? undefined : endHorizontal(circuit, end));

  function startWire(from, e) {
    setSelected([]);
    const line = svgEl('polyline', 'wire-draft', world);
    wiring = { from, via: [], line, end: null, pressed: true };
    aimWire(e);
  }

  // Follow the cursor, locking onto whatever it could attach to.
  function aimWire(e) {
    const t = targetOf(e);
    if (t) {
      wiring.end = posOf(t);
    } else {
      const p = board.screenToWorld(e.clientX, e.clientY);
      wiring.end = { x: snap(p.x), y: snap(p.y) };
    }
    drawDraft();
  }

  function drawDraft() {
    const pts = route([posOf(wiring.from), ...wiring.via, wiring.end], hintOf(wiring.from));
    wiring.line.setAttribute('points', toPoints(pts));
  }

  function finishWire(to) {
    const { from, via } = wiring;
    stopWire();
    const a = resolve(from);
    const b = resolve(to);
    if (!sameEnd(a, b)) addWire(circuit.connect(a, b, via));
    tidyJoints();
  }

  function stopWire() {
    wiring.line.remove();
    wiring = null;
  }

  // Capture phase: presses on pins/joints and clicks mid-wire are handled here
  // before part dragging, the marquee or panning see them.
  svg.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || board.spaceHeld) return;
    if (!wiring) {
      const end = endOf(e.target);
      if (!end) return;
      e.stopPropagation();
      startWire(end, e);
      return;
    }
    e.stopPropagation();
    wiringClickAt = e.timeStamp;
    const t = targetOf(e);
    if (t) {
      if (!sameEnd(t, wiring.from)) finishWire(t);
      else if (!wiring.via.length) stopWire(); // clicking the start again cancels
      return;
    }
    const p = board.screenToWorld(e.clientX, e.clientY);
    const bend = { x: snap(p.x), y: snap(p.y) };
    const last = wiring.via.at(-1);
    if (!last || !samePoint(last, bend)) wiring.via.push(bend);
    drawDraft();
  }, true);

  // Releasing the first press over a different target completes a dragged wire.
  svg.addEventListener('pointerup', (e) => {
    if (!wiring?.pressed) return;
    wiring.pressed = false;
    const t = targetOf(e);
    if (t && !sameEnd(t, wiring.from)) finishWire(t);
  });

  svg.addEventListener('pointermove', (e) => {
    if (wiring) aimWire(e);
  });

  // Double-clicking a wire starts a branch from that spot, in click mode. Clicks
  // that just finished a wire don't count, or ending on a wire would branch again.
  svg.addEventListener('dblclick', (e) => {
    if (wiring || board.spaceHeld || e.timeStamp - wiringClickAt < DOUBLE_CLICK_MS) return;
    const g = e.target.closest?.('.wire');
    if (!g) return;
    startWire(tapOn(circuit.get(g.dataset.id), e), e);
    wiring.pressed = false;
  });

  // --- Moving wire segments -------------------------------------------------
  // Dragging a wire slides the segment under the pointer sideways in grid steps:
  // horizontal ones up/down, vertical ones left/right. The wire's ends never
  // move; a step is added next to them instead.

  function startSegmentDrag(w, e, g) {
    const base = simplify(wirePoints(circuit, w));
    const start = board.screenToWorld(e.clientX, e.clientY);
    const { i } = pointOnPath(base, start, Infinity);
    const horiz = base[i].y === base[i + 1].y;
    segDrag = { id: e.pointerId, w, base, i, horiz, start, d: 0, orig: w.via };
    g.setPointerCapture(e.pointerId);
  }

  function cancelSegmentDrag() {
    segDrag.w.via = segDrag.orig;
    drawWire(segDrag.w);
    segDrag = null;
  }

  // --- Selecting and moving -------------------------------------------------
  // Dragging a part moves the whole selection in grid steps; shift-click toggles
  // a part or wire in or out of the selection. Stopping propagation keeps the
  // empty-board handlers below from starting a marquee.
  world.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || board.spaceHeld) return;
    // A part's actuator operates it without selecting or moving it.
    const act = e.target.closest('.actuator');
    if (act) {
      e.stopPropagation();
      actuate(circuit.get(act.closest('.part').dataset.id));
      return;
    }
    const g = e.target.closest('.part, .wire');
    if (!g) return;
    e.stopPropagation();
    const id = g.dataset.id;
    if (e.shiftKey) {
      const ids = new Set(selected);
      if (ids.has(id)) ids.delete(id);
      else ids.add(id);
      setSelected(ids);
      return;
    }
    if (!selected.has(id)) setSelected([id]);
    if (g.classList.contains('wire')) {
      startSegmentDrag(circuit.get(id), e, g);
      return;
    }

    const list = selectedNodes();
    const { touching, inside } = wiresAround(list);
    drag = {
      id: e.pointerId,
      start: board.screenToWorld(e.clientX, e.clientY),
      dx: 0,
      dy: 0,
      list,
      touching,
      inside,
      base: new Map(list.map((n) => [n.id, { x: n.x, y: n.y }])),
      orig: new Map(list.map((n) => [n.id, isPart(n) ? { x: n.x, y: n.y, rotation: n.rotation } : { x: n.x, y: n.y }])),
      viaBase: new Map(inside.map((w) => [w.id, w.via])),
      origVia: new Map(inside.map((w) => [w.id, w.via])),
      // A single part with no wires yet can be dropped into a wire.
      free: list.length === 1 && isPart(list[0]) && !touching.length ? list[0] : null,
      rot: list[0].rotation,
    };
    g.setPointerCapture(e.pointerId);
  });

  world.addEventListener('pointermove', (e) => {
    if (segDrag && e.pointerId === segDrag.id) {
      const { w, base, i, horiz, start } = segDrag;
      const p = board.screenToWorld(e.clientX, e.clientY);
      const d = snap(horiz ? p.y - start.y : p.x - start.x);
      if (d === segDrag.d) return;
      segDrag.d = d;
      w.via = simplify(moveSegment(base, i, horiz ? 0 : d, horiz ? d : 0)).slice(1, -1);
      drawWire(w);
      return;
    }
    if (!drag || e.pointerId !== drag.id) return;
    const p = board.screenToWorld(e.clientX, e.clientY);
    const dx = snap(p.x - drag.start.x);
    const dy = snap(p.y - drag.start.y);
    if (dx === drag.dx && dy === drag.dy) return;
    drag.dx = dx;
    drag.dy = dy;
    for (const n of drag.list) {
      const b = drag.base.get(n.id);
      n.x = b.x + dx;
      n.y = b.y + dy;
      place(n);
    }
    for (const w of drag.inside) {
      w.via = drag.viaBase.get(w.id).map((v) => ({ x: v.x + dx, y: v.y + dy }));
    }
    drag.touching.forEach(drawWire);
    if (drag.free) snapIntoWire();
    refreshNets();
  });

  const endDrag = (e) => {
    if (segDrag && e.pointerId === segDrag.id) segDrag = null;
    if (!drag || e.pointerId !== drag.id) return;
    const c = drag.free;
    drag = null;
    highlight(null);
    const spot = c && findSpot(c.type, c, c.rotation);
    if (spot) embed(c, spot);
  };
  world.addEventListener('pointerup', endDrag);
  world.addEventListener('pointercancel', endDrag);

  // Dragging on empty board draws a selection box; parts and joints it touches
  // are selected, along with wires between them. Shift adds to the selection.
  svg.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || board.spaceHeld) return;
    const keep = e.shiftKey ? new Set(selected) : new Set();
    setSelected(keep);
    const rect = svgEl('rect', 'marquee', world);
    marquee = { id: e.pointerId, start: board.screenToWorld(e.clientX, e.clientY), rect, keep };
    svg.setPointerCapture(e.pointerId);
  });

  svg.addEventListener('pointermove', (e) => {
    if (!marquee || e.pointerId !== marquee.id) return;
    const p = board.screenToWorld(e.clientX, e.clientY);
    const { start, rect, keep } = marquee;
    const box = {
      x1: Math.min(start.x, p.x),
      y1: Math.min(start.y, p.y),
      x2: Math.max(start.x, p.x),
      y2: Math.max(start.y, p.y),
    };
    rect.setAttribute('x', box.x1);
    rect.setAttribute('y', box.y1);
    rect.setAttribute('width', box.x2 - box.x1);
    rect.setAttribute('height', box.y2 - box.y1);
    const ids = new Set(keep);
    for (const n of [...circuit.components, ...circuit.joints]) if (touches(box, n)) ids.add(n.id);
    for (const w of circuit.wires) if (ids.has(endId(w.from)) && ids.has(endId(w.to))) ids.add(w.id);
    setSelected(ids);
  });

  const endBox = (e) => {
    if (marquee && e.pointerId === marquee.id) endMarquee();
  };
  svg.addEventListener('pointerup', endBox);
  svg.addEventListener('pointercancel', endBox);

  window.addEventListener('keydown', (e) => {
    if (fromControl(e)) return;
    if (e.metaKey || e.ctrlKey) {
      const key = e.key.toLowerCase();
      if (wiring) return;
      if (key === 'c' && copySelected()) e.preventDefault();
      else if (key === 'x' && cutSelected()) e.preventDefault();
      else if (key === 'd') {
        e.preventDefault(); // also keeps the browser from bookmarking
        duplicateSelected();
      } else if (key === 'v' && clipboard) {
        e.preventDefault();
        paste(pointerAt ?? nextTo(clipboard));
      }
      return;
    }
    if (wiring) {
      if (e.key === 'Escape' || e.key === 'Delete') {
        stopWire();
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        wiring.via.pop();
        drawDraft();
      }
      return;
    }
    if (e.key === 'r' || e.key === 'R') {
      rotateSelected();
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      deleteSelected();
    } else if (e.key === 'Escape') {
      if (drag) {
        cancelDrag();
      } else if (segDrag) {
        cancelSegmentDrag();
      } else if (marquee) {
        setSelected(marquee.keep);
        endMarquee();
      } else {
        setSelected([]);
      }
    }
  });

  // --- Current flow -----------------------------------------------------------
  // Dots travel along each wire in the direction of conventional current
  // (+ to −). Speed grows with the logarithm of the current, so microamps and
  // amps are both visible without either looking frozen or a blur.

  // wire id -> { target, speed (units/s along from → to), offset }
  const flows = new Map();

  // `smooth` as for showLive: on AC the dots ease between directions instead
  // of jittering at the frame rate.
  function setFlow(currents, smooth = false) {
    for (const w of circuit.wires) {
      const i = currents.get(w.id) ?? 0;
      const f = flows.get(w.id) ?? { offset: 0, speed: 0 };
      f.target = Math.abs(i) < FLOW_MIN ? 0 : Math.sign(i) * FLOW_SPEED * Math.log10(1 + Math.abs(i) / FLOW_REF);
      if (!smooth) f.speed = f.target;
      flows.set(w.id, f);
      nodes.get(w.id).classList.toggle('flowing', f.target !== 0 || Math.abs(f.speed) > 0.5);
    }
    for (const id of flows.keys()) if (!nodes.has(id)) flows.delete(id);
  }

  // Advance light and current-flow dots by `dt` seconds of real time.
  function animate(dt) {
    const k = 1 - Math.exp(-dt / PERSISTENCE);
    for (const [id, s] of glows) {
      if (s.shown === s.target) continue;
      s.shown = Math.abs(s.target - s.shown) < 1e-3 ? s.target : s.shown + (s.target - s.shown) * k;
      paintGlow(nodes.get(id), s.shown);
    }
    for (const [id, f] of flows) {
      f.speed += (f.target - f.speed) * k;
      if (Math.abs(f.speed) < 1e-3) continue;
      f.offset = (f.offset - f.speed * dt) % DOT_SPACING;
      nodes.get(id).lastElementChild.style.strokeDashoffset = f.offset;
    }
  }

  // --- Copy, cut, paste, duplicate -----------------------------------------
  // Copying takes the selected parts and joints, joints at the ends of selected
  // wires, and every wire running between them. Wires with an end outside that
  // set can't come along. Pasted parts are new parts: fresh reference numbers,
  // the same settings, undamaged. Duplicate copies and pastes in one go, just
  // beside the original, without touching the clipboard.

  let clipboard = null;
  let pointerAt = null; // world point under the pointer while it's over the board

  svg.addEventListener('pointermove', (e) => {
    pointerAt = board.screenToWorld(e.clientX, e.clientY);
  });
  svg.addEventListener('pointerleave', () => {
    pointerAt = null;
  });

  // A self-contained copy of the selection, or null if nothing can be copied.
  function snapshot() {
    const ids = new Set(selectedNodes().map((n) => n.id));
    for (const id of selected) {
      const w = circuit.get(id);
      if (w && isWire(w)) for (const end of [w.from, w.to]) if (end.joint) ids.add(end.joint);
    }
    const parts = circuit.components.filter((c) => ids.has(c.id));
    const joints = circuit.joints.filter((j) => ids.has(j.id));
    if (!parts.length && !joints.length) return null;
    const wires = circuit.wires.filter((w) => ids.has(endId(w.from)) && ids.has(endId(w.to)));
    const partIndex = new Map(parts.map((c, i) => [c.id, i]));
    const jointIndex = new Map(joints.map((j, i) => [j.id, i]));
    const ref = (end) => (end.joint ? { joint: jointIndex.get(end.joint) } : { part: partIndex.get(end.part), pin: end.pin });
    const all = [...parts, ...joints];
    return {
      parts: parts.map((c) => ({ type: c.type, x: c.x, y: c.y, rotation: c.rotation, props: structuredClone(c.props) })),
      joints: joints.map((j) => ({ x: j.x, y: j.y })),
      wires: wires.map((w) => ({ from: ref(w.from), to: ref(w.to), via: w.via.map((p) => ({ ...p })) })),
      center: {
        x: snap(all.reduce((s, n) => s + n.x, 0) / all.length),
        y: snap(all.reduce((s, n) => s + n.y, 0) / all.length),
      },
    };
  }

  function copySelected() {
    const copy = snapshot();
    if (copy) clipboard = copy;
    return !!copy;
  }

  function cutSelected() {
    if (!copySelected()) return false;
    deleteSelected();
    return true;
  }

  function duplicateSelected() {
    const copy = snapshot();
    if (copy) placeCopy(copy, nextTo(copy));
  }

  // Two grid steps down and right of where a copy was taken from.
  const nextTo = (copy) => ({ x: copy.center.x + 2 * GRID, y: copy.center.y + 2 * GRID });

  function paste(at) {
    if (clipboard) placeCopy(clipboard, at);
  }

  // Add a copy to the circuit centred on world point `at`, and select it.
  function placeCopy(copy, at) {
    const dx = snap(at.x) - copy.center.x;
    const dy = snap(at.y) - copy.center.y;
    const parts = copy.parts.map((p) => {
      const c = circuit.add(p.type, p.x + dx, p.y + dy, p.rotation);
      Object.assign(c.props, structuredClone(p.props));
      mountPart(c);
      return c;
    });
    const joints = copy.joints.map((j) => addJoint(j.x + dx, j.y + dy));
    const end = (e) => (e.joint !== undefined ? { joint: joints[e.joint].id } : { part: parts[e.part].id, pin: e.pin });
    for (const w of copy.wires) {
      addWire(circuit.connect(end(w.from), end(w.to), w.via.map((p) => ({ x: p.x + dx, y: p.y + dy }))));
    }
    tidyJoints();
    const ids = new Set([...parts, ...joints].map((n) => n.id).filter((id) => circuit.get(id)));
    for (const w of circuit.wires) if (ids.has(endId(w.from)) && ids.has(endId(w.to))) ids.add(w.id);
    setSelected(ids);
  }

  // Right-click: act on what's under the pointer (keeping the selection if it's
  // already part of it), or on nothing when on empty board.
  svg.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (wiring) stopWire();
    const g = e.target.closest?.('.part, .wire, .joint');
    if (!g) setSelected([]);
    else if (!selected.has(g.dataset.id)) setSelected([g.dataset.id]);
    onContextMenu(e.clientX, e.clientY, board.screenToWorld(e.clientX, e.clientY));
  });

  return {
    add,
    preview,
    clearPreview: () => highlight(null),
    refreshPart,
    showLive,
    burn,
    setFlow,
    animate,
    copy: copySelected,
    cut: cutSelected,
    paste,
    duplicate: duplicateSelected,
    deleteSelected,
    canCopy: () => !!snapshot(),
    canPaste: () => !!clipboard,
    hasSelection: () => selected.size > 0,
  };
}
