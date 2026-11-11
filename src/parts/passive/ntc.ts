import { basicReadout, fmt } from '../../sim/shared/readout.ts';
import { ohmic, powerThermal } from '../../sim/shared/resistance.ts';
import { formatSI } from '../../units.ts';
import type { ModelDefs } from '../../sim/models.ts';
import type { PartDefs } from '../defs.ts';
import type { PropsByType } from '../../types.ts';

// The values each of these parts carries: what the properties panel edits
// and the simulator reads (gathered into PropsByType in src/types.ts).
export interface PartProps {
  ntc: { resistance: number; beta: number; ambient: number; powerRating: number }; // resistance at 25 °C, ambient in °C
}

// s; LDRs follow light with a short lag
const KELVIN = 273.15;

const NTC_RTH = 100; // K/W: warming per watt dissipated (10 mW/K dissipation constant)

const NTC_TAU = 3; // s to warm up or cool down

// A thermistor is destroyed long before this; the cap just keeps the B
// equation from running off to nonsense during thermal runaway.
const NTC_MAX_RISE = 300; // K

// B-parameter thermistor equation, from its resistance at 25 °C.
const ntcResistance = (p: PropsByType['ntc'], rise: number) =>
  p.resistance * Math.exp(p.beta * (1 / (p.ambient + rise + KELVIN) - 1 / (25 + KELVIN)));

export const defs: PartDefs<'ntc'> = {
  // NTC thermistor: resistance falls as it warms (B-parameter model).
  ntc: {
    name: 'NTC thermistor',
    letter: 'R',
    category: 'passive',
    group: 'Sensors',
    pins: [{ x: -40, y: 0 }, { x: 40, y: 0 }],
    props: {
      resistance: { label: 'Resistance at 25 °C', unit: 'Ω', value: 10e3, min: 1 },
      beta: { label: 'B constant', unit: 'K', value: 3950, min: 100 },
      ambient: { label: 'Ambient temperature', unit: '°C', value: 25, min: -40, max: 150, slider: true },
      powerRating: { label: 'Power rating', unit: 'W', value: 0.5, min: 0.001 },
    },
    tag: (p) => formatSI(p.resistance, 'Ω'),
    draw: () => `
      <path d="M -40 0 H -18 M 18 0 H 40 M -22 14 H -16 L 16 -14" />
      <rect x="-18" y="-6" width="36" height="12" />
      <text class="sym-text upright" x="6" y="20" data-x="12" data-y="17">−ϑ</text>`,
  },
};

export const models: ModelDefs<'ntc'> = {
  // Warms above ambient by the power it dissipates, over a few seconds.
  ntc: {
    ...ohmic(
      (p, el) => ntcResistance(p, el.state.rise ?? 0),
      (r, p) => [
        ...basicReadout(r),
        ['Temperature', `${(p.ambient + (r.state.rise ?? 0)).toFixed(1)} °C`],
        ['Resistance', fmt(ntcResistance(p, r.state.rise ?? 0), 'Ω')],
      ],
    ),
    dynamic: true,
    respond(el, _env, r, dt) {
      if (dt === null) return; // temperature only changes with time
      const target = Math.min(NTC_MAX_RISE, Math.abs(r.p) * NTC_RTH);
      const now = el.state.rise ?? 0;
      el.state.rise = target + (now - target) * Math.exp(-dt / NTC_TAU);
    },
    thermal: powerThermal(2, 2),
    failure: { label: 'burnt out', open: true },
  },
};
