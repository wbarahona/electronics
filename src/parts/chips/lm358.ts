import { chip } from '../symbols.ts';
import { fmt } from '../../sim/shared/readout.ts';
import type { Element, ModelDef, ModelDefs } from '../../sim/models.ts';
import type { PartDefs } from '../defs.ts';
import type { PropsByType } from '../../types.ts';

// The values each of these parts carries: what the properties panel edits
// and the simulator reads (gathered into PropsByType in src/types.ts).
export interface PartProps {
  lm358: { maxCurrent: number }; // dual op-amp
}

// --- LM358 op-amp ---------------------------------------------------------------

// Each amplifier drives its output toward A·(V+ − V−), smoothly limited
// (tanh) between GND and VCC − LM358_HEADROOM, through LM358_ROUT; the
// current comes from VCC when it sources and goes to GND when it sinks.
// Which of the two is settled between solves (el.state.outs: sourcing), from
// the current last solved, so it can't flip back and forth within one. Its
// currents are worked out from the same linearised output the solver used
// (el.state.segV: target, slope and input difference per amplifier): with
// so much gain, recomputing the tanh would magnify the solver's tolerance
// into visible errors.
// Inputs barely load. Pins (index = pin − 1): 1OUT 0, 1IN− 1, 1IN+ 2, GND 3,
// 2IN+ 4, 2IN− 5, 2OUT 6, VCC 7.
const LM358_GAIN = 1e5;

const LM358_ROUT = 50;

const LM358_HEADROOM = 1.5;

const LM358_G_IN = 1e-7; // S: input leakage (10 MΩ), also keeps unused inputs defined

const LM358_AMPS: [number, number, number][] = [
  [2, 1, 0],
  [4, 5, 6],
]; // [in+, in−, out]

function opampTarget(vp: number, vn: number, lo: number, hi: number) {
  const mid = (lo + hi) / 2;
  const half = Math.max(1e-3, (hi - lo) / 2);
  const t = Math.tanh((LM358_GAIN * (vp - vn)) / half);
  return { v: mid + half * t, slope: LM358_GAIN * (1 - t * t) };
}

const lm358Model: ModelDef<PropsByType['lm358']> = (() => {
  const [GND, VCC] = [3, 7];
  const g = 1 / LM358_ROUT;
  function currents(el: Element<PropsByType['lm358']>, v: (pin: number) => number): number[] {
    const i = el.nodes.map(() => 0);
    LM358_AMPS.forEach(([p, n, out], a) => {
      const lin = el.state.segV;
      const target = lin ? lin[3 * a] + lin[3 * a + 1] * (v(p) - v(n) - lin[3 * a + 2]) : opampTarget(v(p), v(n), v(GND), v(VCC) - LM358_HEADROOM).v;
      const amps = g * (target - v(out)); // into the output's net
      i[out] -= amps;
      i[(el.state.outs?.[a] ?? true) ? VCC : GND] += amps;
      for (const k of [p, n]) {
        i[k] += LM358_G_IN * (v(k) - v(GND));
        i[GND] -= LM358_G_IN * (v(k) - v(GND));
      }
    });
    return i;
  }
  return {
    nonlinear: true,
    stamp(el, s) {
      const n = el.nodes;
      const v = (k: number) => s.v(n[k]);
      LM358_AMPS.forEach(([p, m, out], a) => {
        s.conductance(n[p], n[GND], LM358_G_IN);
        s.conductance(n[m], n[GND], LM358_G_IN);
        const { v: target, slope } = opampTarget(v(p), v(m), v(GND), v(VCC) - LM358_HEADROOM);
        const lin = (el.state.segV ??= Array(6).fill(0));
        [lin[3 * a], lin[3 * a + 1], lin[3 * a + 2]] = [target, slope, v(p) - v(m)];
        // Linearised: amps into the output = g·(target + slope·(ΔV+ − ΔV−) − Vout).
        const i0 = g * (target - slope * (v(p) - v(m)));
        const supply = (el.state.outs?.[a] ?? true) ? n[VCC] : n[GND];
        s.draw(n[out], [[n[out], g], [n[p], -g * slope], [n[m], g * slope]], -i0);
        s.draw(supply, [[n[out], -g], [n[p], g * slope], [n[m], -g * slope]], i0);
      });
    },
    respond(el, _env, r) {
      const sourcing = LM358_AMPS.map(([, , out]) => r.pins[out] <= 0); // current leaving at the output
      const changed = sourcing.some((x, a) => x !== (el.state.outs?.[a] ?? true));
      el.state.outs = sourcing;
      return changed;
    },
    current: (el, s) => currents(el, (k) => s.v(el.nodes[k]))[VCC],
    pinCurrents: (el, s) => currents(el, (k) => s.v(el.nodes[k])),
    readout: (r) => [
      ['Output 1', fmt(r.pinV[0] - r.pinV[GND], 'V')],
      ['Output 2', fmt(r.pinV[6] - r.pinV[GND], 'V')],
      ['Supply', fmt(r.pinV[VCC] - r.pinV[GND], 'V')],
    ],
    thermal: { load: (r, p) => Math.max(Math.abs(r.pins[0]), Math.abs(r.pins[6])) / p.maxCurrent, tau: 0.2, limit: 1.5 },
    failure: { label: 'burnt out', open: true },
  };
})();

export const defs: PartDefs<'lm358'> = {
  // LM358: two op-amps on one supply (GND to VCC); outputs swing from GND up
  // to about VCC − 1.5 V.
  lm358: {
    name: 'LM358 op-amp',
    letter: 'K',
    category: 'chips',
    group: 'Op-amps',
    pins: [
      { x: 60, y: -20 }, { x: -60, y: -20 }, { x: -60, y: -40 }, { x: 0, y: 60 },
      { x: -60, y: 20 }, { x: -60, y: 40 }, { x: 60, y: 20 }, { x: 0, y: -60 },
    ],
    props: { maxCurrent: { label: 'Max output current', unit: 'A', value: 0.04, min: 0.001 } },
    tag: () => 'LM358',
    hit: { w: 120, h: 120 },
    labelAt: () => [44, -64, 'start'],
    draw: () =>
      chip({ w: 40, h: 50 }, '358', [
        ['1OUT', 1, 60, -20], ['1IN−', 2, -60, -20], ['1IN+', 3, -60, -40], ['GND', 4, 0, 60],
        ['2IN+', 5, -60, 20], ['2IN−', 6, -60, 40], ['2OUT', 7, 60, 20], ['VCC', 8, 0, -60],
      ]),
  },
};

export const models: ModelDefs<'lm358'> = {
  lm358: lm358Model,
};
