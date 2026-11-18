import { pinsOf } from './components.ts';
import { netName } from './parts/sources/net-label.ts';
import type { Circuit } from './model.ts';
import { flatten } from './modules.ts';
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
// merely cross do not connect. Inside each module block (see flatten in
// src/modules.ts) its own copy of the parts connects the same way, but only
// among themselves: grid points and net label names are the block's own, so
// two copies never join except through their pins.
export function buildNets(circuit: Circuit): Nets {
  const flat = flatten(circuit);
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

  const at = new Map<string, string>(); // "x,y" (in a block: "c12/x,y") -> a point already there
  const links: [string, string][] = [];
  const visit = (key: string, p: Point, space: string) => {
    find(key);
    const spot = `${space}${p.x},${p.y}`;
    const there = at.get(spot);
    if (there !== undefined) {
      union(key, there);
      if (!space) links.push([key, there]); // (the board's own; a block's are drawn inside it)
    } else {
      at.set(spot, key);
    }
  };

  for (const { part: c, space } of flat.parts) {
    pinsOf(c.type, c.props).forEach((_, i) => visit(pinKey(c.id, i), pinPos(c, i), space));
  }
  for (const j of flat.joints) visit(j.key, j.at, j.space);
  for (const [a, b] of [...flat.wires, ...flat.ports]) union(a, b);
  const labels = new Map<string, string>(); // net name (in a block: "c12/name") -> the first label's pin
  for (const { part: c, space } of flat.parts) {
    if (c.type !== 'netLabel') continue;
    const local = netName(c.props as { name: string });
    if (!local) continue;
    const name = space + local;
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
