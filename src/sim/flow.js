import { keyOf, pinKey } from '../nets.js';
import { wirePoints } from '../wires.js';
import { solve } from './linear.js';

// Pins or joints that touch directly are joined almost perfectly.
const LINK_CONDUCTANCE = 1e3;

// Current along every wire, from the solved part currents.
//
// The simulator treats each net as one node, so it never learns how current
// travels through the wires inside a net. Here each net is solved on its own:
// parts push current in and out at their pins, and every wire is given a
// resistance proportional to its length, which decides how current shares
// between parallel wires. Returns Map(wire id -> amps, positive from w.from
// towards w.to).
export function wireCurrents(circuit, nets, results) {
  const edges = circuit.wires.map((w) => {
    const pts = wirePoints(circuit, w);
    let length = 0;
    for (let k = 1; k < pts.length; k++) {
      length += Math.abs(pts[k].x - pts[k - 1].x) + Math.abs(pts[k].y - pts[k - 1].y);
    }
    return { a: keyOf(w.from), b: keyOf(w.to), g: 1 / Math.max(length, 1), wire: w.id };
  });
  for (const [a, b] of nets.links) edges.push({ a, b, g: LINK_CONDUCTANCE });

  // Current a part's current i (pin 0 → pin 1 through it) feeds into each net.
  const inflow = new Map();
  const add = (key, i) => inflow.set(key, (inflow.get(key) ?? 0) + i);
  for (const c of circuit.components) {
    const r = results.get(c.id);
    if (!r) continue;
    add(pinKey(c.id, 0), -r.i);
    add(pinKey(c.id, 1), r.i);
  }

  const byNet = new Map();
  for (const e of edges) {
    const n = nets.netOf.get(e.a);
    if (!byNet.has(n)) byNet.set(n, []);
    byNet.get(n).push(e);
  }

  const currents = new Map();
  for (const [n, netEdges] of byNet) {
    // Node potentials within the net, with its first point as the reference.
    const keys = nets.nets[n];
    const index = new Map(keys.slice(1).map((k, i) => [k, i]));
    const size = index.size;
    const A = Array.from({ length: size }, () => new Float64Array(size));
    const b = new Float64Array(size);
    for (const e of netEdges) {
      const i = index.get(e.a);
      const j = index.get(e.b);
      if (i !== undefined) A[i][i] += e.g;
      if (j !== undefined) A[j][j] += e.g;
      if (i !== undefined && j !== undefined) {
        A[i][j] -= e.g;
        A[j][i] -= e.g;
      }
    }
    for (const [k, i] of index) b[i] = inflow.get(k) ?? 0;
    const phi = size ? solve(A, b) : new Float64Array(0);
    if (!phi) continue;
    const at = (k) => (index.has(k) ? phi[index.get(k)] : 0);
    for (const e of netEdges) if (e.wire) currents.set(e.wire, e.g * (at(e.a) - at(e.b)));
  }
  return currents;
}
