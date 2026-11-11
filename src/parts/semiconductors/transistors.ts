import { fmt } from '../../sim/shared/readout.ts';
import { limitJunction, THERMAL_VOLTAGE } from '../../sim/shared/junctions.ts';
import type { Element, ModelDef, ModelDefs, Stamper } from '../../sim/models.ts';
import type { LabelSpot, PartDefs } from '../defs.ts';
import type { PropsByType } from '../../types.ts';

// The values each of these parts carries: what the properties panel edits
// and the simulator reads (gathered into PropsByType in src/types.ts).
export interface PartProps {
  npn: { gain: number; maxCurrent: number; powerRating: number };
  pnp: { gain: number; maxCurrent: number; powerRating: number };
  // On-resistance is at a gate–source voltage of 10 V.
  nmos: { thresholdVoltage: number; onResistance: number; maxCurrent: number; powerRating: number };
}

// Transistors: base/gate on the left, the other two leads leave up and down,
// so the label goes beside the envelope (or below it when turned).
const transistorLabel = (vertical: boolean): LabelSpot => (vertical ? [0, 54, 'middle'] : [32, 4, 'start']);

// Bipolar transistor, Ebers–Moll transport model. Pins: base, collector,
// emitter. `sign` is +1 for NPN, −1 for PNP (every voltage and current flips).
const BJT_IS = 1e-14;

const BJT_BETA_R = 1;

function bjt(sign: 1 | -1): ModelDef<PropsByType['npn']> {
  const vt = THERMAL_VOLTAGE;
  const vcrit = vt * Math.log(vt / (Math.SQRT2 * BJT_IS));
  const ex = (u: number) => Math.exp(Math.min(u / vt, 80));
  // Currents into collector and base (in the NPN frame) and their slopes.
  function solve(vbe: number, vbc: number, beta: number) {
    const ef = ex(vbe);
    const er = ex(vbc);
    const iF = BJT_IS * (ef - 1);
    const iR = BJT_IS * (er - 1);
    const gf = (BJT_IS * ef) / vt;
    const gr = (BJT_IS * er) / vt;
    return {
      ic: iF - iR - iR / BJT_BETA_R,
      ib: iF / beta + iR / BJT_BETA_R,
      dIcBe: gf,
      dIcBc: -gr * (1 + 1 / BJT_BETA_R),
      dIbBe: gf / beta,
      dIbBc: gr / BJT_BETA_R,
    };
  }
  const pinCurrents = (el: Element<PropsByType['npn']>, s: Stamper) => {
    const [b, c, e] = el.nodes;
    const j = solve(sign * (s.v(b) - s.v(e)), sign * (s.v(b) - s.v(c)), el.props.gain);
    const ib = sign * j.ib;
    const ic = sign * j.ic;
    return [ib, ic, -ib - ic];
  };
  return {
    nonlinear: true,
    stamp(el, s) {
      const [b, c, e] = el.nodes;
      const rawBe = sign * (s.v(b) - s.v(e));
      const rawBc = sign * (s.v(b) - s.v(c));
      const vbe = limitJunction(rawBe, el.state.vbe ?? 0, vt, vcrit);
      const vbc = limitJunction(rawBc, el.state.vbc ?? 0, vt, vcrit);
      if (Math.abs(vbe - rawBe) > 1e-6 || Math.abs(vbc - rawBc) > 1e-6) s.converged = false;
      el.state.vbe = vbe;
      el.state.vbc = vbc;
      const j = solve(vbe, vbc, el.props.gain);
      // Linearised: I = dBe·(Vb − Ve) + dBc·(Vb − Vc) + sign·(I0 − dBe·vbe − dBc·vbc).
      const terms = (dBe: number, dBc: number): [number, number][] => [[b, dBe + dBc], [e, -dBe], [c, -dBc]];
      const i0c = sign * (j.ic - j.dIcBe * vbe - j.dIcBc * vbc);
      const i0b = sign * (j.ib - j.dIbBe * vbe - j.dIbBc * vbc);
      s.draw(c, terms(j.dIcBe, j.dIcBc), i0c);
      s.draw(b, terms(j.dIbBe, j.dIbBc), i0b);
      s.draw(e, terms(-j.dIcBe - j.dIbBe, -j.dIcBc - j.dIbBc), -i0c - i0b);
      s.conductance(b, e, 1e-12);
      s.conductance(b, c, 1e-12);
    },
    current: (el, s) => pinCurrents(el, s)[0],
    pinCurrents,
    readout: (r) => {
      const [ib, ic] = r.pins.map((x) => sign * x);
      const vce = sign * (r.pinV[1] - r.pinV[2]);
      const vbe = sign * (r.pinV[0] - r.pinV[2]);
      let region = 'off';
      if (ic > 1e-6) region = vce < 0.2 ? 'saturated' : 'active';
      return [
        ['Collector current', fmt(Math.abs(r.pins[1]), 'A')],
        ['Base current', fmt(Math.abs(r.pins[0]), 'A')],
        ['V CE', fmt(Math.abs(vce), 'V')],
        ['V BE', fmt(Math.abs(vbe), 'V')],
        ['Gain now', ib > 1e-9 ? (ic / ib).toFixed(0) : '–'],
        ['Region', region],
        ['Power', fmt(Math.abs(r.p), 'W')],
      ];
    },
    thermal: {
      load: (r, p) => Math.max(Math.abs(r.p) / p.powerRating, Math.abs(r.pins[1]) / p.maxCurrent),
      tau: 0.5,
      limit: 1.5,
    },
    failure: { label: 'burnt out', open: true },
  };
}

