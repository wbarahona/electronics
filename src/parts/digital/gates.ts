import { driveOutput, G_LOGIC_IN, G_LOGIC_OUT, HIGH_LEVEL, LOW_LEVEL } from '../../sim/shared/logic.ts';
import { fmt } from '../../sim/shared/readout.ts';
import { gateProps } from '../symbols.ts';
import type { Element, ModelDef, ModelDefs, Stamper } from '../../sim/models.ts';
import type { LabelSpot, PartDefs } from '../defs.ts';
import type { LogicGate, PropsByType } from '../../types.ts';

// The values each of these parts carries: what the properties panel edits
// and the simulator reads (gathered into PropsByType in src/types.ts).
export interface PartProps {
  // Logic parts run on a built-in supply (`supply`, 5 V) referenced to Ground.
  and: LogicGate;
  or: LogicGate;
  not: LogicGate;
  nand: LogicGate;
  nor: LogicGate;
  xor: LogicGate;
  xnor: LogicGate;
}

const gateLabel = (vertical: boolean): LabelSpot => (vertical ? [36, 4, 'start'] : [0, -36, 'middle']);

// The same gates the US way (ANSI / IEEE 91 distinctive shapes): AND a D, OR
// a shield, XOR a shield with a second back, NOT a triangle; the circle on the
// output for inversion as in the EU symbols, on the same pins.
type Shape = 'and' | 'or' | 'xor' | 'not';
const SHAPES: Record<Shape, { body: string; inputs: string }> = {
  and: { body: 'M -20 -24 H -4 A 24 24 0 0 1 -4 24 H -20 Z', inputs: 'M -40 -20 H -20 M -40 20 H -20' },
  or: { body: 'M -20 -24 C -2 -24 10 -14 20 0 C 10 14 -2 24 -20 24 Q -10 0 -20 -24 Z', inputs: 'M -40 -20 H -18.5 M -40 20 H -18.5' },
  xor: {
    body: 'M -16 -24 C 0 -24 11 -14 20 0 C 11 14 0 24 -16 24 Q -6 0 -16 -24 Z M -22 24 Q -12 0 -22 -24',
    inputs: 'M -40 -20 H -20.5 M -40 20 H -20.5',
  },
  not: { body: 'M -20 -18 V 18 L 20 0 Z', inputs: 'M -40 0 H -20' },
};

const usGate = (shape: Shape, inverted: boolean) => () => `
      <path d="${SHAPES[shape].inputs} M ${inverted ? 28 : 20} 0 H 40" />
      <path d="${SHAPES[shape].body}" />
      ${inverted ? '<circle cx="24" r="4" />' : ''}`;

function gate(name: string, qualifier: string, inverted: boolean, inputs: 1 | 2, shape: Shape) {
  const half = inputs === 2 ? 28 : 18;
  return {
    name,
    letter: 'K',
    us: { letter: 'U', draw: usGate(shape, inverted) },
    category: 'digital' as const,
    group: 'Gates',
    pins: inputs === 2 ? [{ x: -40, y: -20 }, { x: -40, y: 20 }, { x: 40, y: 0 }] : [{ x: -40, y: 0 }, { x: 40, y: 0 }],
    props: gateProps,
    hit: { w: 80, h: half * 2 },
    labelAt: gateLabel,
    draw: () => `
      <path d="${inputs === 2 ? 'M -40 -20 H -20 M -40 20 H -20' : 'M -40 0 H -20'} M ${inverted ? 28 : 20} 0 H 40" />
      <rect x="-20" y="${-half}" width="40" height="${half * 2}" />
      ${inverted ? '<circle cx="24" r="4" />' : ''}
      <text class="gate-text upright" y="5" text-anchor="middle">${qualifier}</text>`,
  };
}

function gateModel(fn: (a: boolean, b: boolean) => boolean, inputs: 1 | 2 = 2): ModelDef<PropsByType['and']> {
  const outPin = inputs;
  const target = (el: Element<PropsByType['and']>) => (el.state.out ? el.props.supply : 0);
  const outCurrent = (el: Element<PropsByType['and']>, s: Stamper) => G_LOGIC_OUT * (s.v(el.nodes[outPin]) - target(el));
  const level = (v: number, supply: number, was: boolean) => (v > supply * HIGH_LEVEL ? true : v < supply * LOW_LEVEL ? false : was);
  return {
    dynamic: true,
    grounded: true,
    stamp(el, s) {
      for (let k = 0; k < inputs; k++) s.draw(el.nodes[k], [[el.nodes[k], G_LOGIC_IN]], 0);
      driveOutput(s, el.nodes[outPin], target(el));
    },
    current: (el, s) => G_LOGIC_IN * s.v(el.nodes[0]),
    pinCurrents: (el, s) => [...el.nodes.slice(0, inputs).map((n) => G_LOGIC_IN * s.v(n)), outCurrent(el, s)],
    respond(el, _env, r) {
      const ins = r.pinV.slice(0, inputs).map((v, k) => level(v, el.props.supply, el.state.ins?.[k] ?? false));
      el.state.ins = ins;
      const out = fn(ins[0], ins[1] ?? false);
      const changed = out !== (el.state.out ?? false);
      el.state.out = out;
      return changed;
    },
    readout: (r, p) => {
      const ins = r.state.ins ?? [];
      const names = inputs === 2 ? ['A', 'B'] : ['A'];
      return [
        ['Inputs', names.map((n, k) => `${n} ${ins[k] ? 1 : 0}`).join(', ')],
        ['Output', `${r.state.out ? 1 : 0} (${fmt(r.pinV[outPin], 'V')})`],
        ['Output current', fmt(Math.abs(r.pins[outPin]), 'A')],
        ['Supply', fmt(p.supply, 'V')],
      ];
    },
    thermal: { load: (r, p) => Math.abs(r.pins[outPin]) / p.maxCurrent, tau: 0.2, limit: 1.5, rise: 30 }, // °C at its rating: logic output
    failure: { label: 'burnt out', open: true },
  };
}

