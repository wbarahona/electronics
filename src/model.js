import { PARTS, defaults } from './components.js';

// The circuit as plain data: the source of truth the view draws and the simulator reads.
export function createCircuit() {
  let nextPart = 1;
  let nextWire = 1;
  let nextJoint = 1;
  const components = [];
  const wires = [];
  const joints = [];

  return {
    components,
    wires,
    joints,

    // Each part gets a reference designation from its DIN letter code and the
    // lowest number not yet taken by that letter: R1, R2, ...; freed numbers
    // are reused.
    add(type, x, y, rotation = 0) {
      const { letter } = PARTS[type];
      const taken = new Set(components.filter((c) => c.ref[0] === letter).map((c) => Number(c.ref.slice(1))));
      let n = 1;
      while (taken.has(n)) n++;
      const c = {
        id: `c${nextPart++}`,
        ref: `${letter}${n}`,
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
    addJoint(x, y) {
      const j = { id: `j${nextJoint++}`, x, y };
      joints.push(j);
      return j;
    },

    // A wire joins two ends, each a pin { part, pin } or a joint { joint },
    // through optional bend points.
    connect(from, to, via = []) {
      const w = { id: `w${nextWire++}`, from, to, via };
      wires.push(w);
      return w;
    },

    remove(id) {
      for (const list of [components, wires, joints]) {
        const i = list.findIndex((x) => x.id === id);
        if (i >= 0) list.splice(i, 1);
      }
    },

    get(id) {
      return (
        components.find((c) => c.id === id) ??
        wires.find((w) => w.id === id) ??
        joints.find((j) => j.id === id)
      );
    },

    // Wires attached to a part or joint.
    wiresOf(id) {
      return wires.filter((w) => (w.from.part ?? w.from.joint) === id || (w.to.part ?? w.to.joint) === id);
    },
  };
}