// N-channel enhancement MOSFET, square-law model. Pins: gate, drain, source.
// k comes from the on-resistance at Vgs = 10 V; the channel works either way
// round, so drain and source swap when Vds goes negative.
const MOS_LAMBDA = 0.01; // 1/V, channel-length modulation

const MOS_STEP = 1; // V; largest change per Newton iteration

function mosfet(): ModelDef<PropsByType['nmos']> {
  const k = (p: PropsByType['nmos']) => 1 / (p.onResistance * Math.max(0.1, 10 - p.thresholdVoltage));
  // Drain current for vds ≥ 0 and its slopes.
  function channel(vgs: number, vds: number, p: PropsByType['nmos']) {
    const vov = vgs - p.thresholdVoltage;
    if (vov <= 0) return { id: 0, gm: 0, gds: 0 };
    const kk = k(p);
    const clm = 1 + MOS_LAMBDA * vds;
    if (vds < vov) {
      const id = kk * (vov * vds - (vds * vds) / 2) * clm;
      return { id, gm: kk * vds * clm, gds: kk * (vov - vds) * clm + kk * (vov * vds - (vds * vds) / 2) * MOS_LAMBDA };
    }
    const id = (kk / 2) * vov * vov * clm;
    return { id, gm: kk * vov * clm, gds: (kk / 2) * vov * vov * MOS_LAMBDA };
  }
  const step = (vnew: number, vold: number) =>
    Math.abs(vnew - vold) > MOS_STEP ? vold + Math.sign(vnew - vold) * MOS_STEP : vnew;
  // Which pins act as drain and source right now.
  const orient = (el: Element<PropsByType['nmos']>, v: (n: number) => number) => {
    const [g, d, src] = el.nodes;
    return v(d) >= v(src) ? { g, d, src, flip: false } : { g, d: src, src: d, flip: true };
  };
  const pinCurrents = (el: Element<PropsByType['nmos']>, s: Stamper) => {
    const o = orient(el, s.v);
    const id = channel(s.v(o.g) - s.v(o.src), s.v(o.d) - s.v(o.src), el.props).id;
    return o.flip ? [0, -id, id] : [0, id, -id];
  };
  return {
    nonlinear: true,
    stamp(el, s) {
      const o = orient(el, s.v);
      const rawGs = s.v(o.g) - s.v(o.src);
      const rawDs = s.v(o.d) - s.v(o.src);
      const vgs = step(rawGs, el.state.vgs ?? rawGs);
      const vds = step(rawDs, el.state.vds ?? rawDs);
      if (vgs !== rawGs || vds !== rawDs) s.converged = false;
      el.state.vgs = vgs;
      el.state.vds = vds;
      const c = channel(vgs, vds, el.props);
      // I(d→s) = gm·(Vg − Vs) + gds·(Vd − Vs) + (Id − gm·vgs − gds·vds)
      const i0 = c.id - c.gm * vgs - c.gds * vds;
      s.draw(o.d, [[o.g, c.gm], [o.d, c.gds], [o.src, -c.gm - c.gds]], i0);
      s.draw(o.src, [[o.g, -c.gm], [o.d, -c.gds], [o.src, c.gm + c.gds]], -i0);
      s.conductance(o.d, o.src, 1e-12);
      s.conductance(o.g, o.src, 1e-12);
    },
    current: (el, s) => pinCurrents(el, s)[1],
    pinCurrents,
    readout: (r, p) => {
      const vgs = r.pinV[0] - r.pinV[2];
      const vds = r.pinV[1] - r.pinV[2];
      const vov = vgs - p.thresholdVoltage;
      let region = 'off';
      if (vov > 0) region = Math.abs(vds) < vov ? 'on (linear)' : 'on (saturated)';
      return [
        ['Drain current', fmt(Math.abs(r.pins[1]), 'A')],
        ['V GS', fmt(vgs, 'V')],
        ['V DS', fmt(vds, 'V')],
        ['Region', region],
        ['Power', fmt(Math.abs(r.p), 'W')],
      ];
    },
    thermal: {
      load: (r, p) => Math.max(Math.abs(r.p) / p.powerRating, Math.abs(r.pins[1]) / p.maxCurrent),
      tau: 0.5,
      limit: 1.5,
    },
    failure: { label: 'burnt out', open: true },
  };
}

