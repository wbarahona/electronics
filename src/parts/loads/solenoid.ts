import { basicReadout } from '../../sim/shared/readout.ts';
import { coil, DROP_OUT, PULL_IN } from '../../sim/shared/coils.ts';
import { formatSI } from '../../units.ts';
import type { ModelDef, ModelDefs } from '../../sim/models.ts';
import type { PartDefs } from '../defs.ts';
import type { PropsByType } from '../../types.ts';

// The values each of these parts carries: what the properties panel edits
// and the simulator reads (gathered into PropsByType in src/types.ts).
export interface PartProps {
  // A coil whose plunger pulls in at its rated current (DC, or RMS on AC).
  solenoid: { ratedVoltage: number; ratedCurrent: number; inductance: number };
}

// The plunger pulls in at PULL_IN of the rated current and drops out below
// DROP_OUT, like a relay (judged by RMS on AC).
const solenoidModel: ModelDef<PropsByType['solenoid']> = {
  ...coil((p) => p.ratedVoltage / p.ratedCurrent, (p) => p.inductance),
  respond(el, _env, r) {
    const was = el.state.energized ?? false;
    const i = r.ac ? r.irms : Math.abs(r.i);
    el.state.energized = i >= (was ? DROP_OUT : PULL_IN) * el.props.ratedCurrent;
    return el.state.energized !== was;
  },
  active: (r) => !!r.state.energized,
  readout: (r) => [...basicReadout(r), ['Plunger', r.state.energized ? 'pulled in' : 'out']],
  thermal: { load: (r, p) => (r.ac ? r.irms : Math.abs(r.i)) / p.ratedCurrent, tau: 5, limit: 1.6 },
  failure: { label: 'burnt out', open: true },
};

export const defs: PartDefs<'solenoid'> = {
  // A coil (DIN actuator rectangle) with its plunger above: out at rest, in
  // when pulled.
  solenoid: {
    name: 'Solenoid',
    letter: 'M',
    category: 'loads',
    group: 'Electromagnetic',
    pins: [{ x: -40, y: 0 }, { x: 40, y: 0 }],
    props: {
      ratedVoltage: { label: 'Rated voltage', unit: 'V', value: 12, min: 0.1 },
      ratedCurrent: { label: 'Rated current', unit: 'A', value: 0.5, min: 0.0001 },
      inductance: { label: 'Inductance', unit: 'H', value: 0.05, min: 1e-6 },
    },
    tag: (p) => formatSI(p.ratedVoltage, 'V'),
    draw: () => `
      <path d="M -40 0 H -14 M 14 0 H 40" />
      <rect x="-14" y="-8" width="28" height="16" />
      <path class="when-off" d="M 0 -8 V -22 M -6 -22 H 6" />
      <path class="when-on" d="M 0 -8 V -13 M -6 -13 H 6" />`,
  },
};

export const models: ModelDefs<'solenoid'> = {
  solenoid: solenoidModel,
};
