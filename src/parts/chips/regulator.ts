import { chip } from '../symbols.ts';
import { fmt } from '../../sim/shared/readout.ts';
import { formatNumber } from '../../units.ts';
import type { Element, ModelDef, ModelDefs } from '../../sim/models.ts';
import type { PartDefs } from '../defs.ts';
import type { PropsByType } from '../../types.ts';

// The values each of these parts carries: what the properties panel edits
// and the simulator reads (gathered into PropsByType in src/types.ts).
export interface PartProps {
  regulator: { outputVoltage: number; dropout: number; maxCurrent: number; powerRating: number };
}

// 78xx linear regulator. Pins: IN, GND, OUT. OUT is held at the set voltage
// above GND while IN is at least `dropout` higher; below that it follows IN
// minus the dropout. Which of the two it is in is decided from the previous
// Newton iteration (a piecewise-linear part). The current it delivers comes
// in at IN, so it dissipates (V_IN − V_OUT) × I.
const REG_G = 100; // S; output stiffness (0.01 Ω)

function regulator(): ModelDef<PropsByType['regulator']> {
  const [IN, GND, OUT] = [0, 1, 2];
  type P = PropsByType['regulator'];
  const mode = (p: P, vin: number, vgnd: number) => (vin - vgnd - p.dropout >= p.outputVoltage ? 'regulating' : 'dropout');
  // Current delivered out of OUT, given the pin voltages and the mode.
  const delivered = (p: P, m: string, vin: number, vgnd: number, vout: number) =>
    REG_G * ((m === 'regulating' ? vgnd + p.outputVoltage : vin - p.dropout) - vout);
  const currents = (el: Element<P>, v: (k: number) => number) => {
    const m = el.state.mode ?? mode(el.props, v(IN), v(GND));
    const i = delivered(el.props, m, v(IN), v(GND), v(OUT));
    return [i, 0, -i];
  };
  return {
    nonlinear: true,
    stamp(el, s) {
      const [nIn, nGnd, nOut] = el.nodes;
      const m = mode(el.props, s.v(nIn), s.v(nGnd));
      if (el.state.mode !== undefined && m !== el.state.mode) s.converged = false;
      el.state.mode = m;
      const g = REG_G;
      if (m === 'regulating') {
        // I = g·(Vgnd + Vset − Vout): drawn out of OUT, drawn into IN.
        s.draw(nOut, [[nOut, g], [nGnd, -g]], -g * el.props.outputVoltage);
        s.draw(nIn, [[nGnd, g], [nOut, -g]], g * el.props.outputVoltage);
      } else {
        // I = g·(Vin − drop − Vout)
        s.draw(nOut, [[nOut, g], [nIn, -g]], g * el.props.dropout);
        s.draw(nIn, [[nIn, g], [nOut, -g]], -g * el.props.dropout);
      }
      s.conductance(nIn, nGnd, 1e-9);
      s.conductance(nOut, nGnd, 1e-9);
    },
    current: (el, s) => currents(el, (k) => s.v(el.nodes[k]))[IN],
    pinCurrents: (el, s) => currents(el, (k) => s.v(el.nodes[k])),
    readout: (r) => [
      ['Input', fmt(r.pinV[IN] - r.pinV[GND], 'V')],
      ['Output', fmt(r.pinV[OUT] - r.pinV[GND], 'V')],
      ['State', r.state.mode === 'dropout' ? 'dropout (input too low)' : 'regulating'],
      ['Current', fmt(Math.abs(r.pins[OUT]), 'A')],
      ['Power', fmt(Math.abs(r.p), 'W')],
    ],
    thermal: { load: (r, p) => Math.max(Math.abs(r.pins[OUT]) / p.maxCurrent, Math.abs(r.p) / p.powerRating), tau: 3, limit: 1.5 },
    failure: { label: 'burnt out', open: true },
  };
}

export const defs: PartDefs<'regulator'> = {
  // Fixed linear voltage regulator, 78xx family (7805 by default).
  regulator: {
    name: 'Voltage regulator',
    letter: 'T',
    category: 'chips',
    group: 'Regulators',
    pins: [{ x: -40, y: 0 }, { x: 0, y: 40 }, { x: 40, y: 0 }], // 1 IN, 2 GND, 3 OUT
    props: {
      outputVoltage: { label: 'Output voltage', unit: 'V', value: 5, min: 1.25, max: 24 },
      dropout: { label: 'Dropout voltage', unit: 'V', value: 2, min: 0.1 },
      maxCurrent: { label: 'Max output current', unit: 'A', value: 1.5, min: 0.001 },
      powerRating: { label: 'Power rating', unit: 'W', value: 2, min: 0.01 },
    },
    tag: (p) => `78${String(Math.round(p.outputVoltage)).padStart(2, '0')}`,
    draw: (p) =>
      chip({ w: 32, h: 18 }, `${formatNumber(p.outputVoltage)} V`, [['IN', 1, -40, 0], ['GND', 2, 0, 40], ['OUT', 3, 40, 0]]),
  },
};

export const models: ModelDefs<'regulator'> = {
  regulator: regulator(),
};
