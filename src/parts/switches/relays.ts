import { DROP_OUT, PULL_IN } from '../../sim/shared/coils.ts';
import { R_SWITCH_ON } from '../../sim/shared/resistance.ts';
import { fmt } from '../../sim/shared/readout.ts';
import { pinText } from '../symbols.ts';
import type { Element, ModelDef, ModelDefs, Result } from '../../sim/models.ts';
import type { LabelSpot, PartDefs } from '../defs.ts';
import type { Point, PropsByType } from '../../types.ts';

// The values each of these parts carries: what the properties panel edits
// and the simulator reads (gathered into PropsByType in src/types.ts).
export interface PartProps {
  // A coil (A1, A2) that, energized, moves `contacts` contacts: changeover
  // (SPDT) or make only (SPST). maxCurrent is per contact. A contactor's coil
  // is AC, its `poles` main contacts (3 for a motor) make when energized.
  relay: { coilVoltage: number; coilResistance: number; contacts: number; contactType: 'SPDT' | 'SPST'; maxCurrent: number };
  contactor: { coilVoltage: number; coilResistance: number; poles: number; maxCurrent: number };
}

// Relays and contactors (DIN EN 60617-7): the coil is a rectangle between A1
// (top) and A2, its contacts stand beside it, joined to it by a dashed line
// of action. Contacts are drawn at rest; while the coil is energized (the
// part is .active) the moving blades show in their other position. Further
// contacts are added to the right, so changing how many contacts a relay
// has leaves the coil and the other pins (and their wires) where they are; a
// make contact stands in one line, its make pin straight above the common.

// How many contacts a relay has: its setting, as a whole number from 1 to 4.
export const relayContacts = (p: { contacts: number }) => Math.min(4, Math.max(1, Math.round(p.contacts)));

function relayLayout(p: { contacts: number }) {
  const coil = -40;
  const contacts = Array.from({ length: relayContacts(p) }, (_, k) => coil + 60 + 60 * k);
  return { coil, contacts };
}

// A relay's pins, named: the coil's A1 and A2, then per contact k its common
// (`c<k>`), break (`nc<k>`, changeover only) and make (`no<k>`).
export function relayPins(p: PropsByType['relay']): (Point & { name: string })[] {
  const { coil, contacts } = relayLayout(p);
  return [
    { name: 'A1', x: coil, y: -40 },
    { name: 'A2', x: coil, y: 40 },
    ...contacts.flatMap((x, k) => [
      { name: `c${k}`, x, y: 40 },
      ...(p.contactType === 'SPDT'
        ? [{ name: `nc${k}`, x: x - 20, y: -40 }, { name: `no${k}`, x: x + 20, y: -40 }]
        : [{ name: `no${k}`, x, y: -40 }]),
    ]),
  ];
}

// Label to the left of the coil, wherever that ends up on screen.
function coilLabel(coil: number, rotation: number): LabelSpot {
  const x = coil - 18;
  switch (((rotation % 360) + 360) % 360) {
    case 90:
      return [0, x, 'middle'];
    case 180:
      return [-x, 4, 'start'];
    case 270:
      return [0, -x + 8, 'middle'];
    default:
      return [x, 4, 'end'];
  }
}

const coilMarkup = (c: number) => `
  <path d="M ${c} -40 V -8 M ${c} 8 V 40" />
  <rect x="${c - 14}" y="-8" width="28" height="16" />
  ${pinText('A1', c + 4, -30)}${pinText('A2', c + 4, 36)}`;

// Contact k around x, numbered as in EN 50005: a changeover's common (k1)
// below, break (k2) and make (k4) above; a make contact's k3 below, k4 above.
const changeover = (x: number, k: number) => `
  <path d="M ${x} 40 V 14 M ${x - 20} -40 V -14 H ${x - 8} M ${x + 20} -40 V -14 H ${x + 8}" />
  <path class="when-off" d="M ${x} 14 L ${x - 9} -16" />
  <path class="when-on" d="M ${x} 14 L ${x + 9} -16" />
  ${pinText(`${k}1`, x + 4, 36)}${pinText(`${k}2`, x - 17, -30)}${pinText(`${k}4`, x + 23, -30)}`;

