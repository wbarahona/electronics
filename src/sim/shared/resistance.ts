import type { Element, Lines, ModelDef, Result, Thermal } from '../models.ts';
import { basicReadout } from './readout.ts';

// Parts that are a resistance between two pins, and overheating by power.

export const R_SWITCH_ON = 1e-3;

// A plain resistance between the two pins; Infinity means an open circuit.
// `resistance(props, el)` may look at el.broken.
export function ohmic<P>(
  resistance: (p: P, el: Element<P>) => number,
  readout: (r: Result, p: P) => Lines = basicReadout,
): Pick<ModelDef<P>, 'stamp' | 'current' | 'readout'> {
  return {
    stamp(el, s) {
      const r = resistance(el.props, el);
      if (r !== Infinity) s.conductance(el.nodes[0], el.nodes[1], 1 / r);
    },
    current(el, s) {
      const r = resistance(el.props, el);
      return r === Infinity ? 0 : (s.v(el.nodes[0]) - s.v(el.nodes[1])) / r;
    },
    readout,
  };
}

export const powerThermal = <P extends { powerRating: number }>(tau: number, limit: number): Thermal<P> => ({
  load: (r, p) => Math.abs(r.p) / p.powerRating,
  tau,
  limit,
});
