import { basicReadout } from '../../sim/shared/readout.ts';
import { diode, limitJunction } from '../../sim/shared/junctions.ts';
import type { ModelDefs } from '../../sim/models.ts';
import type { PartDefs } from '../defs.ts';
import type { LedColor } from '../../types.ts';

// The values each of these parts carries: what the properties panel edits
// and the simulator reads (gathered into PropsByType in src/types.ts).
export interface PartProps {
  led: { color: LedColor; forwardVoltage: number; maxCurrent: number };
}

export const defs: PartDefs<'led'> = {
  led: {
    name: 'LED',
    letter: 'P',
    category: 'signals',
    group: 'Lights',
    pins: [{ x: -40, y: 0 }, { x: 40, y: 0 }], // anode, cathode
    props: {
      color: { label: 'Colour', value: 'red', options: ['red', 'yellow', 'green', 'blue', 'white'] },
      forwardVoltage: { label: 'Forward voltage', unit: 'V', value: 2, min: 0.1 },
      maxCurrent: { label: 'Max current', unit: 'A', value: 0.02, min: 0.0001 },
    },
    glow: { color: (p) => p.color, radius: 30 },
    draw: () => `
      <path class="bulb tinted" d="M -10 -10 V 10 L 10 0 Z" />
      <path d="M -40 0 H 40 M 10 -10 V 10" />
      <path d="M -2 -14 L 6 -22 M 1 -22 H 6 V -17 M 6 -12 L 14 -20 M 9 -20 H 14 V -15" />`,
  },
};

export const models: ModelDefs<'led'> = {
  led: {
    nonlinear: true,
    stamp(el, s) {
      const [a, b] = el.nodes;
      const d = diode(el.props);
      const v = s.v(a) - s.v(b);
      const vd = limitJunction(v, el.state.vd ?? 0, d.nVt, d.vcrit);
      if (Math.abs(vd - v) > 1e-6) s.converged = false;
      el.state.vd = vd;
      // Linearise around vd: I ≈ gd·v + (id − gd·vd).
      const id = d.current(vd);
      const gd = (d.is * Math.exp(Math.min(vd / d.nVt, 80))) / d.nVt;
      s.conductance(a, b, gd);
      s.current(a, b, id - gd * vd);
    },
    current(el, s) {
      return diode(el.props).current(s.v(el.nodes[0]) - s.v(el.nodes[1]));
    },
    // Light output roughly follows forward current.
    brightness: (r, p) => Math.max(0, r.i) / p.maxCurrent,
    // On AC the instantaneous current swings, so judge by its RMS.
    readout: (r, p) => {
      const i = r.ac ? r.irms : r.i;
      let status = 'off';
      if (i > p.maxCurrent * 1.1) status = 'over max current!';
      else if (i > p.maxCurrent * 0.01) status = 'on';
      return [...basicReadout(r), ['State', status]];
    },
    thermal: { load: (r, p) => Math.max(0, r.i) / p.maxCurrent, tau: 0.05, limit: 1.5 },
    failure: { label: 'burnt out', open: true },
  },
};
