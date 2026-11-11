import type { Element, Lines, ModelDef, PartState, Stamper } from '../models.ts';
import { fmt } from './readout.ts';

// Logic levels and outputs, and the template for CMOS chips with their own
// supply pins.

// --- Logic --------------------------------------------------------------------
// Logic parts run on a built-in supply referenced to 0 V. Inputs barely load
// the signal (a weak pull-down: an unconnected input reads 0) and read 1 above
// HIGH_LEVEL of the supply, 0 below LOW_LEVEL, keeping their last level in
// between (hysteresis, so slow or noisy edges don't chatter). Outputs are a
// source of 0 V or the supply behind a small resistance, so they drive real
// loads. A gate reads its inputs after each step and switches for the next,
// a one-step delay that lets latches and ring oscillators behave.
export const G_LOGIC_IN = 1e-6; // S (1 MΩ pull-down)

export const G_LOGIC_OUT = 1 / 25; // S (25 Ω output)

export const HIGH_LEVEL = 0.55;

export const LOW_LEVEL = 0.45;

// The output pin draws G·(V − target) from its net.
export function driveOutput(s: Stamper, node: number, target: number) {
  s.draw(node, [[node, G_LOGIC_OUT]], -G_LOGIC_OUT * target);
}

// --- CMOS logic chips -----------------------------------------------------------
// CD4000-series logic with its own supply pins: inputs read high above 55 %
// of the supply and low below 45 % (holding their last level in between),
// barely loading; each output is a switch to VDD or VSS through `rOut`, so
// what it sources or sinks really comes from the supply. `logic` turns the
// input levels (and the part's state) into the output levels. The first
// response after a rebuild only records the inputs, so a clock edge isn't
// seen at power-up.
export function cmos<P extends { maxCurrent: number }>(pins: {
  vdd: number;
  vss: number;
  inputs: number[];
  outputs: number[];
  rOut: number;
  logic: (state: PartState, ins: boolean[], was: boolean[] | undefined) => boolean[];
  readout: (state: PartState) => Lines;
}): ModelDef<P> {
  const { vdd, vss, inputs, outputs, rOut } = pins;
  const g = 1 / rOut;
  function currents(el: Element<P>, v: (pin: number) => number): number[] {
    const i = el.nodes.map(() => 0);
    const flow = (a: number, b: number, amps: number) => {
      i[a] += amps;
      i[b] -= amps;
    };
    for (const k of inputs) flow(k, vss, G_LOGIC_IN * (v(k) - v(vss)));
    outputs.forEach((k, o) => {
      const to = el.state.outs?.[o] ? vdd : vss;
      flow(k, to, g * (v(k) - v(to)));
    });
    return i;
  }
  return {
    dynamic: true,
    stamp(el, s) {
      for (const k of inputs) s.conductance(el.nodes[k], el.nodes[vss], G_LOGIC_IN);
      outputs.forEach((k, o) => s.conductance(el.nodes[k], el.nodes[el.state.outs?.[o] ? vdd : vss], g));
    },
    current: (el, s) => currents(el, (k) => s.v(el.nodes[k]))[vdd],
    pinCurrents: (el, s) => currents(el, (k) => s.v(el.nodes[k])),
    respond(el, _env, r) {
      const supply = r.pinV[vdd] - r.pinV[vss];
      const was = el.state.ins;
      const ins = inputs.map((k, n) => {
        const v = r.pinV[k] - r.pinV[vss];
        return v > supply * HIGH_LEVEL ? true : v < supply * LOW_LEVEL ? false : (was?.[n] ?? false);
      });
      el.state.ins = ins;
      const outs = supply > 1 ? pins.logic(el.state, ins, was) : outputs.map(() => false);
      const changed = outs.some((o, k) => o !== (el.state.outs?.[k] ?? false));
      el.state.outs = outs;
      return changed;
    },
    readout: (r) => [...pins.readout(r.state), ['Supply', fmt(r.pinV[vdd] - r.pinV[vss], 'V')]],
    thermal: {
      load: (r, p) => Math.max(...outputs.map((k) => Math.abs(r.pins[k]))) / p.maxCurrent,
      tau: 0.2,
      limit: 1.5,
    },
    failure: { label: 'burnt out', open: true },
  };
}
