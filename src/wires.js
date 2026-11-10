import { snap } from './board.js';
import { PARTS } from './components.js';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// Rotate a local offset clockwise on screen by a multiple of 90°.
function turn(x, y, deg) {
  switch (deg) {
    case 90: return { x: -y, y: x };
    case 180: return { x: -x, y: -y };
    case 270: return { x: y, y: -x };
    default: return { x, y };
  }
}

// World position of pin `i` on part `c`.
export function pinPos(c, i) {
  const p = PARTS[c.type].pins[i];
  const o = turn(p.x, p.y, c.rotation);
  return { x: c.x + o.x, y: c.y + o.y };
}

// Whether the pin points left/right (true) or up/down (false) from its part.
export function pinHorizontal(c, i) {
  const p = PARTS[c.type].pins[i];
  const o = turn(p.x, p.y, c.rotation);
  return Math.abs(o.x) >= Math.abs(o.y);
}

// A wire end is a pin { part, pin } or a joint { joint }.
export const endId = (end) => end.part ?? end.joint;

export function endPos(circuit, end) {
  const n = circuit.get(endId(end));
  return end.joint ? { x: n.x, y: n.y } : pinPos(n, end.pin);
}

// Pins have a direction to leave along; joints don't.
export function endHorizontal(circuit, end) {
  return end.joint ? undefined : pinHorizontal(circuit.get(end.part), end.pin);
}

// Orthogonal polyline through `pts`: each leg that isn't straight gets one corner.
// The first leg leaves along `startH` and the last arrives along `endH` (when
// given); other legs go horizontal first.
export function route(pts, startH, endH) {
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    if (a.x !== b.x && a.y !== b.y) {
      const last = i === pts.length - 1;
      let hFirst = true;
      if (i === 1 && startH !== undefined) hFirst = startH;
      else if (last && endH !== undefined) hFirst = !endH;
      out.push(hFirst ? { x: b.x, y: a.y } : { x: a.x, y: b.y });
    }
    out.push(b);
  }
  return out;
}

export function wirePoints(circuit, w) {
  return route(
    [endPos(circuit, w.from), ...w.via, endPos(circuit, w.to)],
    endHorizontal(circuit, w.from),
    endHorizontal(circuit, w.to),
  );
}

// Closest grid point to `p` on an orthogonal path, as { i: segment index, at },
// or null if it is farther than `tol` from the path. Path corners sit on the
// grid, so snapping and clamping to a segment's span stays on that segment.
export function pointOnPath(pts, p, tol) {
  let best = null;
  let bestD = tol;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const q = {
      x: clamp(snap(p.x), Math.min(a.x, b.x), Math.max(a.x, b.x)),
      y: clamp(snap(p.y), Math.min(a.y, b.y), Math.max(a.y, b.y)),
    };
    const d = Math.hypot(q.x - p.x, q.y - p.y);
    if (d <= bestD) {
      bestD = d;
      best = { i, at: q };
    }
  }
  return best;
}

// Drop repeated points and "corners" that sit in a straight line.
export function simplify(pts) {
  const out = [];
  for (const p of pts) {
    const prev = out.at(-1);
    if (prev && prev.x === p.x && prev.y === p.y) continue;
    const before = out.at(-2);
    if (before && ((before.x === prev.x && prev.x === p.x) || (before.y === prev.y && prev.y === p.y))) {
      out.pop();
    }
    out.push(p);
  }
  return out;
}

// Shift segment `i` of a simplified orthogonal path by (dx, dy). Its neighbours
// stretch to follow; where the segment touches the path's fixed first or last
// point, a new step is added there instead of moving that point.
export function moveSegment(pts, i, dx, dy) {
  const shift = (p) => ({ x: p.x + dx, y: p.y + dy });
  const last = pts.length - 1;
  const out = [];
  pts.forEach((p, k) => {
    if (k !== i && k !== i + 1) out.push(p);
    else if (k === 0) out.push(p, shift(p));
    else if (k === last) out.push(shift(p), p);
    else out.push(shift(p));
  });
  return out;
}

export const toPoints =(pts) => pts.map((p) => `${p.x},${p.y}`).join(' ');
