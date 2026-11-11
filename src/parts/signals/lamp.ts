import { basicReadout } from '../../sim/shared/readout.ts';
import { ohmic } from '../../sim/shared/resistance.ts';
import { formatSI } from '../../units.ts';
import type { ModelDef, ModelDefs, Result } from '../../sim/models.ts';
import type { PartDefs } from '../defs.ts';
import type { LampColor, PropsByType } from '../../types.ts';

// The values each of these parts carries: what the properties panel edits
// and the simulator reads (gathered into PropsByType in src/types.ts).
export interface PartProps {
  lamp: { color: LampColor; ratedVoltage: number; ratedPower: number };
  // A panel indicator (pilot) lamp: a lamp behind a coloured lens.
  pilot: { color: LampColor; ratedVoltage: number; ratedPower: number };
}

// A filament is too slow to follow AC, so it shines by average power.
const lampLight = (r: Result, p: { ratedPower: number }) => Math.abs(r.ac ? r.pavg : r.p) / p.ratedPower;

// A filament lamp: its hot resistance, V²/P at its rating.
const lampModel: ModelDef<PropsByType['lamp']> = {
  ...ohmic(
    (p) => p.ratedVoltage ** 2 / p.ratedPower,
    (r, p) => [...basicReadout(r), ['Brightness', `${Math.round(lampLight(r, p) * 100)} %`]],
  ),
  brightness: (r, p) => lampLight(r, p),
  thermal: { load: (r, p) => Math.abs(r.p) / p.ratedPower, tau: 0.3, limit: 1.5 },
  failure: { label: 'filament blown', open: true },
};

export const defs: PartDefs<'lamp' | 'pilot'> = {
  lamp: {
    name: 'Lamp',
    letter: 'E',
    category: 'signals',
    group: 'Lights',
    pins: [{ x: -40, y: 0 }, { x: 40, y: 0 }],
    props: {
      color: { label: 'Colour', value: 'warm', options: ['warm', 'red', 'yellow', 'green', 'blue', 'white'] },
      ratedVoltage: { label: 'Rated voltage', unit: 'V', value: 6, min: 0.001 },
      ratedPower: { label: 'Rated power', unit: 'W', value: 1, min: 0.001 },
    },
    tag: (p) => `${formatSI(p.ratedVoltage, 'V')} ${formatSI(p.ratedPower, 'W')}`,
    glow: { color: (p) => p.color, radius: 40 },
    draw: () => `
      <circle class="bulb" r="14" />
      <path d="M -40 0 H -14 M 14 0 H 40 M -10 -10 L 10 10 M 10 -10 L -10 10" />`,
  },
  // A panel indicator: the lamp behind a lens (the outer ring).
  pilot: {
    name: 'Pilot lamp',
    letter: 'P',
    category: 'signals',
    group: 'Indicators',
    pins: [{ x: -40, y: 0 }, { x: 40, y: 0 }],
    props: {
      color: { label: 'Lens colour', value: 'green', options: ['warm', 'red', 'yellow', 'green', 'blue', 'white'] },
      ratedVoltage: { label: 'Rated voltage', unit: 'V', value: 120, min: 0.001 },
      ratedPower: { label: 'Rated power', unit: 'W', value: 1, min: 0.001 },
    },
    tag: (p) => formatSI(p.ratedVoltage, 'V'),
    glow: { color: (p) => p.color, radius: 34 },
    draw: () => `
      <circle class="bulb tinted" r="14" />
      <circle r="18" />
      <path d="M -40 0 H -18 M 18 0 H 40 M -10 -10 L 10 10 M 10 -10 L -10 10" />`,
  },
};

export const models: ModelDefs<'lamp' | 'pilot'> = {
  // Filament treated as its hot resistance, V²/P at the rated values.
  lamp: lampModel,
  pilot: lampModel,
};
