import { fmt } from '../../sim/shared/readout.ts';
import { source, sourceThermal } from '../../sim/shared/sources.ts';
import { formatSI } from '../../units.ts';
import type { ModelDefs } from '../../sim/models.ts';
import type { PartDefs } from '../defs.ts';

// The values each of these parts carries: what the properties panel edits
// and the simulator reads (gathered into PropsByType in src/types.ts).
export interface PartProps {
  generator: { voltage: number; frequency: number; phase: number; internalResistance: number; maxCurrent: number };
}

export const defs: PartDefs<'generator'> = {
  // Sine-wave source. Voltage is given as RMS (230 V~ style); pin 0 is the
  // terminal that goes positive first.
  generator: {
    name: 'AC generator',
    letter: 'G',
    category: 'sources',
    pins: [{ x: -40, y: 0 }, { x: 40, y: 0 }],
    props: {
      voltage: { label: 'Voltage (rms)', unit: 'V', value: 12, min: 0 },
      frequency: { label: 'Frequency', unit: 'Hz', value: 50, min: 0.01, max: 1000 },
      phase: { label: 'Phase', unit: '°', value: 0 },
      internalResistance: { label: 'Internal resistance', unit: 'Ω', value: 0.5, min: 0 },
      maxCurrent: { label: 'Max current', unit: 'A', value: 1, min: 0.001 },
    },
    tag: (p) => `${formatSI(p.voltage, 'V')}~ ${formatSI(p.frequency, 'Hz')}`,
    draw: () => `
      <path d="M -40 0 H -16 M 16 0 H 40" />
      <circle r="16" />
      <path class="upright" d="M -10 0 C -7 -10 -3 -10 0 0 S 7 10 10 0" />`,
  },
};

export const models: ModelDefs<'generator'> = {
  // v(t) = Vrms·√2·sin(2πft + φ). Steps must stay well inside one period.
  generator: {
    ...source((p, t) => p.voltage * Math.SQRT2 * Math.sin(2 * Math.PI * p.frequency * t + (p.phase * Math.PI) / 180)),
    dynamic: true,
    alternating: true,
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
};
