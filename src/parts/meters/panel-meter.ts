import { fmt } from '../../sim/shared/readout.ts';
import { meterReading, meterValue } from '../../sim/shared/meters.ts';
import { ohmic } from '../../sim/shared/resistance.ts';
import { formatSI } from '../../units.ts';
import { METER_MODE } from '../symbols.ts';
import type { ModelDef, ModelDefs } from '../../sim/models.ts';
import type { PartDefs } from '../defs.ts';
import type { MeterMode, PropsByType } from '../../types.ts';

// The values each of these parts carries: what the properties panel edits
// and the simulator reads (gathered into PropsByType in src/types.ts).
export interface PartProps {
  // Moving-coil panel meter: a needle across a scale to `fullScale` volts.
  panelMeter: { fullScale: number; resistance: number; mode: MeterMode };
}

// --- Panel meter --------------------------------------------------------------

// The needle follows the DC (average) or AC (RMS) voltage across it as a
// fraction of full scale, with the damping of a real movement, and pegs a
// little past either end.
const NEEDLE_TAU = 0.25; // s

const panelMeterModel: ModelDef<PropsByType['panelMeter']> = {
  ...ohmic((p) => p.resistance, (r, p) => [['Reading', `${meterReading(r, p, 'V')} ${p.mode}`], ['Full scale', fmt(p.fullScale, 'V')]]),
  respond(el, _env, r, dt) {
    const target = Math.min(1.05, Math.max(-0.05, meterValue(r, el.props, 'V') / el.props.fullScale));
    const now = el.state.needle ?? 0;
    el.state.needle = dt === null ? target : now + (target - now) * (1 - Math.exp(-dt / NEEDLE_TAU));
    return false;
  },
  needle: (r) => r.state.needle ?? 0,
  // A movement survives some overload, not a sustained several times full scale.
  thermal: { load: (r, p) => Math.abs(r.v) / (2 * p.fullScale), tau: 0.5, limit: 1.5 },
  failure: { label: 'movement burnt out', open: true },
};

export const defs: PartDefs<'panelMeter'> = {
  // Moving-coil panel meter: a needle sweeping a 100° scale (DIN EN 60617
  // indicating instrument with a pointer); + is pin 0.
  panelMeter: {
    name: 'Panel meter',
    letter: 'P',
    category: 'meters',
    group: 'Analog',
    pins: [{ x: -40, y: 0 }, { x: 40, y: 0 }],
    props: {
      fullScale: { label: 'Full scale', unit: 'V', value: 10, min: 0.001 },
      resistance: { label: 'Resistance', unit: 'Ω', value: 100e3, min: 1 },
      mode: METER_MODE,
    },
    tag: (p) => `${formatSI(p.fullScale, 'V')} ${p.mode}`,
    hit: { w: 80, h: 50 },
    labelAt: (vertical) => (vertical ? [40, 4, 'start'] : [0, -40, 'middle']),
    draw: () => `
      <path d="M -40 0 H -28 M 28 0 H 40" />
      <rect x="-28" y="-32" width="56" height="42" rx="4" />
      <path class="meter-scale" d="M -21.4 -12 A 28 28 0 0 1 21.4 -12 M -21.4 -12 L -24.5 -14.6 M -11.8 -19.4 L -13.5 -22.3 M 0 -22 V -26 M 11.8 -19.4 L 13.5 -22.3 M 21.4 -12 L 24.5 -14.6" />
      <line class="needle" x1="0" y1="6" x2="0" y2="-22" transform="rotate(-50 0 6)" />
      <circle class="needle-hub" cy="6" r="2" />
      <text class="sym-text" x="-22" y="6">+</text>`,
  },
};

export const models: ModelDefs<'panelMeter'> = {
  panelMeter: panelMeterModel,
};
