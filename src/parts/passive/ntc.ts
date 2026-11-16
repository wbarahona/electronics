import { basicReadout, fmt } from '../../sim/shared/readout.ts';
import { ohmic, powerThermal } from '../../sim/shared/resistance.ts';
import { formatSI, formatTemp } from '../../units.ts';
import type { ModelDefs } from '../../sim/models.ts';
import type { PartDefs } from '../defs.ts';
import { ZIGZAG } from '../symbols.ts';
import type { PropsByType } from '../../types.ts';

// The values each of these parts carries: what the properties panel edits
// and the simulator reads (gathered into PropsByType in src/types.ts).
export interface PartProps {
  // Resistance at 25 °C. It feels the temperature around it (the circuit's
  // ambient plus warmth from hot parts nearby) and its own self-heating.
  ntc: { resistance: number; beta: number; powerRating: number };
}

// s; LDRs follow light with a short lag
const KELVIN = 273.15;

const NTC_RTH = 100; // K/W: warming per watt dissipated (10 mW/K dissipation constant)

const NTC_TAU = 3; // s to warm up or cool down

// A thermistor is destroyed long before this; the cap just keeps the B
// equation from running off to nonsense during thermal runaway.
const NTC_MAX_RISE = 300; // K

// B-parameter thermistor equation, from its resistance at 25 °C, at `celsius`.
const ntcResistance = (p: PropsByType['ntc'], celsius: number) =>
  p.resistance * Math.exp(p.beta * (1 / (celsius + KELVIN) - 1 / (25 + KELVIN)));

// Its temperature: what's around it plus its self-heating.
const ntcCelsius = (state: { around?: number; rise?: number }) => (state.around ?? 25) + (state.rise ?? 0);

export const defs: PartDefs<'ntc'> = {
  // NTC thermistor: resistance falls as it warms (B-parameter model).
  ntc: {
    name: 'NTC thermistor',
    letter: 'R',
    us: {
      letter: 'RT',
      draw: () => `
        <path d="${ZIGZAG} M -22 14 H -16 L 16 -14" />
        <text class="sym-text upright" x="6" y="22" data-x="12" data-y="19">−t°</text>`,
    },
    category: 'passive',
    group: 'Sensors',
    pins: [{ x: -40, y: 0 }, { x: 40, y: 0 }],
    props: {
      resistance: { label: 'Resistance at 25 °C', unit: 'Ω', value: 10e3, min: 1 },
      beta: { label: 'B constant', unit: 'K', value: 3950, min: 100 },
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
  // Feels the temperature around it, and warms above that by the power it
  // dissipates, over a few seconds.
  ntc: {
    ...ohmic(
      (p, el) => ntcResistance(p, ntcCelsius(el.state)),
      (r, p) => [
        ...basicReadout(r),
        ['Temperature', formatTemp(ntcCelsius(r.state))],
        ['Resistance', fmt(ntcResistance(p, ntcCelsius(r.state)), 'Ω')],
      ],
    ),
    dynamic: true,
    respond(el, env, r, dt) {
      // It has thermal mass: it follows the temperature around it, and its
      // own warming, over NTC_TAU, not at once (so a thermostat cycles
      // instead of chattering). Placed or loaded, it starts at its
      // surroundings' temperature.
      const around = env.temperature(el);
      if (el.state.around === undefined) {
        el.state.around = around;
        return true;
      }
      if (dt === null) return false; // temperature only changes with time
      const ease = Math.exp(-dt / NTC_TAU);
      el.state.around = around + (el.state.around - around) * ease;
      const target = Math.min(NTC_MAX_RISE, Math.abs(r.p) * NTC_RTH);
      el.state.rise = target + ((el.state.rise ?? 0) - target) * ease;
      return false;
    },
    thermal: powerThermal(2, 2, 60),
    failure: { label: 'burnt out', open: true },
  },
};
