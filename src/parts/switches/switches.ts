import { contactsModel, poleCurrents } from '../../sim/shared/contacts.ts';
import { basicReadout } from '../../sim/shared/readout.ts';
import type { ModelDef, ModelDefs } from '../../sim/models.ts';
import type { PartDefs } from '../defs.ts';
import type { PropsByType } from '../../types.ts';
import { POLES, poleActuatorAt, poleCount, poleGroups, poleHit, poleLabelAt, polePins, poleYs } from './poles.ts';

// The values each of these parts carries: what the properties panel edits
// and the simulator reads (gathered into PropsByType in src/types.ts).
// `poles`: how many contacts the one handle works (1–4, see poles.ts).
export interface PartProps {
  switch: { closed: boolean; poles: number; maxCurrent: number };
  button: { closed: boolean; poles: number; maxCurrent: number };
  buttonNC: { pressed: boolean; poles: number; maxCurrent: number }; // conducts until pressed
  // Make and break contacts on one button, as an industrial push button's
  // contact blocks: `contacts` says which (see BLOCKS).
  buttonBlocks: { pressed: boolean; contacts: ContactSet; maxCurrent: number };
}

export type ContactSet = '1 NO + 1 NC' | '2 NO + 1 NC' | '1 NO + 2 NC' | '2 NO + 2 NC';

// The contacts of each set, top down, make (NO) contacts first, with their
// terminal numbers as EN 50005 gives them: the first digit counts the
// contact, the second says what it is (1–2 break, 3–4 make).
const BLOCKS: Record<ContactSet, ['NO' | 'NC', number][]> = {
  '1 NO + 1 NC': [['NO', 13], ['NC', 21]],
  '2 NO + 1 NC': [['NO', 13], ['NO', 23], ['NC', 31]],
  '1 NO + 2 NC': [['NO', 13], ['NC', 21], ['NC', 31]],
  '2 NO + 2 NC': [['NO', 13], ['NO', 23], ['NC', 31], ['NC', 41]],
};

// Its contacts as poles, for the pole layout helpers.
const blockPoles = (p: { contacts: ContactSet }) => ({ poles: BLOCKS[p.contacts].length });

// Overloaded contacts weld shut: a failed switch conducts whatever its
// setting. Each pole is a pair of pins, joined while `shut` says so.
function gangedModel<P extends { poles: number; maxCurrent: number }>(shut: (p: P, broken: boolean) => boolean): ModelDef<P> {
  return {
    ...contactsModel<P>(
      (el) => (shut(el.props, el.broken) ? poleGroups(el.props, 2) as [number, number][] : []),
      (p) => poleGroups(p, 2),
      (r, p) => (poleCount(p) === 1 ? basicReadout(r) : poleCurrents(r, poleGroups(p, 2).map(([a]) => a))),
    ),
    failure: { label: 'contacts welded', open: false },
  };
}

const PITCH = 40; // between poles

// The pole of a switch, its contact drawn by `contact` at each pole's height;
// the line of action joins the blades at `link` (from the first pole's
// height), up to `from` where a push button's head sits.
const ganged = (p: { poles: number }, contact: string, link: number, from = link) => {
  const ys = poleYs(p, PITCH);
  const last = ys[ys.length - 1];
  return `
    ${ys.map((y) => (y ? `<g transform="translate(0 ${y})">${contact}</g>` : contact)).join('')}
    ${last > 0 || from !== link ? `<path class="link" d="M 1 ${from} V ${last + link}" />` : ''}`;
};

// A make contact (NO), shut or open, and a break contact (NC): its blade
// rests against a stop on the fixed contact, and pressing lifts it off. A
// welded one shows a blob where it fused.
const makeContact = (shut: boolean, broken: boolean) => `
  <path d="M -40 0 H -14 L ${shut ? '14 0' : '16 -12'} M 14 0 H 40" />
  ${broken ? '<circle class="weld" cx="14" r="3.5" />' : ''}`;
