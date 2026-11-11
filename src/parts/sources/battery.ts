import { fmt, pct } from '../../sim/shared/readout.ts';
import { source, sourceThermal } from '../../sim/shared/sources.ts';
import { formatSI } from '../../units.ts';
import type { Lines, ModelDefs } from '../../sim/models.ts';
import type { PartDefs } from '../defs.ts';

// The values each of these parts carries: what the properties panel edits
// and the simulator reads (gathered into PropsByType in src/types.ts).
export interface PartProps {
  // `charge` is the state of charge, 1 full .. 0 flat; it drains as the battery is used.
  battery: { voltage: number; internalResistance: number; maxCurrent: number; capacity: number; charge: number };
}

// Open-circuit voltage of a battery as a fraction of its rating, by state of
// charge: a gentle sag over most of its life, then a steep fall near empty,
// roughly like an alkaline cell.
const batteryCurve = (charge: number) => (charge >= 0.1 ? 0.75 + 0.25 * charge : 7.75 * charge);

export const defs: PartDefs<'battery'> = {
  battery: {
    name: 'Battery',
    letter: 'G',
    category: 'sources',
    pins: [{ x: -40, y: 0 }, { x: 40, y: 0 }], // +, −
    props: {
      voltage: { label: 'Voltage', unit: 'V', value: 9, min: 0 },
      internalResistance: { label: 'Internal resistance', unit: 'Ω', value: 0.5, min: 0 },
      maxCurrent: { label: 'Max current', unit: 'A', value: 1, min: 0.001 },
      capacity: { label: 'Capacity', unit: 'Ah', value: 0.5, min: 0.0001 },
      charge: { label: 'Charge', unit: '', value: 1, hidden: true },
    },
    tag: (p) => formatSI(p.voltage, 'V'),
    gauge: true,
    draw: () => `
      <path d="M -40 0 H -4 M -4 -14 V 14 M 4 0 H 40 M -16 -14 H -10 M -13 -17 V -11" />
      <path class="thick" d="M 4 -7 V 7" />`,
  },
};

export const models: ModelDefs<'battery'> = {
  // Its voltage follows its state of charge, which falls as it delivers
  // current: capacity is in amp-hours.
  battery: {
    ...source((p) => p.voltage * batteryCurve(p.charge)),
    // Current out of the + terminal, power delivered to the circuit.
    readout: (r, p) => [
      ...((r.ac
        ? [
            ['Voltage', fmt(r.v, 'V')],
            ['Current', `${fmt(r.irms, 'A')} rms`],
            ['Power', `${fmt(-r.pavg, 'W')} avg`],
          ]
        : [
            ['Voltage', fmt(r.v, 'V')],
            ['Current', fmt(-r.i, 'A')],
            ['Power', fmt(-r.p, 'W')],
          ]) as Lines),
      ['Charge', p.charge > 0 ? pct(p.charge) : 'flat'],
    ],
    level: (_, p) => p.charge,
    drain(el, r, dt) {
      const out = -r.i; // current delivered from the + terminal
      if (out <= 1e-6 || el.props.charge <= 0) return false;
      el.props.charge = Math.max(0, el.props.charge - (out * dt) / (el.props.capacity * 3600));
      return true;
    },
    thermal: sourceThermal,
    failure: { label: 'damaged', open: true },
  },
};
