// How each part type behaves electrically.
//
// Every model works on an element `el` = { props, broken, nodes: [net of pin 0,
// net of pin 1], branch, state } and a stamper `s` (see engine.js) for the
// current time step:
//   stamp(el, s)    add the part's equations; called every Newton iteration
//   current(el, s)  current through the part from pin 0 to pin 1, once solved
//   branches(props) extra unknowns it needs (a voltage source's own current)
//   nonlinear       needs Newton iterations (diodes, transistors); its stamp
//                   sets s.converged = false while it is still limiting its step
//   dynamic         depends on time or on the previous step, so the circuit
//                   must keep being stepped (AC sources, capacitors, inductors)
//   accept(el, s)   commit per-step state once a time step has converged
//   readout(r, props)  [label, text] lines to show for a solved part
//   brightness(r, props)  light output for parts that glow: 0 dark, 1 at rating
//   maxStep(props)  longest time step that still follows the part (AC sources)
//
// Solved results `r` carry instantaneous v, i, p (pin 0 → pin 1), running
// averages vrms, irms, pavg, and `ac` when the circuit is time-dependent, in
// which case readouts show RMS and average values.
//   thermal         { load(r, props), tau, limit }: how hard the part is being
//                   driven (1 = at its rating), how fast it heats (s) and the
//                   heat at which it fails
//   failure         { label, open }: what a failed part has become; `open`
//                   parts conduct nothing, others handle `el.broken` themselves
//
// An AC generator, for instance, would be a voltage source whose value comes
// from s.t and is marked `dynamic`; a capacitor would stamp a companion model
// from s.dt and the voltage kept in el.state by accept().

import { formatSI } from '../units.js';

export const THERMAL_VOLTAGE = 0.025852; // kT/q at 27 °C
const R_SWITCH_ON = 1e-3;

// Values below a nanounit are GMIN leakage, not real readings.
const fmt = (v, unit) => formatSI(Math.abs(v) < 1e-9 ? 0 : v, unit);
const basicReadout = (r) =>
  r.ac
    ? [
        ['Voltage', `${fmt(r.vrms, 'V')} rms`],
        ['Current', `${fmt(r.irms, 'A')} rms`],
        ['Power', `${fmt(Math.abs(r.pavg), 'W')} avg`],
      ]
    : [
        ['Voltage', fmt(Math.abs(r.v), 'V')],
        ['Current', fmt(Math.abs(r.i), 'A')],
        ['Power', fmt(Math.abs(r.p), 'W')],
      ];

// A plain resistance between the two pins; Infinity means an open circuit.
// `resistance(props, el)` may look at el.broken.
function ohmic(resistance, readout = basicReadout) {
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

// A filament is too slow to follow AC, so it shines by average power.
const lampLight = (r, p) => Math.abs(r.ac ? r.pavg : r.p) / p.ratedPower;

// Shockley diode, I = Is·(e^(V/nVt) − 1), fitted so it passes exactly
// `maxCurrent` at `forwardVoltage`.
const LED_IDEALITY = 2;

function diode(props) {
  const nVt = LED_IDEALITY * THERMAL_VOLTAGE;
  const is = props.maxCurrent / Math.expm1(props.forwardVoltage / nVt);
  const vcrit = nVt * Math.log(nVt / (Math.SQRT2 * is));
  const current = (v) => is * Math.expm1(Math.min(v / nVt, 80));
  return { nVt, is, vcrit, current };
}

// SPICE's junction voltage limiting: stops Newton from jumping so far up the
// exponential that it overflows or oscillates.
function limitJunction(vnew, vold, nVt, vcrit) {
  if (vnew > vcrit && Math.abs(vnew - vold) > 2 * nVt) {
    if (vold > 0) {
      const arg = 1 + (vnew - vold) / nVt;
      return arg > 0 ? vold + nVt * Math.log(arg) : vcrit;
    }
    return nVt * Math.log(vnew / nVt);
  }
  return vnew;
}

// An ideal source of `volts(props, t)` in series with its internal resistance:
// a Norton equivalent when that resistance is non-zero, a true voltage source
// when it is zero.
function source(volts) {
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

const sourceThermal = { load: (r, p) => Math.abs(r.i) / p.maxCurrent, tau: 1, limit: 1.5 };

export const MODELS = {
  battery: {
    ...source((p) => p.voltage),
    // Current out of the + terminal, power delivered to the circuit.
    readout: (r) =>
      r.ac
        ? [
            ['Voltage', fmt(r.v, 'V')],
            ['Current', `${fmt(r.irms, 'A')} rms`],
            ['Power', `${fmt(-r.pavg, 'W')} avg`],
          ]
        : [
            ['Voltage', fmt(r.v, 'V')],
            ['Current', fmt(-r.i, 'A')],
            ['Power', fmt(-r.p, 'W')],
          ],
    thermal: sourceThermal,
    failure: { label: 'damaged', open: true },
  },

  // v(t) = Vrms·√2·sin(2πft + φ). Steps must stay well inside one period.
  generator: {
    ...source((p, t) => p.voltage * Math.SQRT2 * Math.sin(2 * Math.PI * p.frequency * t + (p.phase * Math.PI) / 180)),
    dynamic: true,
    maxStep: (p) => 1 / (20 * p.frequency),
    readout: (r, p) => [
      ['Voltage', `${fmt(r.vrms, 'V')} rms`],
      ['Current', `${fmt(r.irms, 'A')} rms`],
      ['Power', `${fmt(-r.pavg, 'W')} avg`],
      ['Frequency', fmt(p.frequency, 'Hz')],
      ['Now', `${fmt(r.v, 'V')}, ${fmt(-r.i, 'A')}`],
    ],
    thermal: sourceThermal,
    failure: { label: 'damaged', open: true },
  },

  resistor: {
    ...ohmic((p) => p.resistance),
    thermal: { load: (r, p) => Math.abs(r.p) / p.powerRating, tau: 2, limit: 2 },
    failure: { label: 'burnt out', open: true },
  },

  // Filament treated as its hot resistance, V²/P at the rated values.
  lamp: {
    ...ohmic(
      (p) => p.ratedVoltage ** 2 / p.ratedPower,
      (r, p) => [...basicReadout(r), ['Brightness', `${Math.round(lampLight(r, p) * 100)} %`]],
    ),
    brightness: (r, p) => lampLight(r, p),
    thermal: { load: (r, p) => Math.abs(r.p) / p.ratedPower, tau: 0.3, limit: 1.5 },
    failure: { label: 'filament blown', open: true },
  },

  // Overloaded contacts weld shut: a failed switch conducts whatever its setting.
  switch: {
    ...ohmic((p, el) => (p.closed || el.broken ? R_SWITCH_ON : Infinity)),
    thermal: { load: (r, p) => Math.abs(r.i) / p.maxCurrent, tau: 0.2, limit: 1.5 },
    failure: { label: 'contacts welded', open: false },
  },

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

// A push button is electrically a switch that is only closed while held.
MODELS.button = MODELS.switch;
