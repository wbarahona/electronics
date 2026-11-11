import { fmt } from '../../sim/shared/readout.ts';
import { formatSI } from '../../units.ts';
import type { Element, ModelDef, ModelDefs, Stamper } from '../../sim/models.ts';
import type { PartDefs } from '../defs.ts';

// The values each of these parts carries: what the properties panel edits
// and the simulator reads (gathered into PropsByType in src/types.ts).
export interface PartProps {
  // Supply rails: one terminal, held against the board's 0 V (Ground).
  rail: { voltage: number; maxCurrent: number };
  phase: { voltage: number; frequency: number; phase: number; maxCurrent: number }; // voltage is RMS
}

// Supply rails (one pin, against the board's 0 V): a bar with the voltage
// written over it.
const railSymbol = (text: string) => `
  <path d="M 0 20 V 0 M -12 0 H 12" />
  <text class="sym-text upright" y="-6" text-anchor="middle" data-y="-10">${text}</text>`;

// --- Rails -------------------------------------------------------------------

// A supply rail holds its net at `volts` against the board's 0 V through a
// tiny resistance, as Ground holds its net at 0 V. Its return is 0 V itself,
// so a circuit fed by rails needs a Ground for current to come back.
const G_RAIL = 1e6;

function rail<P extends { maxCurrent: number }>(
  volts: (p: P, t: number) => number,
): Pick<ModelDef<P>, 'grounded' | 'stamp' | 'current' | 'pinCurrents' | 'thermal' | 'failure'> {
  // Current supplied into the net.
  const out = (el: Element<P>, s: Stamper) => G_RAIL * (volts(el.props, s.t) - s.v(el.nodes[0]));
  return {
    grounded: true,
    stamp(el, s) {
      s.draw(el.nodes[0], [[el.nodes[0], G_RAIL]], -G_RAIL * volts(el.props, s.t));
    },
    current: out,
    pinCurrents: (el, s) => [-out(el, s)],
    // Its breaker trips on a sustained overload.
    thermal: { load: (r, p) => Math.abs(r.i) / p.maxCurrent, tau: 0.1, limit: 1.5 },
    failure: { label: 'tripped', open: true },
  };
}

export const defs: PartDefs<'rail' | 'phase'> = {
  // Supply rails, each held against the board's 0 V (Ground) like a supply
  // whose other terminal is grounded.
  rail: {
    name: '+V rail',
    letter: 'X',
    category: 'sources',
    group: 'Rails',
    pins: [{ x: 0, y: 20 }],
    props: {
      voltage: { label: 'Voltage', unit: 'V', value: 5, slider: { min: -30, max: 30, step: 0.1 } },
      maxCurrent: { label: 'Max current', unit: 'A', value: 3, min: 0.001 },
    },
    noLabel: true,
    draw: (p) => railSymbol(`${p.voltage >= 0 ? '+' : ''}${formatSI(p.voltage, 'V')}`),
  },
  // One phase of the mains (voltage as RMS), against neutral at 0 V.
  phase: {
    name: 'AC phase',
    letter: 'X',
    category: 'sources',
    group: 'Rails',
    pins: [{ x: 0, y: 20 }],
    props: {
      voltage: { label: 'Voltage (rms)', unit: 'V', value: 120, min: 0, slider: { min: 0, max: 400 } },
      frequency: { label: 'Frequency', unit: 'Hz', value: 50, min: 0.01, max: 1000 },
      phase: { label: 'Phase', unit: '°', value: 0, slider: { min: -180, max: 180 } },
      maxCurrent: { label: 'Breaker rating', unit: 'A', value: 16, min: 0.001 },
    },
    noLabel: true,
    draw: (p) => railSymbol(`L ${formatSI(p.voltage, 'V')}~ ${formatSI(p.frequency, 'Hz')}`),
  },
};

export const models: ModelDefs<'rail' | 'phase'> = {
  rail: {
    ...rail((p) => p.voltage),
    readout: (r) => [
      ['Voltage', fmt(r.v, 'V')],
      ['Current', fmt(r.i, 'A')],
      ['Power', fmt(r.v * r.i, 'W')],
    ],
  },
  // v(t) = Vrms·√2·sin(2πft + φ) against neutral (0 V).
  phase: {
    ...rail((p, t) => p.voltage * Math.SQRT2 * Math.sin(2 * Math.PI * p.frequency * t + (p.phase * Math.PI) / 180)),
    dynamic: true,
    alternating: true,
    maxStep: (p) => 1 / (20 * p.frequency),
    readout: (r, p) => [
      ['Voltage', `${fmt(r.vrms, 'V')} rms`],
      ['Current', `${fmt(r.irms, 'A')} rms`],
      ['Power', `${fmt(r.pavg === 0 ? 0 : -r.pavg, 'W')} avg`],
      ['Frequency', fmt(p.frequency, 'Hz')],
      ['Now', `${fmt(r.v, 'V')}, ${fmt(r.i, 'A')}`],
    ],
  },
};
