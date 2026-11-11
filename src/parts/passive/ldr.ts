import { basicReadout, fmt, pct } from '../../sim/shared/readout.ts';
import { ohmic, powerThermal } from '../../sim/shared/resistance.ts';
import type { ModelDefs } from '../../sim/models.ts';
import type { PartDefs } from '../defs.ts';
import type { PropsByType } from '../../types.ts';

// The values each of these parts carries: what the properties panel edits
// and the simulator reads (gathered into PropsByType in src/types.ts).
export interface PartProps {
  ldr: { darkResistance: number; lightResistance: number; ambient: number; powerRating: number };
}

// a wiper or setting at its very end still has a little resistance
const LDR_TAU = 0.05; // s; LDRs follow light with a short lag

// An LDR's resistance falls from dark to bright on a log scale as light
// (0..1) rises.
const ldrResistance = (p: PropsByType['ldr'], light: number) =>
  p.darkResistance * (p.lightResistance / p.darkResistance) ** Math.min(1, Math.max(0, light));

export const defs: PartDefs<'ldr'> = {
  // Light-dependent resistor: two arrows of incoming light.
  ldr: {
    name: 'LDR',
    letter: 'R',
    category: 'passive',
    group: 'Sensors',
    pins: [{ x: -40, y: 0 }, { x: 40, y: 0 }],
    props: {
      darkResistance: { label: 'Dark resistance', unit: 'Ω', value: 1e6, min: 1 },
      lightResistance: { label: 'Bright resistance', unit: 'Ω', value: 1000, min: 1 },
      ambient: { label: 'Ambient light', unit: '%', value: 20, min: 0, max: 100, slider: true },
      powerRating: { label: 'Power rating', unit: 'W', value: 0.1, min: 0.001 },
    },
    draw: () => `
      <path d="M -40 0 H -18 M 18 0 H 40 M -14 -24 L -6 -11 M 0 -24 L 8 -11" />
      <path class="fill" d="M -4 -7.5 L -5 -14 L -9.5 -11.5 Z M 10 -7.5 L 9 -14 L 4.5 -11.5 Z" />
      <rect x="-18" y="-6" width="36" height="12" />`,
  },
};

export const models: ModelDefs<'ldr'> = {
  // Follows the light falling on it, ambient plus nearby lamps and LEDs.
  ldr: {
    ...ohmic(
      (p, el) => ldrResistance(p, el.state.light ?? p.ambient / 100),
      (r, p) => [
        ...basicReadout(r),
        ['Light level', pct(Math.min(1, r.state.light ?? 0))],
        ['Resistance', fmt(ldrResistance(p, r.state.light ?? 0), 'Ω')],
      ],
    ),
    dynamic: true,
    respond(el, env, _r, dt) {
      const target = el.props.ambient / 100 + env.light(el);
      const now = el.state.light ?? target;
      el.state.light = dt === null ? target : target + (now - target) * Math.exp(-dt / LDR_TAU);
      return Math.abs(el.state.light - now) > 1e-4;
    },
    thermal: powerThermal(1, 2),
    failure: { label: 'burnt out', open: true },
  },
};
