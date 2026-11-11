import { pinsOf } from './components.ts';
import { netName } from './parts/sources/net-label.ts';
import type { Circuit } from './model.ts';
import type { End, Point } from './types.ts';
import { pinPos } from './wires.ts';

// Every pin and joint is a connection point, keyed "c1:0" (part c1, pin 0) or
// by joint id. A net is a set of points that are electrically one node.
export const pinKey = (part: string, pin: number | string): string => `${part}:${pin}`;
export const keyOf = (end: End): string => end.joint ?? pinKey(end.part, end.pin);

export interface Nets {
  nets: string[][]; // the keys in each net
  netOf: Map<string, number>; // key -> index into nets
  links: [string, string][]; // pairs joined by touching rather than by a wire
}

// Points are joined by wires, by sitting on the same grid point (pins
// touching pins or joints), and by net labels of the same name. Wires that
// merely cross do not connect.
export function buildNets(circuit: Circuit): Nets {
  const parent = new Map<string, string>();
  const find = (k: string): string => {
    if (!parent.has(k)) parent.set(k, k);
    let root = k;
    while (parent.get(root) !== root) root = parent.get(root)!;
    while (parent.get(k) !== root) {
      const next = parent.get(k)!;
      parent.set(k, root);
      k = next;
    }
    return root;
  };
  const union = (a: string, b: string) => parent.set(find(a), find(b));

  const at = new Map<string, string>(); // "x,y" -> a point already there
  const links: [string, string][] = [];
  const visit = (key: string, p: Point) => {
    find(key);
    const spot = `${p.x},${p.y}`;
    const there = at.get(spot);
    if (there !== undefined) {
      union(key, there);
      links.push([key, there]);
    } else {
      at.set(spot, key);
    }
  };

  for (const c of circuit.components) {
    pinsOf(c.type, c.props).forEach((_, i) => visit(pinKey(c.id, i), pinPos(c, i)));
  }
  for (const j of circuit.joints) visit(j.id, j);
  for (const w of circuit.wires) union(keyOf(w.from), keyOf(w.to));
  const labels = new Map<string, string>(); // net name -> the first label's pin
  for (const c of circuit.components) {
    if (c.type !== 'netLabel') continue;
    const name = netName(c.props as { name: string });
    if (!name) continue;
    const first = labels.get(name);
    if (first === undefined) labels.set(name, pinKey(c.id, 0));
    else union(pinKey(c.id, 0), first);
  }

  const groups = new Map<string, string[]>();
  for (const k of parent.keys()) {
    const root = find(k);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root)!.push(k);
  }
  const nets = [...groups.values()];
  const netOf = new Map<string, number>();
  nets.forEach((keys, n) => keys.forEach((k) => netOf.set(k, n)));
  return { nets, netOf, links };
}