const breakContact = (open: boolean, broken: boolean) => `
  <path d="M -40 0 H -14 L 18 ${open ? -20 : -10} M 40 0 H 14 V -10" />
  ${broken ? '<circle class="weld" cx="14" cy="-9" r="3.5" />' : ''}`;

// Where the line of action meets each one's blade.
const makeLink = (shut: boolean) => (shut ? 0 : -6);
const breakLink = (open: boolean) => (open ? -14 : -7);

// A push button's head, pushed in or out.
const pushHead = (head: number) => `<path d="M -6 ${head - 4} V ${head} H 8 V ${head - 4}" />`;

// The terminal circles of the US symbols: a switch's, and a push button's
// (closer together, under or over its bar).
const TERMINALS = '<circle class="dot-hollow" cx="-14" r="3" /><circle class="dot-hollow" cx="14" r="3" />';
const TERMINALS_NEAR = '<circle class="dot-hollow" cx="-10" r="3" /><circle class="dot-hollow" cx="10" r="3" />';

// Each pole's two pins.
const PINS = [{ x: -40, y: 0 }, { x: 40, y: 0 }];

// A push button's contact the US way (NEMA): a bar over the terminals,
// pushed down onto them (NO), or under them, pushed down off them (NC).
const usButtonContact = (kind: 'NO' | 'NC', pressed: boolean, broken: boolean) => {
  const bar = kind === 'NO' ? (pressed || broken ? -3 : -9) : pressed && !broken ? 9 : 3;
  return `
    <path d="M -40 0 H -13 M 13 0 H 40 M -15 ${bar} H 15" />
    ${TERMINALS_NEAR}
    ${broken ? `<circle class="weld" cx="10" cy="${kind === 'NO' ? -3 : 3}" r="3.5" />` : ''}`;
};

