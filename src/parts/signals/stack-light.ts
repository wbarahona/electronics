import { LIGHT_COLORS, type PartDefs } from '../defs.ts';
import { pinText } from '../symbols.ts';
import type { Element, ModelDef, ModelDefs, Result, Stamper } from '../../sim/models.ts';
import type { PropsByType } from '../../types.ts';

// The values each of these parts carries: what the properties panel edits
// and the simulator reads (gathered into PropsByType in src/types.ts).
export interface PartProps {
  // Red, amber and green lamps stacked on a common pin (pins R, A, G, common).
  stackLight: { ratedVoltage: number; ratedPower: number };
}

// --- Lamps on a common pin: stack light ---------------------------------------

// Lamps (V²/P at their rating) from pins 0 .. n−1 to the common pin n, each
// shining by its own average power.
function lampGroup<P extends { ratedVoltage: number; ratedPower: number }>(names: string[]): ModelDef<P> {
  const n = names.length;
  const r = (p: P) => p.ratedVoltage ** 2 / p.ratedPower;
  const currents = (el: Element<P>, s: Stamper) => names.map((_, k) => (s.v(el.nodes[k]) - s.v(el.nodes[n])) / r(el.props));
  // Each lamp's power as a fraction of its rating (RMS current on AC).
  const levels = (res: Result, p: P) =>
    names.map((_, k) => ((res.ac ? res.extraRms[k] ?? 0 : Math.abs(res.pins[k])) ** 2 * r(p)) / p.ratedPower);
  return {
    stamp(el, s) {
      for (let k = 0; k < n; k++) s.conductance(el.nodes[k], el.nodes[n], 1 / r(el.props));
    },
    current: (el, s) => currents(el, s).reduce((sum, i) => sum + i, 0),
    pinCurrents(el, s) {
      const i = currents(el, s);
      return [...i, -i.reduce((sum, x) => sum + x, 0)];
    },
    extras: (res) => res.pins.slice(0, n),
    segments: levels,
    brightness: (res, p) => Math.max(...levels(res, p)),
    readout: (res, p) => [['Lit', levels(res, p).flatMap((l, k) => (l > 0.05 ? [names[k]] : [])).join(', ') || 'none']],
    thermal: { load: (res, p) => Math.max(...levels(res, p)), tau: 0.3, limit: 1.5 },
    failure: { label: 'filament blown', open: true },
  };
}

export const defs: PartDefs<'stackLight'> = {
  // Red, amber and green lamps stacked, each from its pin to a common bus.
  stackLight: {
    name: 'Stack light',
    letter: 'P',
    category: 'signals',
    group: 'Indicators',
    pins: [{ x: -40, y: -40 }, { x: -40, y: 0 }, { x: -40, y: 40 }, { x: 40, y: 60 }],
    props: {
      ratedVoltage: { label: 'Rated voltage', unit: 'V', value: 24, min: 0.001 },
      ratedPower: { label: 'Rated power (each)', unit: 'W', value: 2, min: 0.001 },
    },
    hit: { w: 80, h: 140 },
    labelAt: () => [28, -52, 'start'],
    draw: () => `
      <path d="M -40 -40 H -14 M -40 0 H -14 M -40 40 H -14 M 14 -40 H 24 M 14 0 H 24 M 14 40 H 24 M 24 -40 V 60 H 40" />
      ${(['red', 'yellow', 'green'] as const)
        .map((c, k) => {
          const y = -40 + 40 * k;
          return `<rect class="rgb-off" x="-14" y="${y - 14}" width="28" height="28" rx="5" style="fill: ${LIGHT_COLORS[c]}" />
            <rect class="seg-lit rgb-lit" data-seg="${k}" x="-14" y="${y - 14}" width="28" height="28" rx="5" style="opacity: 0; fill: ${LIGHT_COLORS[c]}" />
            <rect x="-14" y="${y - 14}" width="28" height="28" rx="5" />`;
        })
        .join('')}
      ${pinText('R', -37, -44)}${pinText('A', -37, -4)}${pinText('G', -37, 36)}`,
  },
};

export const models: ModelDefs<'stackLight'> = {
  stackLight: lampGroup<PropsByType['stackLight']>(['red', 'amber', 'green']),
};
