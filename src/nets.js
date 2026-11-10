import { PARTS } from './components.js';
import { pinPos } from './wires.js';

// Every pin and joint is a connection point, keyed "c1:0" (part c1, pin 0) or
// by joint id. A net is a set of points that are electrically one node.
export const pinKey = (part, pin) => `${part}:${pin}`;
export const keyOf = (end) => end.joint ?? pinKey(end.part, end.pin);

// Points are joined by wires, and by sitting on the same grid point (pins
// touching pins or joints). Wires that merely cross do not connect.
// Returns { nets: [[key, ...], ...], netOf: Map(key -> index into nets),
// links: [[key, key], ...] pairs joined by touching rather than by a wire }.
export function buildNets(circuit) {
  const parent = new Map();
  const find = (k) => {
    if (!parent.has(k)) parent.set(k, k);
    let root = k;
    while (parent.get(root) !== root) root = parent.get(root);
    while (parent.get(k) !== root) {
      const next = parent.get(k);
      parent.set(k, root);
      k = next;
    }
    return root;
  };
  const union = (a, b) => parent.set(find(a), find(b));

  const at = new Map(); // "x,y" -> a point already there
  const links = [];
  const visit = (key, p) => {
    find(key);
    const spot = `${p.x},${p.y}`;
    if (at.has(spot)) {
      union(key, at.get(spot));
      links.push([key, at.get(spot)]);
    } else {
      at.set(spot, key);
    }
  };

  for (const c of circuit.components) {
    PARTS[c.type].pins.forEach((_, i) => visit(pinKey(c.id, i), pinPos(c, i)));
  }
  for (const j of circuit.joints) visit(j.id, j);
  for (const w of circuit.wires) union(keyOf(w.from), keyOf(w.to));

  const groups = new Map();
  for (const k of parent.keys()) {
    const root = find(k);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(k);
  }
  const nets = [...groups.values()];
  const netOf = new Map();
  nets.forEach((keys, n) => keys.forEach((k) => netOf.set(k, n)));
  return { nets, netOf, links };
}
