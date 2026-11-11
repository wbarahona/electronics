import { chip } from '../symbols.ts';
import { fmt } from '../../sim/shared/readout.ts';
import type { Element, Lines, ModelDef, ModelDefs } from '../../sim/models.ts';
import type { PartDefs } from '../defs.ts';
import type { PropsByType } from '../../types.ts';

// The values each of these parts carries: what the properties panel edits
// and the simulator reads (gathered into PropsByType in src/types.ts).
export interface PartProps {
  // Chips, wired with their own supply pins like the real parts.
  ne555: { maxCurrent: number; maxSupply: number };
}

// --- Chips -------------------------------------------------------------------

// NE555, following the datasheet's block diagram. Pins (index = pin − 1):
// GND, TRIG, OUT, RESET, CTRL, THR, DIS, VCC. A 5k/10k divider holds CTRL at
// ⅔ VCC; the trigger comparator sets the flip-flop when TRIG falls below half
// of CTRL (⅓ VCC), the threshold comparator resets it when THR rises above
// CTRL, and RESET low forces it off. The output sits about 1.7 V below VCC
// when high and near GND when low; the discharge transistor shorts DIS to
// GND while the output is low. Like the gates, it updates one step after its
// inputs.
const T555_ROUT = 10; // Ω

const T555_RDIS = 10; // Ω, discharge transistor on

const T555_HIGH_DROP = 1.7; // V below VCC

const T555_LOW = 0.1; // V above GND

const T555_IQ_R = 3000; // Ω; ~3 mA quiescent at 9 V

const T555_LEAK = 1e-9; // S on the high-impedance inputs

function timer555(): ModelDef<PropsByType['ne555']> {
  const [GND, TRIG, OUT, RESET, CTRL, THR, DIS, VCC] = [0, 1, 2, 3, 4, 5, 6, 7];
  const g = 1 / T555_ROUT;
  // Current into each pin, consistent with stamp().
  function currents(el: Element<PropsByType['ne555']>, v: (pin: number) => number): number[] {
    const i = new Array<number>(8).fill(0);
    const flow = (a: number, b: number, amps: number) => {
      i[a] += amps;
      i[b] -= amps;
    };
    flow(VCC, CTRL, (v(VCC) - v(CTRL)) / 5000);
    flow(CTRL, GND, (v(CTRL) - v(GND)) / 10000);
    flow(VCC, GND, (v(VCC) - v(GND)) / T555_IQ_R);
    for (const k of [TRIG, THR, RESET]) flow(k, GND, T555_LEAK * (v(k) - v(GND)));
    flow(DIS, GND, (el.state.out ? T555_LEAK : 1 / T555_RDIS) * (v(DIS) - v(GND)));
    if (el.state.out) flow(VCC, OUT, g * (v(VCC) - T555_HIGH_DROP - v(OUT)));
    else flow(OUT, GND, g * (v(OUT) - v(GND) - T555_LOW));
    return i;
  }
  return {
    dynamic: true,
    stamp(el, s) {
      const n = el.nodes;
      s.conductance(n[VCC], n[CTRL], 1 / 5000);
      s.conductance(n[CTRL], n[GND], 1 / 10000);
      s.conductance(n[VCC], n[GND], 1 / T555_IQ_R);
      for (const k of [TRIG, THR, RESET]) s.conductance(n[k], n[GND], T555_LEAK);
      s.conductance(n[DIS], n[GND], el.state.out ? T555_LEAK : 1 / T555_RDIS);
      if (el.state.out) {
        // OUT pulled toward VCC − drop, fed from VCC.
        s.draw(n[OUT], [[n[OUT], g], [n[VCC], -g]], g * T555_HIGH_DROP);
        s.draw(n[VCC], [[n[OUT], -g], [n[VCC], g]], -g * T555_HIGH_DROP);
      } else {
        // OUT pulled toward GND + a little, sinking into GND.
        s.draw(n[OUT], [[n[OUT], g], [n[GND], -g]], -g * T555_LOW);
        s.draw(n[GND], [[n[OUT], -g], [n[GND], g]], g * T555_LOW);
      }
    },
    current: (el, s) => currents(el, (k) => s.v(el.nodes[k]))[GND],
    pinCurrents: (el, s) => currents(el, (k) => s.v(el.nodes[k])),
    respond(el, env, r) {
      const v = (k: number) => r.pinV[k] - r.pinV[GND];
      let q = el.state.out ?? false;
      if (v(RESET) < 0.7) q = false;
      else if (v(TRIG) < v(CTRL) / 2) q = true;
      else if (v(THR) > v(CTRL)) q = false;
      const changed = q !== (el.state.out ?? false);
      if (changed && q) {
        if (el.state.edgeAt !== undefined) el.state.period = env.time - el.state.edgeAt;
        el.state.edgeAt = env.time;
      }
      el.state.out = q;
      return changed;
    },
    readout: (r) => {
      const v = (k: number) => r.pinV[k] - r.pinV[GND];
      const lines: Lines = [
        ['Output', `${r.state.out ? 'high' : 'low'} (${fmt(v(OUT), 'V')})`],
        ['Supply', fmt(v(VCC), 'V')],
        ['Thresholds', `${fmt(v(CTRL) / 2, 'V')} / ${fmt(v(CTRL), 'V')}`],
        ['Output current', fmt(Math.abs(r.pins[OUT]), 'A')],
      ];
      if (r.state.period) lines.push(['Frequency', fmt(1 / r.state.period, 'Hz')]);
      return lines;
    },
    // Output current against its rating, or a supply beyond its maximum
    // (catastrophic: stress climbs steeply past it).
    thermal: {
      load: (r, p) => Math.max(Math.abs(r.pins[OUT]) / p.maxCurrent, ((r.pinV[VCC] - r.pinV[GND]) / p.maxSupply) ** 4),
      tau: 0.3,
      limit: 1.5,
    },
    failure: { label: 'destroyed', open: true },
  };
}

export const defs: PartDefs<'ne555'> = {
  // NE555 timer, pins in datasheet order 1–8.
  ne555: {
    name: '555 timer',
    letter: 'K',
    category: 'chips',
    group: 'Timers',
    pins: [
      { x: -20, y: 60 }, // 1 GND
      { x: -60, y: 20 }, // 2 TRIG
      { x: 60, y: 0 }, // 3 OUT
      { x: -20, y: -60 }, // 4 RESET
      { x: 20, y: 60 }, // 5 CTRL
      { x: -60, y: 0 }, // 6 THR
      { x: -60, y: -20 }, // 7 DIS
      { x: 20, y: -60 }, // 8 VCC
    ],
    props: {
      maxCurrent: { label: 'Max output current', unit: 'A', value: 0.2, min: 0.001 },
      maxSupply: { label: 'Max supply voltage', unit: 'V', value: 16, min: 1 },
    },
    tag: () => 'NE555',
    hit: { w: 80, h: 80 },
    labelAt: () => [44, -48, 'start'],
    draw: () =>
      chip({ w: 40, h: 40 }, '555', [
        ['GND', 1, -20, 60], ['TR', 2, -60, 20], ['Q', 3, 60, 0], ['R', 4, -20, -60],
        ['CV', 5, 20, 60], ['THR', 6, -60, 0], ['DIS', 7, -60, -20], ['VCC', 8, 20, -60],
      ]),
  },
};

export const models: ModelDefs<'ne555'> = {
  // A logic input only: barely loads the signal.
  ne555: timer555(),
};