export const defs: PartDefs<'npn' | 'pnp' | 'nmos'> = {
  // Pins: base, collector, emitter. The emitter arrow points out of an NPN.
  npn: {
    name: 'NPN transistor',
    letter: 'K',
    category: 'semiconductors',
    group: 'Transistors',
    pins: [{ x: -40, y: 0 }, { x: 20, y: -40 }, { x: 20, y: 40 }],
    props: {
      gain: { label: 'Current gain (hFE)', unit: '', value: 100, min: 1 },
      maxCurrent: { label: 'Max collector current', unit: 'A', value: 0.5, min: 0.001 },
      powerRating: { label: 'Power rating', unit: 'W', value: 0.5, min: 0.001 },
    },
    labelAt: transistorLabel,
    draw: () => `
      <circle r="24" cx="4" />
      <path d="M -40 0 H -8 M -8 -14 V 14 M -8 -6 L 20 -22 V -40 M -8 6 L 20 22 V 40" />
      <path class="fill" d="M 18 21 L 7.5 19.5 L 11.5 13 Z" />`,
  },
  // Pins: base, collector, emitter; collector at the bottom, emitter on top
  // (the usual way up for a PNP), the emitter arrow pointing in.
  pnp: {
    name: 'PNP transistor',
    letter: 'K',
    category: 'semiconductors',
    group: 'Transistors',
    pins: [{ x: -40, y: 0 }, { x: 20, y: 40 }, { x: 20, y: -40 }],
    props: {
      gain: { label: 'Current gain (hFE)', unit: '', value: 100, min: 1 },
      maxCurrent: { label: 'Max collector current', unit: 'A', value: 0.5, min: 0.001 },
      powerRating: { label: 'Power rating', unit: 'W', value: 0.5, min: 0.001 },
    },
    labelAt: transistorLabel,
    draw: () => `
      <circle r="24" cx="4" />
      <path d="M -40 0 H -8 M -8 -14 V 14 M -8 -6 L 20 -22 V -40 M -8 6 L 20 22 V 40" />
      <path class="fill" d="M -6 -7 L 4.5 -8 L 1 -14.5 Z" />`,
  },
  // N-channel enhancement MOSFET. Pins: gate, drain, source. The broken
  // channel line marks enhancement mode; the arrow points into the channel.
  nmos: {
    name: 'N-MOSFET',
    letter: 'K',
    category: 'semiconductors',
    group: 'Transistors',
    pins: [{ x: -40, y: 0 }, { x: 20, y: -40 }, { x: 20, y: 40 }],
    props: {
      thresholdVoltage: { label: 'Threshold voltage', unit: 'V', value: 2, min: 0.1 },
      onResistance: { label: 'On-resistance (Vgs 10 V)', unit: 'Ω', value: 2, min: 0.001 },
      maxCurrent: { label: 'Max drain current', unit: 'A', value: 0.5, min: 0.001 },
      powerRating: { label: 'Power rating', unit: 'W', value: 0.4, min: 0.001 },
    },
    labelAt: transistorLabel,
    draw: () => `
      <circle r="24" cx="4" />
      <path d="M -40 0 H -10 M -10 -12 V 12" />
      <path class="thick" d="M -4 -14 V -6 M -4 -4 V 4 M -4 6 V 14" />
      <path d="M -4 -10 H 20 V -40 M -4 10 H 20 V 40 M 6 0 H 20 V 10" />
      <path class="fill" d="M -2 0 L 6 -4 V 4 Z" />`,
  },
};

export const models: ModelDefs<'npn' | 'pnp' | 'nmos'> = {
  npn: bjt(1),
  pnp: bjt(-1),
  nmos: mosfet(),
};
