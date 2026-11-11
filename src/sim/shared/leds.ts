import type { Element, ModelDef, Result, Stamper } from '../models.ts';
import { diode, stampJunction } from './junctions.ts';
import { fmt } from './readout.ts';

// LEDs sharing a common pin: seven-segment displays, RGB LEDs, bar graphs.

// --- LED groups: seven-segment display, RGB LED ------------------------------
// Several LEDs between their own pins (0 .. n−1) and one common pin (n):
// anodes on their own pins for common cathode, the other way round for
// common anode. Each is linearised like the single LED, with its own forward
// voltage (`fv`) and the shared max current. `names` label them in readouts.
export type LedGroupProps = { common: 'cathode' | 'anode'; maxCurrent: number };

export function ledGroup<P extends LedGroupProps>(names: string[], fv: (p: P, k: number) => number): ModelDef<P> {
  const n = names.length;
  const junction = (p: P, k: number) => diode({ forwardVoltage: fv(p, k), maxCurrent: p.maxCurrent });
  // An LED's anode and cathode nodes.
  const ends = (el: Element<P>, k: number) => (el.props.common === 'cathode' ? [el.nodes[k], el.nodes[n]] : [el.nodes[n], el.nodes[k]]);
  const forward = (el: Element<P>, s: Stamper) =>
    names.map((_, k) => {
      const [a, c] = ends(el, k);
      return junction(el.props, k).current(s.v(a) - s.v(c));
    });
  // Forward current of each LED, from the current into its pin.
  const currents = (r: Result, p: P) => r.pins.slice(0, n).map((i) => Math.max(0, p.common === 'cathode' ? i : -i));
  const segments = (r: Result, p: P) => currents(r, p).map((i) => i / p.maxCurrent);
  return {
    nonlinear: true,
    stamp(el, s) {
      const segV = (el.state.segV ??= Array(n).fill(0));
      for (let k = 0; k < n; k++) {
        const [a, c] = ends(el, k);
        stampJunction(s, segV, k, a, c, junction(el.props, k));
      }
    },
    current: (el, s) => forward(el, s).reduce((sum, i) => sum + i, 0),
    pinCurrents(el, s) {
      const i = forward(el, s);
      const sign = el.props.common === 'cathode' ? 1 : -1;
      return [...i.map((x) => sign * x), -sign * i.reduce((sum, x) => sum + x, 0)];
    },
    segments,
    brightness: (r, p) => Math.max(0, ...segments(r, p)),
    readout: (r, p) => {
      const lit = currents(r, p).flatMap((i, k) => (i > p.maxCurrent * 0.01 ? [names[k]] : []));
      return [
        ['Lit', lit.join(' ') || 'none'],
        ['Current', fmt(currents(r, p).reduce((sum, i) => sum + i, 0), 'A')],
      ];
    },
    thermal: { load: (r, p) => Math.max(0, ...currents(r, p)) / p.maxCurrent, tau: 0.05, limit: 1.5 },
    failure: { label: 'burnt out', open: true },
  };
}