export const defs: PartDefs<'switch' | 'button' | 'buttonNC' | 'buttonBlocks'> = {
  switch: {
    name: 'Switch',
    info: {
      summary: 'An on/off switch: click its control to open or close it.',
      about: {
        how: 'A contact that is either open or closed until you change it.',
        sim: 'Open, or closed with a tiny resistance; its contacts heat past their rated current. Click its control on the board to flip it. Up to four poles on the one handle (double-pole, triple-pole…).',
        uses: 'Turning circuits on and off, and setting inputs by hand.',
      },
    },
    letter: 'S',
    category: 'switches',
    group: 'Toggle',
    pins: (p) => polePins(p, PITCH, PINS),
    props: {
      closed: { label: 'Closed', value: false },
      poles: POLES,
      maxCurrent: { label: 'Max current', unit: 'A', value: 5, min: 0.001 },
    },
    hit: (p) => poleHit(p, PITCH),
    actuatorAt: poleActuatorAt,
    labelAt: poleLabelAt(PITCH),
    actuator: { prop: 'closed', momentary: false },
    // Welded contacts stay shut, with a blob where they fused.
    draw: (p, broken) => {
      const shut = p.closed || broken;
      return ganged(p, makeContact(shut, broken), makeLink(shut));
    },
    // US: the blade between two terminal circles.
    us: {
      draw: (p, broken) => {
        const shut = p.closed || broken;
        return ganged(
          p,
          `<path d="M -40 0 H -17 M 17 0 H 40 M -11 0 L ${shut ? '11 0' : '13 -13'}" />
          ${TERMINALS}
          ${broken ? '<circle class="weld" cx="14" r="3.5" />' : ''}`,
          shut ? 0 : -6,
        );
      },
    },
  },
  // Normally-open push button: closed only while held down.
  button: {
    name: 'Push button (NO)',
    info: {
      summary: 'A push button that closes only while it’s held (normally open).',
      about: {
        how: 'A momentary switch: its contact closes only while you press it, and springs open again (normally open, NO).',
        sim: 'Closed while held: press and hold its control on the board. Up to four poles on the one button.',
        uses: 'Start buttons, doorbells, and logic inputs.',
      },
      example: 'doorbell',
    },
    letter: 'S',
    category: 'switches',
    group: 'Push buttons',
    pins: (p) => polePins(p, PITCH, PINS),
    props: {
      closed: { label: 'Pressed', value: false, hidden: true },
      poles: POLES,
      maxCurrent: { label: 'Max current', unit: 'A', value: 5, min: 0.001 },
    },
    hit: (p) => poleHit(p, PITCH, -30),
    actuatorAt: poleActuatorAt,
    labelAt: poleLabelAt(PITCH),
    actuator: { prop: 'closed', momentary: true },
    // DIN make contact with a push actuator linked to the blade (every
    // pole's) by a dashed line.
    draw: (p, broken) => {
      const shut = p.closed || broken;
      const head = p.closed ? -14 : -20;
      return pushHead(head) + ganged(p, makeContact(shut, broken), makeLink(shut), head);
    },
    // US (NEMA): a bar on a stem above two terminals, pushed down onto them;
    // further poles' bars on the same stem.
    us: {
      draw: (p, broken) => {
        const bar = p.closed || broken ? -3 : -9;
        const ys = poleYs(p, PITCH);
        return `
        ${ys.map((y) => `<g transform="translate(0 ${y})">${usButtonContact('NO', p.closed, broken)}</g>`).join('')}
        <path d="M 0 ${ys[ys.length - 1] + bar} V ${bar - 12} M -5 ${bar - 12} H 5" />`;
      },
    },
  },
  // Normally-closed push button: conducts until held down. DIN break contact:
  // the blade rests against a stop on the fixed contact; pressing lifts it off.
  buttonNC: {
    name: 'Push button (NC)',
    info: {
      summary: 'A push button that opens only while it’s held (normally closed): a stop button.',
      about: {
        how: 'A momentary switch whose contact is closed at rest and opens while you press it (normally closed, NC).',
        sim: 'Open while held: press and hold its control on the board. Up to four poles on the one button.',
        uses: 'Stop buttons and safety circuits, which must break the circuit when pressed.',
      },
      example: 'motor-starter',
    },
    letter: 'S',
    category: 'switches',
    group: 'Push buttons',
    pins: (p) => polePins(p, PITCH, PINS),
    props: {
      pressed: { label: 'Pressed', value: false, hidden: true },
      poles: POLES,
      maxCurrent: { label: 'Max current', unit: 'A', value: 5, min: 0.001 },
    },
    hit: (p) => poleHit(p, PITCH, -36),
    actuatorAt: poleActuatorAt,
    labelAt: poleLabelAt(PITCH),
    actuator: { prop: 'pressed', momentary: true },
    draw: (p, broken) => {
      const open = p.pressed && !broken;
      const head = open ? -32 : -24;
      return pushHead(head) + ganged(p, breakContact(open, broken), breakLink(open), head);
    },
    // US (NEMA): the bar rests under the two terminals, joining them, and is
    // pushed down off them; further poles' bars on the same stem.
    us: {
      draw: (p, broken) => {
        const bar = p.pressed && !broken ? 9 : 3;
        const ys = poleYs(p, PITCH);
        return `
        ${ys.map((y) => `<g transform="translate(0 ${y})">${usButtonContact('NC', p.pressed, broken)}</g>`).join('')}
        <path d="M 0 ${ys[ys.length - 1] + bar} V ${bar - 18} M -5 ${bar - 18} H 5" />`;
      },
    },
  },
  // Make and break contacts on one button (pins: see blockPins), the make
  // contacts on top. DIN: one head, its line of action through every blade.
  buttonBlocks: {
    name: 'Push button (NO + NC)',
    info: {
      summary: 'A push button with both make (NO) and break (NC) contacts: pressing it closes the one and opens the other at once.',
      about: {
        how: 'A momentary push button carrying several contact blocks: its make contacts (NO) close and its break contacts (NC) open while it’s pressed.',
        sim: 'Each contact a separate pair of pins, numbered as EN 50005 does (13–14 make, 21–22 break); all of them switch while you hold its control on the board.',
        uses: 'Start buttons that also interlock, signalling a press to a second circuit, and two-hand or emergency controls.',
      },
    },
    letter: 'S',
    category: 'switches',
    group: 'Push buttons',
    pins: (p) => polePins(blockPoles(p), PITCH, PINS),
    pinNames: (p) => BLOCKS[p.contacts].flatMap(([, n]) => [String(n), String(n + 1)]),
    props: {
      pressed: { label: 'Pressed', value: false, hidden: true },
      contacts: { label: 'Contacts', value: '1 NO + 1 NC', options: ['1 NO + 1 NC', '2 NO + 1 NC', '1 NO + 2 NC', '2 NO + 2 NC'] },
      maxCurrent: { label: 'Max current', unit: 'A', value: 5, min: 0.001 },
    },
    actuator: { prop: 'pressed', momentary: true },
    hit: (p) => poleHit(blockPoles(p), PITCH, -30),
    actuatorAt: (vertical, p, rotation) => poleActuatorAt(vertical, blockPoles(p), rotation),
    labelAt: (vertical, p, rotation) => poleLabelAt(PITCH)(vertical, blockPoles(p), rotation),
    draw: (p, broken) => {
      const blocks = BLOCKS[p.contacts];
      const [kind] = blocks[blocks.length - 1];
      const shut = p.pressed || broken;
      const open = p.pressed && !broken;
      const head = p.pressed ? -14 : -20;
      const last = (blocks.length - 1) * PITCH + (kind === 'NO' ? makeLink(shut) : breakLink(open));
      return `
        ${pushHead(head)}
        ${blocks
          .map(([k], j) => `<g transform="translate(0 ${j * PITCH})">${k === 'NO' ? makeContact(shut, broken) : breakContact(open, broken)}</g>`)
          .join('')}
        <path class="link" d="M 1 ${head} V ${last}" />`;
    },
    // US (NEMA): every contact's bar on one stem.
    us: {
      draw: (p, broken) => {
        const blocks = BLOCKS[p.contacts];
        const down = p.pressed ? 6 : 0;
        return `
        ${blocks.map(([k], j) => `<g transform="translate(0 ${j * PITCH})">${usButtonContact(k, p.pressed, broken)}</g>`).join('')}
        <path d="M 0 ${(blocks.length - 1) * PITCH + 3 + down} V ${-21 + down} M -5 ${-21 + down} H 5" />`;
      },
    },
  },
};

