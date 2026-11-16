import { PARTS, defaults, usLetterOf } from './components.ts';
import type { End, Item, Joint, Part, PartType, Point, Wire } from './types.ts';

export type Circuit = ReturnType<typeof createCircuit>;

const endId = (end: End): string => end.part ?? end.joint;

// The ambient temperature a circuit starts with, °C; the temperature parts'
// ratings are given at.
export const AMBIENT = 25;

// `letter` with the lowest number that makes a reference not in `taken`.
export function freeRef(letter: string, taken: Iterable<string>, from = 1): string {
  const used = new Set(taken);
  let n = from;
  while (used.has(`${letter}${n}`)) n++;
  return `${letter}${n}`;
}

// The circuit as plain data: the source of truth the view draws and the simulator reads.
export function createCircuit() {
  let nextPart = 1;
  let nextWire = 1;
  let nextJoint = 1;
  const components: Part[] = [];
  const wires: Wire[] = [];
  const joints: Joint[] = [];

  return {
    components,
    wires,
    joints,
    // The temperature around the circuit, °C (25 unless set): every part that
    // heats up runs this much plus its own rise, and sensors like the NTC
    // feel it. Saved with the circuit.
    ambient: AMBIENT,

    // Each part gets a reference designation for each standard (see
    // src/norm.ts), from its class letter there and the lowest number not yet
    // taken by that letter: R1, R2, ...; freed numbers are reused.
    add(type: PartType, x: number, y: number, rotation = 0): Part {
      const c: Part = {
        id: `c${nextPart++}`,
        ref: freeRef(PARTS[type].letter, components.map((p) => p.ref)),
        usRef: freeRef(usLetterOf(type), components.map((p) => p.usRef)),
        type,
        x,
        y,
        rotation,
        props: defaults(type),
        broken: false,
      };
      components.push(c);
      return c;
    },

    // A joint is a grid point where wires meet.
    addJoint(x: number, y: number): Joint {
      const j = { id: `j${nextJoint++}`, x, y };
      joints.push(j);
      return j;
    },

    // A wire joins two ends, each a pin { part, pin } or a joint { joint },
    // through optional bend points.
    connect(from: End, to: End, via: Point[] = []): Wire {
      const w = { id: `w${nextWire++}`, from, to, via };
      wires.push(w);
      return w;
    },

    remove(id: string): void {
      for (const list of [components, wires, joints] as Item[][]) {
        const i = list.findIndex((x) => x.id === id);
        if (i >= 0) list.splice(i, 1);
      }
    },

    get(id: string): Item | undefined {
      return (
        components.find((c) => c.id === id) ??
        wires.find((w) => w.id === id) ??
        joints.find((j) => j.id === id)
      );
    },

    part(id: string): Part | undefined {
      return components.find((c) => c.id === id);
    },

    wire(id: string): Wire | undefined {
      return wires.find((w) => w.id === id);
    },

    joint(id: string): Joint | undefined {
      return joints.find((j) => j.id === id);
    },

    // Replace everything with the given items (e.g. a loaded file). New ids
    // carry on after the highest one loaded.
    load(parts: Part[], newJoints: Joint[], newWires: Wire[], ambient = AMBIENT): void {
      this.ambient = ambient;
      components.splice(0, components.length, ...parts);
      joints.splice(0, joints.length, ...newJoints);
      wires.splice(0, wires.length, ...newWires);
      const next = (items: { id: string }[]) => Math.max(0, ...items.map((x) => Number(x.id.slice(1)) || 0)) + 1;
      nextPart = next(components);
      nextJoint = next(joints);
      nextWire = next(wires);
    },

    // Wires attached to a part or joint.
    wiresOf(id: string): Wire[] {
      return wires.filter((w) => endId(w.from) === id || endId(w.to) === id);
    },
  };
}
