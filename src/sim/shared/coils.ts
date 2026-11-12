import type { Element, ModelDef, Stamper } from '../models.ts';
import { basicReadout, fmt } from './readout.ts';

// Coils: inductance with resistance, and the levels a relay-like coil pulls
// in and drops out at.

// A relay-like coil pulls in at PULL_IN of its rated voltage (or current)
// and, once in, holds until it falls below DROP_OUT, so it doesn't chatter
// at the threshold.
export const PULL_IN = 0.75;
export const DROP_OUT = 0.4;

// --- Inductive coils ---------------------------------------------------------
// v = R·i + L·di/dt, as a companion model over each step (see inductor).
export function coil<P>(r: (p: P) => number, l: (p: P) => number): Pick<ModelDef<P>, 'dynamic' | 'stamp' | 'current' | 'accept'> {
  const parts = (el: Element<P>, s: Stamper) => {
    const k = l(el.props) / s.dt;
    return { k, g: 1 / (r(el.props) + k) };
  };
  return {
    dynamic: true,
    stamp(el, s) {
      const { k, g } = parts(el, s);
      s.conductance(el.nodes[0], el.nodes[1], g);
      s.current(el.nodes[0], el.nodes[1], g * k * (el.state.i ?? 0));
    },
    current(el, s) {
      const { k, g } = parts(el, s);
      return g * (s.v(el.nodes[0]) - s.v(el.nodes[1])) + g * k * (el.state.i ?? 0);
    },
    accept(el, s) {
      el.state.i = this.current(el, s);
    },
  };
}

export const inductorModel: ModelDef<{ inductance: number; resistance: number; maxCurrent: number }> = {
  ...coil((p) => p.resistance, (p) => p.inductance),
  readout: (r, p) => [...basicReadout(r), ['Energy', fmt(0.5 * p.inductance * r.i * r.i, 'J')]],
  thermal: { load: (r, p) => Math.abs(r.i) / p.maxCurrent, tau: 1, limit: 1.5 },
  failure: { label: 'burnt out', open: true },
};
