import type { Stamper } from '../models.ts';

// PN junctions (diodes, LEDs, zeners): the Shockley fits, Newton limiting
// and stamping a linearised junction.

export const THERMAL_VOLTAGE = 0.025852; // kT/q at 27 °C

// Shockley diode, I = Is·(e^(V/nVt) − 1), fitted so it passes exactly
// `maxCurrent` at `forwardVoltage`.
export const LED_IDEALITY = 2;

export function diode(props: { maxCurrent: number; forwardVoltage: number }) {
  const nVt = LED_IDEALITY * THERMAL_VOLTAGE;
  const is = props.maxCurrent / Math.expm1(props.forwardVoltage / nVt);
  const vcrit = nVt * Math.log(nVt / (Math.SQRT2 * is));
  const current = (v: number) => is * Math.expm1(Math.min(v / nVt, 80));
  return { nVt, is, vcrit, current };
}

// A diode fitted to pass 10 mA at its forward voltage, with an optional
// reverse breakdown at `vz` (zener): I = Is·(e^(v/nVt) − 1) − Ir·e^(−(v+vz)/nVtz).
export const DIODE_IREF = 0.01;

export const ZENER_KNEE = 0.005; // A drawn in breakdown right at the zener voltage

export const ZENER_NVT = 0.05; // V; sharpness of the breakdown knee

export function junction(forwardVoltage: number, n: number, vz?: number) {
  const nVt = n * THERMAL_VOLTAGE;
  const is = DIODE_IREF / Math.expm1(forwardVoltage / nVt);
  const vcrit = nVt * Math.log(nVt / (Math.SQRT2 * is));
  const vcritz = ZENER_NVT * Math.log(ZENER_NVT / (Math.SQRT2 * ZENER_KNEE));
  const ex = (u: number) => Math.exp(Math.min(u, 80));
  const current = (v: number) => is * Math.expm1(Math.min(v / nVt, 80)) - (vz === undefined ? 0 : ZENER_KNEE * ex(-(v + vz) / ZENER_NVT));
  const slope = (v: number) =>
    (is * ex(v / nVt)) / nVt + (vz === undefined ? 0 : (ZENER_KNEE * ex(-(v + vz) / ZENER_NVT)) / ZENER_NVT);
  // Newton limiting on whichever exponential is in play.
  const limit = (vnew: number, vold: number) => {
    if (vz === undefined || vnew >= 0) return limitJunction(vnew, vold, nVt, vcrit);
    return -limitJunction(-vnew - vz, -vold - vz, ZENER_NVT, vcritz) - vz;
  };
  return { current, slope, limit };
}

// SPICE's junction voltage limiting: stops Newton from jumping so far up the
// exponential that it overflows or oscillates.
export function limitJunction(vnew: number, vold: number, nVt: number, vcrit: number): number {
  if (vnew > vcrit && Math.abs(vnew - vold) > 2 * nVt) {
    if (vold > 0) {
      const arg = 1 + (vnew - vold) / nVt;
      return arg > 0 ? vold + nVt * Math.log(arg) : vcrit;
    }
    return nVt * Math.log(vnew / nVt);
  }
  return vnew;
}

// --- Linearised junctions ----------------------------------------------------
// Stamp a junction (diode(): an LED-style fit) from node a to c, keeping its
// operating point in `vs[k]` between iterations.
export function stampJunction(s: Stamper, vs: number[], k: number, a: number, c: number, d: ReturnType<typeof diode>) {
  const v = s.v(a) - s.v(c);
  const vd = limitJunction(v, vs[k] ?? 0, d.nVt, d.vcrit);
  if (Math.abs(vd - v) > 1e-6) s.converged = false;
  vs[k] = vd;
  const gd = (d.is * Math.exp(Math.min(vd / d.nVt, 80))) / d.nVt;
  s.conductance(a, c, gd);
  s.current(a, c, d.current(vd) - gd * vd);
}
