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
  thermal: { load: (r, p) => Math.abs(r.p) / p.ratedPower, tau: 0.3, limit: 1.5, rise: 120 }, // °C at its rating: the bulb
  failure: { label: 'filament blown', open: true },
};

// A pilot light's lens colour as NEMA letters it (C: clear).
const LENS_LETTER = { warm: 'C', red: 'R', yellow: 'Y', green: 'G', blue: 'B', white: 'W' };

export const defs: PartDefs<'lamp' | 'pilot'> = {
  lamp: {
    name: 'Lamp',
    letter: 'E',
    us: {
      letter: 'DS',
      draw: () => `
        <circle class="bulb" r="14" />
        <path d="M -40 0 H -6 A 6 6 0 0 1 6 0 H 40" />`,
    },
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
    // US (NEMA pilot light): rays around the lens, its colour's letter inside.
    us: {
      letter: 'DS',
      draw: (p) => `
      <circle class="bulb tinted" r="12" />
      <path d="M -40 0 H -12 M 12 0 H 40 M 10 -10 L 14 -14 M 10 10 L 14 14 M -10 -10 L -14 -14 M -10 10 L -14 14" />
      <text class="sym-text upright" y="3.5" text-anchor="middle">${LENS_LETTER[p.color]}</text>`,
    },
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