export const defs: PartDefs<'and' | 'or' | 'not' | 'nand' | 'nor' | 'xor' | 'xnor'> = {
  and: {
    ...gate('AND', '&amp;', false, 2, 'and'),
    info: {
      summary: 'Logic AND: its output is 1 only when both inputs are 1.',
      about: {
        how: 'A logic gate whose output is 1 only when all its inputs are 1.',
        sim: 'Logic gates run on a built-in 5 V supply against 0 V: inputs read 1 above 55 % of it and 0 below 45 % (keeping their last level between), barely loading the signal; outputs drive real loads through 25 Ω. Each gate switches one step after its inputs, as real gates have a delay.',
        uses: 'Combining conditions: this AND that.',
      },
    },
  },
  or: {
    ...gate('OR', '≥1', false, 2, 'or'),
    info: {
      summary: 'Logic OR: its output is 1 when either input is 1, or both.',
      about: {
        how: 'A logic gate whose output is 1 when any input is 1.',
        sim: 'As the AND gate: a built-in 5 V logic supply, inputs with hysteresis, 25 Ω outputs, and a one-step delay.',
        uses: 'Combining conditions: this OR that.',
      },
    },
  },
  not: {
    ...gate('NOT', '1', true, 1, 'not'),
    info: {
      summary: 'Logic NOT (an inverter): its output is the opposite of its input.',
      about: {
        how: 'A logic gate with one input whose output is always the opposite.',
        sim: 'As the AND gate: a built-in 5 V logic supply, inputs with hysteresis, a 25 Ω output, and a one-step delay. Chain an odd number into a loop and it oscillates.',
        uses: 'Inverting a signal, and ring oscillators.',
      },
    },
  },
  nand: {
    ...gate('NAND', '&amp;', true, 2, 'and'),
    info: {
      summary: 'Logic NAND: its output is 0 only when both inputs are 1, the opposite of AND.',
      about: {
        how: 'A logic gate whose output is 0 only when all its inputs are 1: AND followed by NOT. Any logic can be built from NAND gates alone.',
        sim: 'As the AND gate: a built-in 5 V logic supply, inputs with hysteresis, 25 Ω outputs, and a one-step delay.',
        uses: 'Latches, and building other gates.',
      },
    },
  },
  nor: {
    ...gate('NOR', '≥1', true, 2, 'or'),
    info: {
      summary: 'Logic NOR: its output is 1 only when both inputs are 0, the opposite of OR.',
      about: {
        how: 'A logic gate whose output is 1 only when all its inputs are 0: OR followed by NOT.',
        sim: 'As the AND gate: a built-in 5 V logic supply, inputs with hysteresis, 25 Ω outputs, and a one-step delay.',
        uses: 'Set–reset latches, and building other gates.',
      },
    },
  },
  xor: {
    ...gate('XOR', '=1', false, 2, 'xor'),
    info: {
      summary: 'Logic XOR: its output is 1 when its inputs differ.',
      about: {
        how: 'A logic gate whose output is 1 when its inputs differ.',
        sim: 'As the AND gate: a built-in 5 V logic supply, inputs with hysteresis, 25 Ω outputs, and a one-step delay.',
        uses: 'Adders, parity, and comparing two bits.',
      },
    },
  },
  xnor: {
    ...gate('XNOR', '=1', true, 2, 'xor'),
    info: {
      summary: 'Logic XNOR: its output is 1 when its inputs are the same.',
      about: {
        how: 'A logic gate whose output is 1 when its inputs are the same.',
        sim: 'As the AND gate: a built-in 5 V logic supply, inputs with hysteresis, 25 Ω outputs, and a one-step delay.',
        uses: 'Equality checks.',
      },
    },
  },
};

export const models: ModelDefs<'and' | 'or' | 'not' | 'nand' | 'nor' | 'xor' | 'xnor'> = {
  and: gateModel((a, b) => a && b),
  or: gateModel((a, b) => a || b),
  not: gateModel((a) => !a, 1),
  nand: gateModel((a, b) => !(a && b)),
  nor: gateModel((a, b) => !(a || b)),
  xor: gateModel((a, b) => a !== b),
  xnor: gateModel((a, b) => a === b),
};
