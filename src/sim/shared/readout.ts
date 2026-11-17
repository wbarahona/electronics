import { getNorm } from '../../norm.ts';
import type { Lines, Result } from '../models.ts';
import { formatSI } from '../../units.ts';

// Formatting values and the standard voltage / current / power readout.

// Values below a nanounit are GMIN leakage, not real readings.
export const fmt = (v: number, unit: string) => formatSI(Math.abs(v) < 1e-9 ? 0 : v, unit);

// An airflow (given in m³/h) in the drawing standard's unit: m³/h (EU) or
// CFM, cubic feet per minute (US).
export function fmtAirflow(m3h: number): string {
  const [v, unit] = getNorm() === 'us' ? [m3h / CFM, 'CFM'] : [m3h, 'm³/h'];
  return `${v.toFixed(v < 10 ? 1 : 0)} ${unit}`;
}

const CFM = 1.699; // m³/h

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
