import type { MeterMode } from '../../types.ts';
import type { Result } from '../models.ts';
import { fmt } from './readout.ts';

// What a meter reads: the DC average or the true RMS of the AC part.

// DC: the average, signed (negative with the leads reversed), so a sine reads
// 0. AC: the true RMS of what's left once the average is taken out, so a
// battery reads 0 and a rectifier's output reads just its ripple. Like a
// meter on the range for the whole signal, either part reads 0 when it's
// under 0.5 % of the signal's RMS.
export const METER_RESOLUTION = 0.005;

export const meterValue = (r: Result, p: { mode: MeterMode }, unit: 'V' | 'A') => {
  const [avg, rms] = unit === 'V' ? [r.vavg, r.vrms] : [r.iavg, r.irms];
  const floor = METER_RESOLUTION * rms;
  if (p.mode === 'DC') return Math.abs(avg) < floor ? 0 : avg;
  const ac = Math.sqrt(Math.max(0, rms * rms - avg * avg));
  return ac < floor ? 0 : ac;
};

export const meterReading = (r: Result, p: { mode: MeterMode }, unit: 'V' | 'A') => fmt(meterValue(r, p, unit), unit);