export const models: ModelDefs<'switch' | 'button' | 'buttonNC' | 'buttonBlocks'> = {
  switch: gangedModel((p, broken) => p.closed || broken),
  // A push button is electrically a switch that is only closed while held.
  button: gangedModel((p, broken) => p.closed || broken),
  // Conducts until pressed; overloaded contacts weld shut.
  buttonNC: gangedModel((p, broken) => !p.pressed || broken),
  // Its make contacts closed while pressed, its break contacts until then;
  // overloaded contacts weld shut.
  buttonBlocks: {
    ...contactsModel<PropsByType['buttonBlocks']>(
      (el) =>
        BLOCKS[el.props.contacts]
          .map(([kind], j): [number, number, boolean] => [2 * j, 2 * j + 1, el.broken || (kind === 'NO') === el.props.pressed])
          .filter(([, , shut]) => shut)
          .map(([a, b]) => [a, b]),
      (p) => poleGroups(blockPoles(p), 2),
      (r, p) =>
        poleCurrents(r, poleGroups(blockPoles(p), 2).map(([a]) => a)).map(([, value], j) => {
          const n = BLOCKS[p.contacts][j][1];
          return [`${n}–${n + 1}`, value];
        }),
    ),
    failure: { label: 'contacts welded', open: false },
  },
};
