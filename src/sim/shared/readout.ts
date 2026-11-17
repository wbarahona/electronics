import type { Lines, Result } from '../models.ts';
import { formatSI } from '../../units.ts';

// Formatting values and the standard voltage / current / power readout.

// Values below a nanounit are GMIN leakage, not real readings.
export const fmt = (v: number, unit: string) => formatSI(Math.abs(v) < 1e-9 ? 0 : v, unit);

export const basicReadout = (r: Result): Lines =>
  r.ac
    ? [
        ['Voltage', `${fmt(r.vrms, 'V')} rms`],
        ['Current', `${fmt(r.irms, 'A')} rms`],
        ['Power', `${fmt(Math.abs(r.pavg), 'W')} avg`],
      ]
    : [
        ['Voltage', fmt(Math.abs(r.v), 'V')],
        ['Current', fmt(Math.abs(r.i), 'A')],
        ['Power', fmt(Math.abs(r.p), 'W')],
      ];

export const pct = (x: number) => `${Math.round(x * 100)} %`;