const makeContact = (x: number, k: number) => `
  <path d="M ${x} 40 V 14 M ${x} -40 V -12" />
  <path class="when-off" d="M ${x} 14 L ${x - 10} -10" />
  <path class="when-on" d="M ${x} 14 V -12" />
  ${pinText(`${k}3`, x + 4, 36)}${pinText(`${k}4`, x + 4, -30)}`;

// How many main poles a contactor has: its setting, as a whole number 1–4.
// They stand at 40-unit steps right of the coil, so adding or removing one
// leaves the others (and their wires) in place.
export const contactorPoles = (p: { poles: number }) => Math.min(4, Math.max(1, Math.round(p.poles)));

const poleXs = (p: { poles: number }) => Array.from({ length: contactorPoles(p) }, (_, k) => -20 + 40 * k);

// A contactor's make contact at x, with the contactor function's half-circle
// closing the end of its fixed contact (on the side away from the blade);
// pins numbered `top` and `top + 1`.
const mainContact = (x: number, top: number) => `
  <path d="M ${x} -40 V -10 M ${x} 40 V 14" />
  <path d="M ${x} -18 A 4 4 0 0 1 ${x} -10" />
  <path class="when-off" d="M ${x} 14 L ${x - 10} -10" />
  <path class="when-on" d="M ${x} 14 V -10" />
  ${pinText(String(top), x + 4, -30)}${pinText(String(top + 1), x + 4, 36)}`;

type CoilProps = { coilVoltage: number; coilResistance: number; maxCurrent: number };

function relayModel<P extends CoilProps>(
  contacts: (p: P) => [number, number, boolean][],
  groups: (p: P) => number[][],
  ac: boolean,
): ModelDef<P> {
  const level = (r: Result) => (ac ? r.vrms : Math.abs(r.v));
  const closed = (el: Element<P>) =>
    contacts(el.props).filter(([, , whenOn]) => whenOn === (el.state.energized ?? false));
  // The largest current through any contact pin; on AC, its RMS.
  const contactCurrent = (r: Result) => Math.max(0, ...(r.ac ? r.extraRms : r.pins.slice(2).map(Math.abs)));
  return {
    stamp(el, s) {
      s.conductance(el.nodes[0], el.nodes[1], 1 / el.props.coilResistance);
      for (const [a, b] of closed(el)) s.conductance(el.nodes[a], el.nodes[b], 1 / R_SWITCH_ON);
    },
    current: (el, s) => (s.v(el.nodes[0]) - s.v(el.nodes[1])) / el.props.coilResistance,
    pinCurrents(el, s) {
      const i = (s.v(el.nodes[0]) - s.v(el.nodes[1])) / el.props.coilResistance;
      const pins = el.nodes.map(() => 0);
      pins[0] = i;
      pins[1] = -i;
      for (const [a, b] of closed(el)) {
        const ic = (s.v(el.nodes[a]) - s.v(el.nodes[b])) / R_SWITCH_ON;
        pins[a] += ic;
        pins[b] -= ic;
      }
      return pins;
    },
    respond(el, _env, r) {
      const was = el.state.energized ?? false;
      el.state.energized = level(r) >= (was ? DROP_OUT : PULL_IN) * el.props.coilVoltage;
      return el.state.energized !== was;
    },
    active: (r) => !!r.state.energized,
    groups,
    extras: (r) => r.pins.slice(2),
    readout: (r) => [
      ['Coil', `${fmt(level(r), 'V')}${ac ? ' rms' : ''}, ${fmt(ac ? r.irms : Math.abs(r.i), 'A')}`],
      ['State', r.state.energized ? 'energized' : 'released'],
      ['Contact current', `${fmt(contactCurrent(r), 'A')}${r.ac ? ' rms' : ''}`],
    ],
    // Its coil overheats well past its rated voltage; its contacts past their
    // rated current.
    thermal: {
      load: (r, p) => Math.max(level(r) / (1.3 * p.coilVoltage), Math.max(0, ...r.pins.slice(2).map(Math.abs)) / p.maxCurrent),
      tau: 0.5,
      limit: 1.5,
    },
    failure: { label: 'burnt out', open: true },
  };
}

// Contact k joins its common to its make pin when energized and, if it's a
// changeover, to its break pin at rest.
const relayPinIndex = (p: PropsByType['relay']) => {
  const names = relayPins(p).map(({ name }) => name);
  return (name: string) => names.indexOf(name);
};

