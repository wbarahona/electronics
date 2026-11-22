// A motor's shaft and what it drives, in units of the motor's rating: speed
// 1 = rated speed, torque 1 = rated torque, so power 1 = rated power. Only as
// much mechanics as a motor needs: one shaft, one load, no gears.
//
// The shaft obeys inertia × acceleration = motor torque − friction − load
// torque. Inertia is given as a time: how long rated torque takes to bring the
// bare motor to rated speed; a docked load adds its own `inertia` (× the
// motor's).

export type ShaftKind = 'conveyor' | 'pump' | 'flywheel' | 'generator';

// A docked load: `torque` (share of rated) is a conveyor's steady pull, or a
// pump's at rated speed; a flywheel takes none, only `inertia`. A generator
// (a dynamo) brakes the shaft by the power its circuit draws from it: `power`
// is what it would take at the motor's rated speed (W), its torque growing in
// proportion to speed (as a resistor's power grows with the square of the
// voltage across it); the motor turns that into `torque` at rated speed.
export interface ShaftLoad {
  kind: ShaftKind;
  torque: number;
  inertia: number;
  power?: number;
}

// What a load shows, written by the motor driving it: `turn` its speed (1 =
// rated, negative counter-clockwise), `rpm`, `torque` (N·m) and `power` (W)
// it takes, `work` the energy it has taken (J), `stored` a flywheel's
// kinetic energy (J).
export interface ShaftState {
  turn: number;
  rpm: number;
  torque: number;
  power: number;
  work: number;
  stored: number;
}

// A docked load as the part driving it sees it: a dynamo's drag in its terms
// (its torque at the driver's rated speed, for a driver of `ratedPower` W).
export const drivenBy = (load: ShaftLoad | null, ratedPower: number): ShaftLoad | null =>
  load?.kind === 'generator' ? { ...load, torque: (load.power ?? 0) / ratedPower } : load;

// A docked load before its motor has turned it.
export const STOPPED: ShaftState = { turn: 0, rpm: 0, torque: 0, power: 0, work: 0, stored: 0 };

const FRICTION = 0.05; // bearing and air drag, share of rated torque at rated speed
const MAX_SUBSTEP = 0.02; // largest speed change per substep, share of rated

// Advance the shaft's speed `s` over dt. `motor(s)` is the motor's torque at
// speed s; `inertia` the bare motor's (s); `load` what it drives, if
// anything. Returns the new speed and the load torque holding it back.
export function spin(
  s: number,
  motor: (s: number) => number,
  inertia: number,
  load: ShaftLoad | null,
  dt: number,
): { speed: number; load: number } {
  const h = dt / (inertia * (1 + (load?.inertia ?? 0)));
  // Small enough steps that a stiff motor (torque falling fast with speed)
  // can't overshoot.
  const n = Math.min(200, Math.ceil(h / MAX_SUBSTEP));
  let held = 0;
  for (let k = 0; k < n; k++) {
    const tm = motor(s) - FRICTION * s;
    if (load?.kind === 'conveyor') {
      // Like friction: it holds a stopped shaft up to its full torque, and
      // pulls against the motion while it moves, never backwards.
      if (s === 0 && Math.abs(tm) <= load.torque) {
        held = Math.abs(tm);
        continue;
      }
      const dir = s !== 0 ? Math.sign(s) : Math.sign(tm);
      const next = s + (h / n) * (tm - load.torque * dir);
      s = s !== 0 && Math.sign(next) !== Math.sign(s) ? 0 : next;
      held = load.torque;
    } else {
      held = load?.kind === 'pump' ? load.torque * s * Math.abs(s) : load?.kind === 'generator' ? load.torque * s : 0;
      s += (h / n) * (tm - held);
    }
  }
  return { speed: s, load: Math.abs(held) };
}

// The motor's own shaft output at speed s with motor torque tm: what's left
// after friction, in shares of rated power.
export const shaftOutput = (s: number, tm: number) => (tm - FRICTION * s) * s;

// Fill in a load's readout state: `turn` its signed speed (share of rated),
// `torque` the load torque (share of rated), for a motor of rated power
// `ratedPower` (W) at `ratedSpeed` (rpm), over dt.
export function loadState(
  prev: ShaftState | undefined,
  load: ShaftLoad,
  turn: number,
  torque: number,
  inertia: number,
  ratedPower: number,
  ratedSpeed: number,
  dt: number,
): ShaftState {
  const ratedTorque = ratedPower / ((ratedSpeed * 2 * Math.PI) / 60);
  const power = torque * Math.abs(turn) * ratedPower;
  return {
    turn,
    rpm: turn * ratedSpeed,
    torque: torque * ratedTorque,
    power,
    work: (prev?.work ?? 0) + power * dt,
    // ½·J·ω², with J from the inertia time: J·ω_rated = T_rated·inertia.
    stored: 0.5 * load.inertia * inertia * ratedPower * turn * turn,
  };
}
