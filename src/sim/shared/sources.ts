import type { ModelDef, Thermal } from '../models.ts';

// Voltage sources with an internal resistance, and their overload.

// An ideal source of `volts(props, t)` in series with its internal resistance:
// a Norton equivalent when that resistance is non-zero, a true voltage source
// when it is zero.
export function source<P extends { internalResistance: number }>(
  volts: (p: P, t: number) => number,
): Pick<ModelDef<P>, 'branches' | 'stamp' | 'current'> {
  return {
    branches: (p) => (p.internalResistance > 0 ? 0 : 1),
    stamp(el, s) {
      const [a, b] = el.nodes;
      const v = volts(el.props, s.t);
      const r = el.props.internalResistance;
      if (r > 0) {
        s.conductance(a, b, 1 / r);
        s.current(a, b, -v / r);
      } else {
        s.voltage(a, b, el.branch, v);
      }
    },
    current(el, s) {
      const [a, b] = el.nodes;
      const r = el.props.internalResistance;
      return r > 0 ? (s.v(a) - s.v(b) - volts(el.props, s.t)) / r : s.x(el.branch);
    },
  };
}

export const sourceThermal: Thermal<{ maxCurrent: number }> = {
  load: (r, p) => Math.abs(r.i) / p.maxCurrent,
  tau: 1,
  limit: 1.5,
};
