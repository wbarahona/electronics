import { basicReadout } from '../../sim/shared/readout.ts';
import { ohmic } from '../../sim/shared/resistance.ts';
import { formatSI } from '../../units.ts';
import type { ModelDef, ModelDefs, Result } from '../../sim/models.ts';
import type { PartDefs } from '../defs.ts';
import type { PropsByType } from '../../types.ts';

// The values each of these parts carries: what the properties panel edits
// and the simulator reads (gathered into PropsByType in src/types.ts).
export interface PartProps {
  // A heating element: its rated voltage and power fix its resistance; it
  // warms up over several seconds and glows when hot.
  heater: { ratedVoltage: number; ratedPower: number };
}

// --- Heater ------------------------------------------------------------------

// A fixed resistance (V²/P at its rating). Its element warms toward the
// power it takes over HEATER_TAU and glows once well warm.
const HEATER_TAU = 8; // s

const heaterPower = (r: Result) => Math.abs(r.ac ? r.pavg : r.p);

const heaterModel: ModelDef<PropsByType['heater']> = {
  ...ohmic((p) => p.ratedVoltage ** 2 / p.ratedPower, (r) => [
    ...basicReadout(r),
    ['Element', `${Math.round((r.state.temp ?? 0) * 100)} % hot`],
  ]),
  respond(el, _env, r, dt) {
    if (dt === null) return false;
    const target = heaterPower(r) / el.props.ratedPower;
    const t = el.state.temp ?? 0;
    el.state.temp = t + (target - t) * (1 - Math.exp(-dt / HEATER_TAU));
    return false;
  },
  dynamic: true,
  brightness: (r) => Math.max(0, ((r.state.temp ?? 0) - 0.3) / 0.7),
  thermal: { load: (r, p) => heaterPower(r) / p.ratedPower, tau: 5, limit: 1.5 },
  failure: { label: 'burnt out', open: true },
};

export const defs: PartDefs<'heater'> = {
  // Heating element (a resistance with heating marks); glows red when hot.
  heater: {
    name: 'Heater',
    letter: 'E',
    category: 'loads',
    group: 'Heat',
    pins: [{ x: -40, y: 0 }, { x: 40, y: 0 }],
    props: {
      ratedVoltage: { label: 'Rated voltage', unit: 'V', value: 120, min: 0.1 },
      ratedPower: { label: 'Rated power', unit: 'W', value: 1000, min: 0.01 },
    },
    tag: (p) => `${formatSI(p.ratedVoltage, 'V')} ${formatSI(p.ratedPower, 'W')}`,
    glow: { color: () => 'red', radius: 36 },
    draw: () => `
      <path d="M -40 0 H -20 M 20 0 H 40" />
      <rect class="bulb" x="-20" y="-8" width="40" height="16" />
      <path d="M -16 4 L -12 -4 M -6 4 L -2 -4 M 4 4 L 8 -4 M 14 4 L 18 -4" />`,
  },
};

export const models: ModelDefs<'heater'> = {
  heater: heaterModel,
};
