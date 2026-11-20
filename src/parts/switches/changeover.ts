import { contactsModel, poleCurrents } from '../../sim/shared/contacts.ts';
import type { ModelDef, ModelDefs } from '../../sim/models.ts';
import type { PartDefs } from '../defs.ts';
import type { PropsByType } from '../../types.ts';
import { POLES, poleActuatorAt, poleGroups, poleHit, poleLabelAt, polePins, poleYs } from './poles.ts';

// The values each of these parts carries: what the properties panel edits
// and the simulator reads (gathered into PropsByType in src/types.ts).
export interface PartProps {
  // Changeover (two-way, stairway) switch: common to throw 1, or to throw 2
  // when `thrown`; `poles` of them on one handle (see poles.ts).
  changeover: { thrown: boolean; poles: number; maxCurrent: number };
}

// --- Changeover switch -------------------------------------------------------

const PITCH = 60; // between poles

// Each pole's pins: common, throw 1, throw 2.
const PINS = [{ x: -40, y: 0 }, { x: 40, y: -20 }, { x: 40, y: 20 }];

// Each pole's common to its throw 1 at rest, to its throw 2 when thrown.
const changeoverModel: ModelDef<PropsByType['changeover']> = {
  ...contactsModel<PropsByType['changeover']>(
    (el) => poleGroups(el.props, 3).map(([c, one, two]): [number, number] => [c, el.props.thrown ? two : one]),
    (p) => poleGroups(p, 3),
    (r, p) => [['Position', p.thrown ? '2' : '1'], ...poleCurrents(r, poleGroups(p, 3).map(([c]) => c))],
  ),
  failure: { label: 'burnt out', open: true },
};

// Every pole's blade, joined by the line of action when there are more.
const ganged = (p: PropsByType['changeover'], contact: string, link: number) => {
  const ys = poleYs(p, PITCH);
  const last = ys[ys.length - 1];
  return `
    ${ys.map((y) => (y ? `<g transform="translate(0 ${y})">${contact}</g>` : contact)).join('')}
    ${last > 0 ? `<path class="link" d="M 0 ${link} V ${last + link}" />` : ''}`;
};

export const defs: PartDefs<'changeover'> = {
  // Two-way (stairway) switch, DIN: the blade from the common (left) rests on
  // throw 1 (top right) or, thrown, on throw 2 (bottom right).
  changeover: {
    name: 'Changeover switch',
    info: {
      summary: 'A switch that connects its common to one of two contacts: two-way switching, like a stairway light.',
      about: {
        how: 'A switch that connects its common terminal to one of two others.',
        sim: 'Its common joined to one contact or the other; click its control to throw it. Up to four poles on the one handle (double-pole double-throw…).',
        uses: 'Two-way light switching, selecting between two sources or signals.',
      },
      example: 'stairway-light',
    },
    letter: 'S',
    category: 'switches',
    group: 'Toggle',
    pins: (p) => polePins(p, PITCH, PINS), // per pole: common, 1, 2
    props: {
      thrown: { label: 'Thrown (to 2)', value: false },
      poles: POLES,
      maxCurrent: { label: 'Max current', unit: 'A', value: 5, min: 0.001 },
    },
    actuator: { prop: 'thrown', momentary: false },
    hit: (p) => poleHit(p, PITCH, -30, 30),
    actuatorAt: poleActuatorAt,
    labelAt: poleLabelAt(PITCH),
    draw: (p) => ganged(p, `<path d="M -40 0 H -14 L 14 ${p.thrown ? 20 : -20} M 40 -20 H 14 M 40 20 H 14" />`, p.thrown ? 10 : -10),
    // US: the blade between terminal circles.
    us: {
      draw: (p) =>
        ganged(
          p,
          `<path d="M -40 0 H -17 M 40 -20 H 17 M 40 20 H 17 M -11 0 L 11.5 ${p.thrown ? 18 : -18}" />
          <circle class="dot-hollow" cx="-14" r="3" /><circle class="dot-hollow" cx="14" cy="-20" r="3" /><circle class="dot-hollow" cx="14" cy="20" r="3" />`,
          p.thrown ? 9 : -9,
        ),
    },
  },
};

export const models: ModelDefs<'changeover'> = {
  changeover: changeoverModel,
};
