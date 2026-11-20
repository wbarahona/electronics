import type { Element, Lines, ModelDef, Result } from '../models.ts';
import { fmt } from './readout.ts';
import { R_SWITCH_ON } from './resistance.ts';

// Switches whose contacts are worked together by one handle (ganged poles, a
// selector): each pair of pins `closed` gives is joined through R_SWITCH_ON,
// the rest are open. The part's current is the one into pin 0. `groups` lists
// the pins of each pole, which needn't be in the same circuit. The contacts
// heat by the largest current through any pin against `maxCurrent`.
export function contactsModel<P extends { maxCurrent: number }>(
  closed: (el: Element<P>) => [number, number][],
  groups: (p: P) => number[][],
  readout: (r: Result, p: P) => Lines,
): Pick<ModelDef<P>, 'stamp' | 'current' | 'pinCurrents' | 'groups' | 'extras' | 'readout' | 'thermal'> {
  const through = (el: Element<P>, v: (n: number) => number) => {
    const pins = el.nodes.map(() => 0);
    for (const [a, b] of closed(el)) {
      const i = (v(el.nodes[a]) - v(el.nodes[b])) / R_SWITCH_ON;
      pins[a] += i;
      pins[b] -= i;
    }
    return pins;
  };
  return {
    stamp(el, s) {
      for (const [a, b] of closed(el)) s.conductance(el.nodes[a], el.nodes[b], 1 / R_SWITCH_ON);
    },
    current: (el, s) => through(el, (n) => s.v(n))[0],
    pinCurrents: (el, s) => through(el, (n) => s.v(n)),
    groups,
    extras: (r) => r.pins,
    readout,
    thermal: { load: (r, p) => Math.max(0, ...r.pins.map(Math.abs)) / p.maxCurrent, tau: 0.2, limit: 1.5, rise: 40 }, // °C at its rating: contacts
  };
}

// The current through each pole, by the first pin of each group: on AC its RMS.
export const poleCurrents = (r: Result, firsts: number[]): Lines =>
  firsts.map((pin, k) => [
    firsts.length > 1 ? `Pole ${k + 1}` : 'Current',
    `${fmt(r.ac ? (r.extraRms[pin] ?? 0) : Math.abs(r.pins[pin] ?? 0), 'A')}${r.ac ? ' rms' : ''}`,
  ]);
