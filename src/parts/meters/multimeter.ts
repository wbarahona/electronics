import { METER_MODE } from '../symbols.ts';
import { meterReading } from '../../sim/shared/meters.ts';
import { ohmic } from '../../sim/shared/resistance.ts';
import type { ModelDefs } from '../../sim/models.ts';
import type { PartDefs } from '../defs.ts';
import type { MeterMode } from '../../types.ts';

// The values each of these parts carries: what the properties panel edits
// and the simulator reads (gathered into PropsByType in src/types.ts).
export interface PartProps {
  // Meters: pin 0 is + (red lead), pin 1 is COM.
  voltmeter: { resistance: number; maxVoltage: number; mode: MeterMode };
  ammeter: { resistance: number; maxCurrent: number; mode: MeterMode };
}

// Indicating instrument (DIN EN 60617): a circle with the quantity's letter,
// + marking the red-lead pin.
const meterSymbol = (letter: string) => `
  <path d="M -40 0 H -14 M 14 0 H 40 M -30 -10 H -24 M -27 -13 V -7" />
  <circle r="14" />
  <text class="meter-letter upright" y="5" text-anchor="middle">${letter}</text>`;

export const defs: PartDefs<'voltmeter' | 'ammeter'> = {
  // Reads the voltage from + to COM: almost no current drawn.
  voltmeter: {
    name: 'Voltmeter',
    letter: 'P',
    category: 'meters',
    group: 'Multimeter',
    pins: [{ x: -40, y: 0 }, { x: 40, y: 0 }],
    props: {
      resistance: { label: 'Input resistance', unit: 'Ω', value: 10e6, min: 1000 },
      maxVoltage: { label: 'Max voltage', unit: 'V', value: 1000, min: 1 },
      mode: METER_MODE,
    },
    display: true,
    selector: 'mode',
    draw: () => meterSymbol('V'),
  },
  // Reads the current flowing in at + and out at COM: almost no voltage
  // dropped. An internal fuse protects it.
  ammeter: {
    name: 'Ammeter',
    letter: 'P',
    category: 'meters',
    group: 'Multimeter',
    pins: [{ x: -40, y: 0 }, { x: 40, y: 0 }],
    props: {
      resistance: { label: 'Internal resistance', unit: 'Ω', value: 0.05, min: 0.0001 },
      maxCurrent: { label: 'Fuse rating', unit: 'A', value: 10, min: 0.001 },
      mode: METER_MODE,
    },
    display: true,
    selector: 'mode',
    draw: () => meterSymbol('A'),
  },
};

export const models: ModelDefs<'voltmeter' | 'ammeter'> = {
  // Meters read DC or AC as their mode is set (see meterReading).
  voltmeter: {
    ...ohmic((p) => p.resistance, (r, p) => [['Reading', `${meterReading(r, p, 'V')} ${p.mode}`]]),
    reading: (r, p) => meterReading(r, p, 'V'),
    // Past its rating the input is destroyed almost at once.
    thermal: { load: (r, p) => Math.abs(r.v) / p.maxVoltage, tau: 0.05, limit: 1.2 },
    failure: { label: 'destroyed', open: true, display: 'ERR' },
  },
  ammeter: {
    ...ohmic((p) => p.resistance, (r, p) => [['Reading', `${meterReading(r, p, 'A')} ${p.mode}`]]),
    reading: (r, p) => meterReading(r, p, 'A'),
    // Its internal fuse.
    thermal: { load: (r, p) => Math.abs(r.i) / p.maxCurrent, tau: 0.05, limit: 1.5 },
    failure: { label: 'fuse blown', open: true, display: 'FUSE' },
  },
};
