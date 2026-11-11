import { R_SWITCH_ON } from '../../sim/shared/resistance.ts';
import { fmt } from '../../sim/shared/readout.ts';
import type { ModelDef, ModelDefs } from '../../sim/models.ts';
import type { PartDefs } from '../defs.ts';
import type { PropsByType } from '../../types.ts';

// The values each of these parts carries: what the properties panel edits
// and the simulator reads (gathered into PropsByType in src/types.ts).
export interface PartProps {
  // Changeover (two-way, stairway) switch: common to throw 1, or to throw 2
  // when `thrown`.
  changeover: { thrown: boolean; maxCurrent: number };
}

// --- Changeover switch -------------------------------------------------------

// Common (0) to throw 1 (1) at rest, to throw 2 (2) when thrown.
const changeoverModel: ModelDef<PropsByType['changeover']> = {
  stamp(el, s) {
    s.conductance(el.nodes[0], el.nodes[el.props.thrown ? 2 : 1], 1 / R_SWITCH_ON);
  },
  current: (el, s) => (s.v(el.nodes[0]) - s.v(el.nodes[el.props.thrown ? 2 : 1])) / R_SWITCH_ON,
  pinCurrents(el, s) {
    const to = el.props.thrown ? 2 : 1;
    const i = (s.v(el.nodes[0]) - s.v(el.nodes[to])) / R_SWITCH_ON;
    const pins = [i, 0, 0];
    pins[to] = -i;
    return pins;
  },
  readout: (r, p) => [
    ['Position', p.thrown ? '2' : '1'],
    ['Current', `${fmt(r.ac ? r.irms : Math.abs(r.i), 'A')}${r.ac ? ' rms' : ''}`],
  ],
  thermal: { load: (r, p) => Math.abs(r.i) / p.maxCurrent, tau: 0.2, limit: 1.5 },
  failure: { label: 'burnt out', open: true },
};

export const defs: PartDefs<'changeover'> = {
  // Two-way (stairway) switch, DIN: the blade from the common (left) rests on
  // throw 1 (top right) or, thrown, on throw 2 (bottom right).
  changeover: {
    name: 'Changeover switch',
    letter: 'S',
    category: 'switches',
    group: 'Toggle',
    pins: [{ x: -40, y: 0 }, { x: 40, y: -20 }, { x: 40, y: 20 }], // common, 1, 2
    props: {
      thrown: { label: 'Thrown (to 2)', value: false },
      maxCurrent: { label: 'Max current', unit: 'A', value: 5, min: 0.001 },
    },
    actuator: { prop: 'thrown', momentary: false },
    draw: ({ thrown }) => `
      <path d="M -40 0 H -14 L 14 ${thrown ? 20 : -20} M 40 -20 H 14 M 40 20 H 14" />`,
  },
};

export const models: ModelDefs<'changeover'> = {
  changeover: changeoverModel,
};
