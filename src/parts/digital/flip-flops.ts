import { chip, type ChipPin, gateProps } from '../symbols.ts';
import { driveOutput, G_LOGIC_IN, G_LOGIC_OUT, HIGH_LEVEL, LOW_LEVEL } from '../../sim/shared/logic.ts';
import type { Element, ModelDef, ModelDefs, Stamper } from '../../sim/models.ts';
import type { LabelSpot, PartDefs } from '../defs.ts';
import type { LogicGate, PropsByType } from '../../types.ts';

// The values each of these parts carries: what the properties panel edits
// and the simulator reads (gathered into PropsByType in src/types.ts).
export interface PartProps {
  dff: LogicGate;
  jkff: LogicGate;
  tff: LogicGate;
}

// Flip-flops (DIN EN 60617-12): data inputs labelled with the dependency
// notation (1D, 1J, 1K, 1T) and the clock C1 with the ▷ dynamic-input marker
// (rising edge); asynchronous S on top and R below; Q, and Q̄ with the
// negation circle. Pins: the data/clock inputs, then S, R, Q, Q̄.
const ffLabel = (): LabelSpot => [44, -38, 'start'];

function flipFlop(name: string, title: string, inputs: [string, number][]) {
  const clockY = inputs.find(([n]) => n === 'C1')![1];
  // The clock's label starts after the ▷ marker.
  const pins: ChipPin[] = [
    ...inputs.map(([n, y]): ChipPin => [n === 'C1' ? '<tspan dx="5">C1</tspan>' : n, null, -40, y]),
    ['S', null, 0, -40],
    ['R', null, 0, 40],
    ['Q', null, 40, -20],
    ['<tspan text-decoration="overline">Q</tspan>', null, 40, 20],
  ];
  return {
    name,
    letter: 'K',
    category: 'digital' as const,
    group: 'Flip-flops',
    pins: pins.map(([, , x, y]) => ({ x, y })),
    props: gateProps,
    hit: { w: 80, h: 80 },
    labelAt: ffLabel,
    draw: () => `
      ${chip({ w: 30, h: 30 }, title, pins)}
      <path d="M -30 ${clockY - 4} L -24 ${clockY} L -30 ${clockY + 4}" />
      <circle class="dot-hollow" cx="33" cy="20" r="3" />`,
  };
}

// Edge-triggered flip-flop. Pins: the named inputs (one of them the clock C),
// then S, R, Q, Q̄. On each rising edge of C, Q becomes next(Q, inputs);
// S and R act at once, whatever the clock (R wins if both are high). Inputs
// and outputs are logic pins like a gate's, and it also updates one step after
// its inputs, so chained flip-flops (counters, dividers) ripple correctly.
function flipFlopModel(
  inputs: string[],
  next: (q: boolean, ins: Record<string, boolean>) => boolean,
): ModelDef<PropsByType['dff']> {
  const n = inputs.length;
  const [S, R, Q, QN] = [n, n + 1, n + 2, n + 3];
  const clock = inputs.indexOf('C');
  const levelOf = (v: number, supply: number, was: boolean) => (v > supply * HIGH_LEVEL ? true : v < supply * LOW_LEVEL ? false : was);
  const q = (el: Element<PropsByType['dff']>) => el.state.out ?? false;
  const outCurrent = (el: Element<PropsByType['dff']>, s: Stamper, pin: number, high: boolean) =>
    G_LOGIC_OUT * (s.v(el.nodes[pin]) - (high ? el.props.supply : 0));
  return {
    dynamic: true,
    grounded: true,
    stamp(el, s) {
      for (let k = 0; k <= R; k++) s.draw(el.nodes[k], [[el.nodes[k], G_LOGIC_IN]], 0);
      driveOutput(s, el.nodes[Q], q(el) ? el.props.supply : 0);
      driveOutput(s, el.nodes[QN], q(el) ? 0 : el.props.supply);
    },
    current: (el, s) => G_LOGIC_IN * s.v(el.nodes[0]),
    pinCurrents: (el, s) => [
      ...el.nodes.slice(0, R + 1).map((node) => G_LOGIC_IN * s.v(node)),
      outCurrent(el, s, Q, q(el)),
      outCurrent(el, s, QN, !q(el)),
    ],
    respond(el, _env, r) {
      // The first look only records the input levels: a clock that is already
      // high at power-up is not an edge.
      const first = el.state.ins === undefined;
      const was = el.state.ins ?? [];
      const ins = r.pinV.slice(0, R + 1).map((v, k) => levelOf(v, el.props.supply, was[k] ?? false));
      el.state.ins = ins;
      let out = q(el);
      if (ins[R]) out = false;
      else if (ins[S]) out = true;
      else if (!first && ins[clock] && !(was[clock] ?? false)) {
        el.state.edges = (el.state.edges ?? 0) + 1;
        out = next(out, Object.fromEntries(inputs.map((name, k) => [name, ins[k]])));
      }
      const changed = out !== q(el);
      el.state.out = out;
      return changed;
    },
    readout: (r) => {
      const ins = r.state.ins ?? [];
      return [
        ['Q', `${r.state.out ? 1 : 0} (Q̄ ${r.state.out ? 0 : 1})`],
        ['Inputs', inputs.map((name, k) => `${name} ${ins[k] ? 1 : 0}`).join(', ')],
        ['S / R', `${ins[S] ? 1 : 0} / ${ins[R] ? 1 : 0}`],
        ['Clock edges', String(r.state.edges ?? 0)],
      ];
    },
    thermal: {
      load: (r, p) => Math.max(Math.abs(r.pins[Q]), Math.abs(r.pins[QN])) / p.maxCurrent,
      tau: 0.2,
      limit: 1.5,
    },
    failure: { label: 'burnt out', open: true },
  };
}

export const defs: PartDefs<'dff' | 'jkff' | 'tff'> = {
  dff: flipFlop('D flip-flop', 'D', [['1D', -20], ['C1', 20]]),
  jkff: flipFlop('JK flip-flop', 'JK', [['1J', -20], ['C1', 0], ['1K', 20]]),
  tff: flipFlop('T flip-flop', 'T', [['1T', -20], ['C1', 20]]),
};

export const models: ModelDefs<'dff' | 'jkff' | 'tff'> = {
  // On a rising clock edge: D copies D; JK sets, resets, toggles or holds;
  // T toggles when T is 1.
  dff: flipFlopModel(['D', 'C'], (_q, i) => i.D),
  jkff: flipFlopModel(['J', 'C', 'K'], (q, i) => (i.J && i.K ? !q : i.J ? true : i.K ? false : q)),
  tff: flipFlopModel(['T', 'C'], (q, i) => (i.T ? !q : q)),
};