const relay = relayModel<PropsByType['relay']>(
  (p) => {
    const at = relayPinIndex(p);
    return Array.from({ length: relayContacts(p) }, (_, k): [number, number, boolean][] => [
      ...(p.contactType === 'SPDT' ? [[at(`c${k}`), at(`nc${k}`), false] as [number, number, boolean]] : []),
      [at(`c${k}`), at(`no${k}`), true],
    ]).flat();
  },
  (p) => {
    const at = relayPinIndex(p);
    const contact = (k: number) => [`c${k}`, `nc${k}`, `no${k}`].map(at).filter((i) => i >= 0);
    return [[0, 1], ...Array.from({ length: relayContacts(p) }, (_, k) => contact(k))];
  },
  false,
);

// Each pole k joins its pins 2 + 2k and 3 + 2k when energized.
const poles = (p: PropsByType['contactor']) => Array.from({ length: contactorPoles(p) }, (_, k) => [2 + 2 * k, 3 + 2 * k]);

const contactor = relayModel<PropsByType['contactor']>(
  (p) => poles(p).map(([a, b]): [number, number, boolean] => [a, b, true]),
  (p) => [[0, 1], ...poles(p)],
  true,
);

export const defs: PartDefs<'relay' | 'contactor'> = {
  // Pins: see relayPins.
  relay: {
    name: 'Relay',
    letter: 'K',
    category: 'switches',
    group: 'Relays',
    pins: (p) => relayPins(p).map(({ x, y }) => ({ x, y })),
    pinNames: (p) => relayPins(p).map(({ name }) => name),
    props: {
      coilVoltage: { label: 'Coil voltage', unit: 'V', value: 12, min: 0.1 },
      coilResistance: { label: 'Coil resistance', unit: 'Ω', value: 400, min: 0.1 },
      contacts: { label: 'Contacts', unit: '', value: 1, min: 1, max: 4 },
      contactType: { label: 'Contact type', value: 'SPDT', options: ['SPDT', 'SPST'] },
      maxCurrent: { label: 'Contact rating', unit: 'A', value: 10, min: 0.001 },
    },
    hit: (p) => {
      const { coil, contacts } = relayLayout(p);
      const [left, right] = [coil - 16, contacts[contacts.length - 1] + 26];
      return { w: right - left, h: 90, x: (left + right) / 2 };
    },
    labelAt: (_vertical, p, rotation) => coilLabel(relayLayout(p).coil, rotation),
    draw: (p) => {
      const { coil, contacts } = relayLayout(p);
      return `
        ${coilMarkup(coil)}
        ${contacts.map((x, k) => (p.contactType === 'SPDT' ? changeover : makeContact)(x, k + 1)).join('')}
        <path class="link" d="M ${coil + 14} 0 H ${contacts[contacts.length - 1] - 4}" />`;
    },
  },
  // Pins: A1, A2, then per pole its line and load side: 1–2, 3–4, 5–6, 7–8
  // (L1–T1, L2–T2, L3–T3, and a fourth pole).
  contactor: {
    name: 'Contactor (AC)',
    letter: 'Q',
    category: 'switches',
    group: 'Relays',
    pins: (p) => [
      { x: -60, y: -40 },
      { x: -60, y: 40 },
      ...poleXs(p).flatMap((x) => [{ x, y: -40 }, { x, y: 40 }]),
    ],
    props: {
      coilVoltage: { label: 'Coil voltage (rms)', unit: 'V', value: 120, min: 0.1 },
      coilResistance: { label: 'Coil impedance', unit: 'Ω', value: 2400, min: 0.1 },
      poles: { label: 'Poles', unit: '', value: 3, min: 1, max: 4 },
      maxCurrent: { label: 'Contact rating', unit: 'A', value: 16, min: 0.001 },
    },
    hit: (p) => {
      const right = poleXs(p)[contactorPoles(p) - 1] + 16;
      return { w: right + 76, h: 90, x: (right - 76) / 2 };
    },
    labelAt: (_vertical, _p, rotation) => coilLabel(-60, rotation),
    draw: (p) => {
      const xs = poleXs(p);
      return `
        ${coilMarkup(-60)}
        ${xs.map((x, k) => mainContact(x, 2 * k + 1)).join('')}
        <path class="link" d="M -46 0 H ${xs[xs.length - 1] - 5}" />`;
    },
  },
};

export const models: ModelDefs<'relay' | 'contactor'> = {
  relay,
  contactor,
};
