import { fmt } from '../../sim/shared/readout.ts';
import { formatNumber } from '../../units.ts';
import type { Element, ModelDef, ModelDefs, Stamper } from '../../sim/models.ts';
import type { PartDefs } from '../defs.ts';
import type { PropsByType } from '../../types.ts';

// The values each of these parts carries: what the properties panel edits
// and the simulator reads (gathered into PropsByType in src/types.ts).
export interface PartProps {
  // `ratio` is primary turns : secondary turns (2 steps down by half).
  // Inductance and resistance are the primary's; the secondary's follow
  // from the ratio. Max current is the secondary's.
  transformer: { ratio: number; inductance: number; coupling: number; resistance: number; maxCurrent: number };
}

// Transformer: two coupled inductors. With winding currents i = [i1, i2] and
// voltages v = [v1, v2] (v1 = V(pin 1) − V(pin 2), v2 = V(pin 3) − V(pin 4)):
//   v = R·i + L·di/dt,  L = [[L1, M], [M, L2]],  M = k·√(L1·L2)
// Over a backward-Euler step: v = Z·i − (L/dt)·i_prev with Z = R + L/dt, so
//   i = Y·v + Y·(L/dt)·i_prev,  Y = Z⁻¹.
// L2 = L1 / n² and R2 = R1 / n² for turns ratio n. Only changing current is
// coupled across, so DC on the primary just heats it.
function transformer(): ModelDef<PropsByType['transformer']> {
  type P = PropsByType['transformer'];
  function step(p: P, dt: number, i1: number, i2: number) {
    const l1 = p.inductance;
    const l2 = p.inductance / (p.ratio * p.ratio);
    const m = p.coupling * Math.sqrt(l1 * l2);
    const r1 = p.resistance;
    const r2 = p.resistance / (p.ratio * p.ratio);
    const [z11, z12, z22] = [r1 + l1 / dt, m / dt, r2 + l2 / dt];
    const det = z11 * z22 - z12 * z12;
    const y = { 11: z22 / det, 12: -z12 / det, 22: z11 / det };
    // Y·(L/dt)·i_prev
    const h1 = (l1 * i1 + m * i2) / dt;
    const h2 = (m * i1 + l2 * i2) / dt;
    return { y, c1: y[11] * h1 + y[12] * h2, c2: y[12] * h1 + y[22] * h2 };
  }
  const currents = (el: Element<P>, s: Stamper) => {
    const [a, b, c, d] = el.nodes;
    const t = step(el.props, s.dt, el.state.i1 ?? 0, el.state.i2 ?? 0);
    const v1 = s.v(a) - s.v(b);
    const v2 = s.v(c) - s.v(d);
    return [t.y[11] * v1 + t.y[12] * v2 + t.c1, t.y[12] * v1 + t.y[22] * v2 + t.c2];
  };
  return {
    dynamic: true,
    groups: [[0, 1], [2, 3]],
    stamp(el, s) {
      const [a, b, c, d] = el.nodes;
      const { y, c1, c2 } = step(el.props, s.dt, el.state.i1 ?? 0, el.state.i2 ?? 0);
      // Each winding draws its current in at its first pin and returns it at the second.
      const terms = (g1: number, g2: number): [number, number][] => [[a, g1], [b, -g1], [c, g2], [d, -g2]];
      const neg = (t: [number, number][]) => t.map(([n, g]): [number, number] => [n, -g]);
      const w1 = terms(y[11], y[12]);
      const w2 = terms(y[12], y[22]);
      s.draw(a, w1, c1);
      s.draw(b, neg(w1), -c1);
      s.draw(c, w2, c2);
      s.draw(d, neg(w2), -c2);
    },
    current: (el, s) => currents(el, s)[0],
    pinCurrents(el, s) {
      const [i1, i2] = currents(el, s);
      return [i1, -i1, i2, -i2];
    },
    accept(el, s) {
      [el.state.i1, el.state.i2] = currents(el, s);
    },
    // Secondary voltage and current, for their RMS.
    extras: (r) => [r.pinV[2] - r.pinV[3], r.pins[2]],
    readout: (r, p) => {
      const v2 = r.pinV[2] - r.pinV[3];
      return r.ac
        ? [
            ['Primary', `${fmt(r.vrms, 'V')} rms, ${fmt(r.irms, 'A')}`],
            ['Secondary', `${fmt(r.extraRms[0], 'V')} rms, ${fmt(r.extraRms[1], 'A')}`],
            ['Ratio', p.ratio >= 1 ? `${+p.ratio.toPrecision(3)} : 1` : `1 : ${+(1 / p.ratio).toPrecision(3)}`],
          ]
        : [
            ['Primary', `${fmt(r.v, 'V')}, ${fmt(r.i, 'A')}`],
            ['Secondary', `${fmt(v2, 'V')}, ${fmt(r.pins[2], 'A')}`],
          ];
    },
    // The heavier-loaded winding, against its rating (the primary's is the
    // secondary's divided by the ratio).
    thermal: {
      load: (r, p) => Math.max(Math.abs(r.pins[2]), Math.abs(r.pins[0]) * p.ratio) / p.maxCurrent,
      tau: 2,
      limit: 1.5,
    },
    failure: { label: 'burnt out', open: true },
  };
}

export const defs: PartDefs<'transformer'> = {
  // Two coupled windings on an iron core (DIN EN 60617 winding form). Pins:
  // primary 1 (dotted) and 2 on the left, secondary 3 (dotted) and 4 on the
  // right. The windings are isolated from each other.
  transformer: {
    name: 'Transformer',
    letter: 'T',
    category: 'passive',
    group: 'Transformers',
    pins: [{ x: -40, y: -20 }, { x: -40, y: 20 }, { x: 40, y: -20 }, { x: 40, y: 20 }],
    props: {
      ratio: { label: 'Turns ratio (primary : secondary)', unit: ': 1', value: 2, min: 0.01, max: 100 },
      inductance: { label: 'Primary inductance', unit: 'H', value: 1, min: 1e-6 },
      coupling: { label: 'Coupling', unit: '', value: 0.99, min: 0.1, max: 0.999 },
      resistance: { label: 'Primary winding resistance', unit: 'Ω', value: 1, min: 0.001 },
      maxCurrent: { label: 'Max secondary current', unit: 'A', value: 1, min: 0.001 },
    },
    tag: (p) => (p.ratio >= 1 ? `${formatNumber(p.ratio)}:1` : `1:${formatNumber(1 / p.ratio)}`),
    draw: () => `
      <path d="M -40 -20 H -12 M -40 20 H -12 M 40 -20 H 12 M 40 20 H 12" />
      <path d="M -12 -20 A 5 5 0 0 1 -12 -10 A 5 5 0 0 1 -12 0 A 5 5 0 0 1 -12 10 A 5 5 0 0 1 -12 20" />
      <path d="M 12 -20 A 5 5 0 0 0 12 -10 A 5 5 0 0 0 12 0 A 5 5 0 0 0 12 10 A 5 5 0 0 0 12 20" />
      <path d="M -2 -22 V 22 M 2 -22 V 22" />
      <circle class="dot" cx="-20" cy="-13" r="2" />
      <circle class="dot" cx="20" cy="-13" r="2" />`,
  },
};

export const models: ModelDefs<'transformer'> = {
  transformer: transformer(),
};
