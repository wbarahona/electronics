import { formatSI } from '../../units.ts';
import { inductorModel } from '../../sim/shared/coils.ts';
import type { ModelDefs } from '../../sim/models.ts';
import type { PartDefs } from '../defs.ts';
import { toleranceProps, type Tolerance } from '../tolerance.ts';

// The values each of these parts carries: what the properties panel edits
// and the simulator reads (gathered into PropsByType in src/types.ts).
export interface PartProps {
  inductor: { inductance: number; resistance: number; maxCurrent: number } & Tolerance;
}

export const defs: PartDefs<'inductor'> = {
  // IEC coil: four half-turns. `resistance` is the winding's own resistance.
  inductor: {
    name: 'Inductor',
    info: {
      summary: 'A coil that resists changes in current: passes DC, opposes AC more as the frequency rises, and kicks back when switched off.',
      about: {
        how: 'A coil of wire whose magnetic field stores energy. It resists any change in current: suddenly interrupted, it produces a high voltage spike.',
        sim: 'An inductance in series with its winding resistance; the current through it changes only gradually, and it heats with the current past its rating.',
        uses: 'Filters, chokes in power supplies, and storing energy in switching converters.',
      },
    },
    letter: 'R',
    us: { letter: 'L' },
    category: 'passive',
    group: 'Capacitors & inductors',
    pins: [{ x: -40, y: 0 }, { x: 40, y: 0 }],
    props: {
      inductance: { label: 'Inductance', unit: 'H', value: 10e-3, min: 1e-9 },
      resistance: { label: 'Winding resistance', unit: 'Ω', value: 1, min: 0 },
      maxCurrent: { label: 'Max current', unit: 'A', value: 1, min: 0.001 },
      ...toleranceProps(10),
    },
    tag: (p) => formatSI(p.inductance, 'H'),
    draw: () => `
      <path d="M -40 0 H -20 A 5 5 0 0 1 -10 0 A 5 5 0 0 1 0 0 A 5 5 0 0 1 10 0 A 5 5 0 0 1 20 0 H 40" />`,
  },
};

export const models: ModelDefs<'inductor'> = {
  // v = R·i + L·di/dt. Over a step: i = g·v + g·(L/dt)·i_prev with
  // g = 1/(R + L/dt), so its current carries on from the previous step.
  inductor: { ...inductorModel, tolerance: ['inductance'] },
};
