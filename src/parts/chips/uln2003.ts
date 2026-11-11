import { chip, type ChipPin } from '../symbols.ts';
import { diode, stampJunction } from '../../sim/shared/junctions.ts';
import { fmt } from '../../sim/shared/readout.ts';
import type { Element, ModelDef, ModelDefs } from '../../sim/models.ts';
import type { PartDefs } from '../defs.ts';
import type { PropsByType } from '../../types.ts';

// The values each of these parts carries: what the properties panel edits
// and the simulator reads (gathered into PropsByType in src/types.ts).
export interface PartProps {
  uln2003: { maxCurrent: number }; // seven Darlington sink drivers
}

// --- ULN2003 Darlington array -----------------------------------------------------

// Pins (index = pin − 1): IN1–IN7 0–6, GND 7, COM 8, OUT7–OUT1 9–15. An input
// is a resistance to GND; above ULN_ON (to GND) its channel turns on, below
// ULN_OFF off. A channel that is on sinks its output to GND like a junction
// dropping about 1 V at its rating (the Darlington's saturation); every
// output has a flyback diode up to COM.
const ULN_R_IN = 10.5e3;

const ULN_ON = 1.6;

const ULN_OFF = 1.2;

const ulnOut = (ch: number) => 15 - ch; // OUT1 is pin 16

const uln2003Model: ModelDef<PropsByType['uln2003']> = (() => {
  const [GND, COM] = [7, 8];
  const sink = (p: PropsByType['uln2003']) => diode({ forwardVoltage: 1, maxCurrent: p.maxCurrent });
  const flyback = diode({ forwardVoltage: 0.8, maxCurrent: 0.5 });
  function currents(el: Element<PropsByType['uln2003']>, v: (pin: number) => number): number[] {
    const i = el.nodes.map(() => 0);
    const flow = (a: number, b: number, amps: number) => {
      i[a] += amps;
      i[b] -= amps;
    };
    for (let ch = 0; ch < 7; ch++) {
      const out = ulnOut(ch);
      flow(ch, GND, (v(ch) - v(GND)) / ULN_R_IN);
      if (el.state.outs?.[ch]) flow(out, GND, sink(el.props).current(v(out) - v(GND)));
      flow(out, COM, flyback.current(v(out) - v(COM)));
    }
    return i;
  }
  return {
    nonlinear: true,
    dynamic: true,
    stamp(el, s) {
      const n = el.nodes;
      const vs = (el.state.segV ??= Array(14).fill(0));
      for (let ch = 0; ch < 7; ch++) {
        const out = ulnOut(ch);
        s.conductance(n[ch], n[GND], 1 / ULN_R_IN);
        if (el.state.outs?.[ch]) stampJunction(s, vs, ch, n[out], n[GND], sink(el.props));
        stampJunction(s, vs, 7 + ch, n[out], n[COM], flyback);
      }
    },
    current: (el, s) => currents(el, (k) => s.v(el.nodes[k]))[GND],
    pinCurrents: (el, s) => currents(el, (k) => s.v(el.nodes[k])),
    respond(el, _env, r) {
      const outs = Array.from({ length: 7 }, (_, ch) => {
        const v = r.pinV[ch] - r.pinV[GND];
        return v > ULN_ON ? true : v < ULN_OFF ? false : (el.state.outs?.[ch] ?? false);
      });
      const changed = outs.some((o, k) => o !== (el.state.outs?.[k] ?? false));
      el.state.outs = outs;
      return changed;
    },
    readout: (r) => [
      ['On', (r.state.outs ?? []).flatMap((o, ch) => (o ? [`${ch + 1}`] : [])).join(', ') || 'none'],
      ['Sinking', fmt(Math.abs(r.pins[GND]), 'A')],
    ],
    thermal: {
      load: (r, p) => Math.max(...Array.from({ length: 7 }, (_, ch) => Math.abs(r.pins[ulnOut(ch)]))) / p.maxCurrent,
      tau: 0.2,
      limit: 1.5,
    },
    failure: { label: 'burnt out', open: true },
  };
})();

export const defs: PartDefs<'uln2003'> = {
  // ULN2003: seven Darlington sinks. A high input (pins 1–7) pulls its output
  // (16–10) down to GND; each output has a flyback diode to COM (pin 9).
  uln2003: {
    name: 'ULN2003 driver',
    letter: 'K',
    category: 'chips',
    group: 'Drivers',
    pins: [
      ...Array.from({ length: 7 }, (_, k) => ({ x: -60, y: -60 + 20 * k })),
      { x: 0, y: 80 },
      { x: 0, y: -80 },
      ...Array.from({ length: 7 }, (_, k) => ({ x: 60, y: 60 - 20 * k })),
    ],
    props: { maxCurrent: { label: 'Max output current', unit: 'A', value: 0.5, min: 0.001 } },
    tag: () => 'ULN2003',
    hit: { w: 120, h: 160 },
    labelAt: () => [44, -84, 'start'],
    draw: () =>
      chip({ w: 40, h: 70 }, '2003', [
        ...Array.from({ length: 7 }, (_, k): ChipPin => [`IN${k + 1}`, k + 1, -60, -60 + 20 * k]),
        ['GND', 8, 0, 80],
        ['COM', 9, 0, -80],
        ...Array.from({ length: 7 }, (_, k): ChipPin => [`OUT${7 - k}`, 10 + k, 60, 60 - 20 * k]),
      ]),
  },
};

export const models: ModelDefs<'uln2003'> = {
  uln2003: uln2003Model,
};
