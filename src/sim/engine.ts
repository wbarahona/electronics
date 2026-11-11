import { pinsOf } from '../components.ts';
import type { Circuit } from '../model.ts';
import { pinKey, type Nets } from '../nets.ts';
import { solve } from './linear.ts';
import { MODELS, type Element, type Env, type PartState, type Result, type Stamper } from './models.ts';

// Modified Nodal Analysis, stepped through time.
//
// Unknowns are the voltage of every net plus the current of every branch
// (voltage sources). Each step, every part stamps its equations into A·x = b
// and the system is solved; non-linear parts are re-linearised and solved
// again until the answer settles (Newton-Raphson). A DC circuit simply gives
// the same answer every step; time-dependent parts make it change.
//
// The common reference is 0 V. Ground parts tie their net firmly to it (all
// grounds are one node). A separate circuit without a Ground gets one net tied
// to it instead, a battery's − terminal if it has one: a single tie carries no
// current, so it only fixes absolute voltages. Logic parts are tied to 0 V
// through their own built-in supply, so a circuit of logic alone needs no
// other tie (and must not get one: the net picked could be a signal); one
// that also has a battery ties its − terminal as firmly as a Ground, so the
// battery and the logic share the same 0 V. Every net also leaks to the reference through a tiny
// conductance (GMIN), as in SPICE, so nets left floating (open switches, loose
// parts) still have a solution.
//
// Parts heat up toward their load (1 = at their rating) with their own time
// constant, and fail once their heat passes their limit. Short spikes are
// survivable; sustained overload is not. While anything is still heating or
// cooling, `heating` is set so time keeps running even in a DC circuit.
//
// For AC, every part also keeps running averages of v, i, v², i² and power
// over AVERAGE_TAU of simulated time, giving average and RMS readings. Those
// of v, i, v² and i² (what meters read) pass through two stages, so little of
// the waveform leaks through: a 50 Hz sine averages to within 0.1 % of 0.
//
// Batteries drain as they deliver current; while any is draining, `draining`
// is set so time keeps running, and in a DC circuit the solution is refreshed
// as their voltage sags.
//
// Re-solving after an edit doesn't move time on: what capacitors and
// inductors hold is only updated by real time steps, so dragging parts around
// (even while paused) never charges anything.
//
// Some parts sense their surroundings (an LDR the light from nearby lamps and
// LEDs). They respond after each solved step, so the coupling runs one step
// behind, which at these step sizes is invisible.
//
// The time step is TIME_STEP normally, and grows when the simulation is run
// fast so a frame needs about STEPS_PER_ADVANCE steps, but never beyond what
// the parts can follow (a twentieth of an AC period). Each advance gets a
// compute budget; time it can't fit is dropped, so the page stays responsive
// and the simulation simply runs slower than asked.

export const TIME_STEP = 1e-4; // s
// Step used when re-solving without moving time on: so short that capacitors
// and inductors simply hold what they have.
const HOLD_STEP = 1e-9; // s
const MAX_TIME_STEP = 0.01; // s
const GMIN = 1e-12;
const MAX_ITERATIONS = 100;
const STEPS_PER_ADVANCE = 2000;
const BUDGET_MS = 10;
const AVERAGE_TAU = 0.1; // s
// Light from a glowing part falls off with distance (world units, a grid
// square is 20): at LIGHT_REACH it's half as strong as right next to it.
const LIGHT_REACH = 60;
const G_GROUND = 1e6; // S; how firmly Ground holds its net at 0 V
const G_TIE = 1; // S; the tie for a circuit that has no Ground
const MAX_SETTLE = 20; // rounds of logic settling after an edit

// Newton is done when every unknown has stopped moving: within an absolute
// floor plus a relative tolerance. SPICE's default relative tolerance is
// 1e-3; this is ten times tighter, yet loose enough not to chase rounding
// noise (asking for 1e-6 left a bridge rectifier cycling forever 3e-5 V apart).
const ABS_TOL = 1e-6;
const REL_TOL = 1e-4;
const settled = (prev: Float64Array, next: Float64Array) =>
  next.every((v, i) => Math.abs(v - prev[i]) <= ABS_TOL + REL_TOL * Math.abs(v));

export type Engine = ReturnType<typeof createEngine>;

export function createEngine(circuit: Circuit) {
  let elements: Element[] = [];
  let refs: [number, number][] = []; // [net, conductance] tying circuits to 0 V
  let nodeCount = 0;
  let size = 0;
  let x = new Float64Array(0);
  let t = 0; // simulated time, s
  let pending = 0; // time asked for but shorter than a step, carried over
  // Per-part memory (heat, last diode voltage, later capacitor charge), kept by
  // part id so it survives rebuilds while the circuit is being edited.
  const state = new Map<string, PartState>();
  const engine = {
    results: new Map<string, Result>(),
    error: null as string | null,
    dynamic: false,
    ac: false, // driven by an alternating source: readouts show RMS
    heating: false,
    draining: false,
    // Called after every time step (with the time reached), for instruments
    // that record what happens between frames.
    onStep: null as ((t: number) => void) | null,
    rebuild,
    advance,
    reset,
    get time() {
      return t;
    },
  };

  // A and b are null when only reading the solution (after it converged).
  function stamper(A: Float64Array[] | null, b: Float64Array | null, xs: Float64Array, dt: number): Stamper {
    return {
      t,
      dt,
      // A non-linear model clears this when it had to hold back its operating
      // point; the iteration can't be called converged until none do.
      converged: true,
      v: (n) => xs[n],
      x: (k) => xs[k],
      // Conductance g between nodes a and b.
      conductance(a, c, g) {
        A![a][a] += g;
        A![c][c] += g;
        A![a][c] -= g;
        A![c][a] -= g;
      },
      // Fixed current i flowing through the part from a to c.
      current(a, c, i) {
        b![a] -= i;
        b![c] += i;
      },
      // V(a) − V(c) = volts; unknown k carries its current from a through it to c.
      voltage(a, c, k, volts) {
        A![a][k] += 1;
        A![c][k] -= 1;
        A![k][a] += 1;
        A![k][c] -= 1;
        b![k] = volts;
      },
      // Pin an unused branch current to zero (a failed source).
      idle(k) {
        A![k][k] += 1;
      },
      // The part draws Σ g·V(n) + i0 out of `node` (a linearised current that
      // depends on several nodes: transistors).
      draw(node, terms, i0) {
        for (const [n, g] of terms) A![node][n] += g;
        b![node] -= i0;
      },
    };
  }

  // Forget all simulation state and start time over, e.g. when a different
  // circuit is loaded (whose part ids may repeat the old ones).
  function reset() {
    state.clear();
    engine.results.clear();
    t = 0;
    pending = 0;
  }

  // Re-read the circuit after any edit. `nets` comes from buildNets().
  function rebuild({ nets, netOf }: Nets) {
    nodeCount = nets.length;
    let next = nodeCount;
    elements = circuit.components.map((c) => {
      const model = MODELS[c.type];
      const branches = model.branches?.(c.props) ?? 0;
      if (!state.has(c.id)) state.set(c.id, {});
      const el: Element = {
        id: c.id,
        props: c.props,
        model,
        broken: !!c.broken,
        // A failed part that now conducts nothing.
        open: !!c.broken && !!model.failure?.open,
        nodes: pinsOf(c.type, c.props).map((_, i) => netOf.get(pinKey(c.id, i))!),
        branch: branches ? next : -1,
        state: state.get(c.id)!,
      };
      next += branches;
      // A replaced part starts cold.
      if (el.state.broken && !el.broken) el.state.heat = 0;
      el.state.broken = el.broken;
      return el;
    });
    size = next;
    refs = referenceNets();
    for (const id of state.keys()) if (!circuit.get(id)) state.delete(id);
    engine.dynamic = elements.some((el) => el.model.dynamic);
    engine.ac = elements.some((el) => el.model.alternating && !el.open);
    x = new Float64Array(size);
    step(HOLD_STEP, false);
    // Let sensing parts settle on what they now see, then solve with that.
    // Let sensing and logic parts settle on what they now see, solving again
    // after each round, until nothing changes (a logic loop that never
    // settles, like an oscillator, stops after MAX_SETTLE rounds).
    if (elements.some((el) => el.model.respond)) {
      for (let round = 0; round < MAX_SETTLE; round++) {
        const changed = respond(null);
        step(HOLD_STEP, false);
        if (!changed) break;
      }
    }
  }

  // Light reaching a part from every glowing part, fading with distance.
  const env: Env = {
    get time() {
      return t;
    },
    light(el) {
      const at = circuit.part(el.id);
      if (!at) return 0;
      let light = 0;
      for (const other of elements) {
        const r = engine.results.get(other.id);
        const from = circuit.part(other.id);
        if (other === el || !other.model.brightness || !r || !from) continue;
        const d = Math.hypot(from.x - at.x, from.y - at.y);
        light += other.model.brightness(r, other.props) / (1 + (d / LIGHT_REACH) ** 2);
      }
      return light;
    },
  };

  // Let parts react to their surroundings: over dt seconds, or at once (null).
  function respond(dt: number | null): boolean {
    let changed = false;
    for (const el of elements) {
      const r = engine.results.get(el.id);
      if (el.model.respond && !el.open && r && el.model.respond(el, env, r, dt)) changed = true;
    }
    return changed;
  }

  // Group nets joined through parts into separate circuits and pick one net in
  // each to tie to the reference, preferring a battery's − terminal.
  function referenceNets() {
    const parent = Array.from({ length: nodeCount }, (_, n) => n);
    const find = (n: number): number => (parent[n] === n ? n : (parent[n] = find(parent[n])));
    for (const el of elements) {
      // Pins of a part are connected inside it, unless it says otherwise.
      const groups = typeof el.model.groups === 'function' ? el.model.groups(el.props) : el.model.groups;
      for (const group of groups ?? [el.nodes.map((_, k) => k)]) {
        for (const k of group.slice(1)) parent[find(el.nodes[k])] = find(el.nodes[group[0]]);
      }
    }
    const grounded = new Set<number>(); // circuits with a Ground: tied already
    const logic = new Set<number>(); // circuits whose parts return current via 0 V
    for (const el of elements) {
      if (el.model.groundTie) grounded.add(find(el.nodes[0]));
      if (el.model.grounded) logic.add(find(el.nodes[0]));
    }
    const chosen = new Map<number, number>(); // circuit root -> reference net
    const battery = new Set<number>(); // circuits whose reference is a battery's −
    for (const el of elements) {
      if (circuit.part(el.id)?.type === 'battery' && !chosen.has(find(el.nodes[1]))) {
        chosen.set(find(el.nodes[1]), el.nodes[1]);
        battery.add(find(el.nodes[1]));
      }
    }
    for (let n = 0; n < nodeCount; n++) if (!chosen.has(find(n))) chosen.set(find(n), n);
    return [...chosen]
      .filter(([root]) => !grounded.has(root) && (!logic.has(root) || battery.has(root)))
      .map(([root, n]): [number, number] => [n, logic.has(root) ? G_GROUND : G_TIE]);
  }

  // Solve the circuit at time t, the end of a step of length dt. With `commit`
  // the step really happened, so energy stores take on their new values.
  function step(dt: number, commit = true): boolean {
    const nonlinear = elements.some((el) => el.model.nonlinear);
    for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
      const A = Array.from({ length: size }, () => new Float64Array(size));
      const b = new Float64Array(size);
      const s = stamper(A, b, x, dt);
      for (let n = 0; n < nodeCount; n++) A[n][n] += GMIN;
      for (const [n, g] of refs) A[n][n] += g;
      for (const el of elements) {
        if (!el.open) el.model.stamp(el, s);
        else if (el.branch >= 0) s.idle(el.branch);
      }
      const next = solve(A, b);
      if (!next) return fail('The circuit has no single solution (check for loops of ideal sources).');
      const done = !nonlinear || (iter > 0 && s.converged && settled(x, next));
      x = next;
      if (done) return finish(dt, commit);
    }
    return fail('The simulation did not converge.');
  }

  function finish(dt: number, commit: boolean): boolean {
    const s = stamper(null, null, x, dt);
    engine.results.clear();
    for (const el of elements) {
      const v = el.nodes.length > 1 ? s.v(el.nodes[0]) - s.v(el.nodes[1]) : s.v(el.nodes[0]);
      // Current first: accept() moves an energy store on to this step's value.
      const i = el.open ? 0 : el.model.current(el, s);
      const pins = el.open ? el.nodes.map(() => 0) : (el.model.pinCurrents?.(el, s) ?? [i, -i]);
      const pinV = el.nodes.map((n) => s.v(n));
      // Power taken in: the sum over pins of voltage × current in.
      const p = el.open ? 0 : (el.model.power?.(el, s) ?? pins.reduce((sum, ik, k) => sum + ik * pinV[k], 0));
      if (commit && !el.open) el.model.accept?.(el, s);
      const r: Result = {
        v, i, p, vavg: 0, iavg: 0, vrms: 0, irms: 0, pavg: 0, heat: el.state.heat ?? 0, load: 0, ac: engine.ac,
        pins, pinV, state: el.state, extraRms: [],
      };
      r.load = el.model.thermal && !el.broken ? el.model.thermal.load(r, el.props) : 0;
      r.level = el.model.level?.(r, el.props);
      average(el, r, dt);
      engine.results.set(el.id, r);
    }
    engine.error = null;
    checkHeating();
    return true;
  }

  // Fold this step into the part's running averages. In a DC circuit nothing
  // changes over time, so the averages are simply the present values.
  function average(el: Element, r: Result, dt: number) {
    const k = engine.dynamic ? 1 - Math.exp(-dt / AVERAGE_TAU) : 1;
    const extras = el.model.extras?.(r) ?? [];
    const m = (el.state.avg ??= {
      v: [r.v, r.v], i: [r.i, r.i], v2: [r.v * r.v, r.v * r.v], i2: [r.i * r.i, r.i * r.i],
      p: r.p, x2: extras.map((x) => x * x),
    });
    const smooth = (s: [number, number], x: number) => {
      s[0] += k * (x - s[0]);
      s[1] += k * (s[0] - s[1]);
      return s[1];
    };
    r.vavg = smooth(m.v, r.v);
    r.iavg = smooth(m.i, r.i);
    r.vrms = Math.sqrt(Math.max(0, smooth(m.v2, r.v * r.v)));
    r.irms = Math.sqrt(Math.max(0, smooth(m.i2, r.i * r.i)));
    m.p += k * (r.p - m.p);
    extras.forEach((x, j) => (m.x2[j] = (m.x2[j] ?? x * x) + k * (x * x - (m.x2[j] ?? x * x))));
    r.pavg = m.p;
    r.extraRms = m.x2.map(Math.sqrt);
  }

  // Let every part's heat follow its load for `dt` seconds. Returns the ids of
  // parts that failed.
  function heatUp(dt: number): string[] {
    const failed: string[] = [];
    for (const el of elements) {
      const thermal = el.model.thermal;
      const r = engine.results.get(el.id);
      if (!thermal || el.broken || !r) continue;
      const h = el.state.heat ?? 0;
      el.state.heat = r.load + (h - r.load) * Math.exp(-dt / thermal.tau);
      r.heat = el.state.heat;
      if (el.state.heat > thermal.limit) failed.push(el.id);
    }
    checkHeating();
    return failed;
  }

  // Let batteries drain for `dt` seconds at their present current.
  function drain(dt: number) {
    let draining = false;
    for (const el of elements) {
      const r = engine.results.get(el.id);
      if (el.model.drain && !el.open && r && el.model.drain(el, r, dt)) {
        draining = true;
        r.level = el.model.level?.(r, el.props);
      }
    }
    engine.draining = draining;
  }

  function checkHeating() {
    engine.heating = elements.some((el) => {
      const r = engine.results.get(el.id);
      return !!el.model.thermal && !el.broken && !!r && Math.abs(r.load - (el.state.heat ?? 0)) > 0.005;
    });
  }

  function fail(message: string): boolean {
    engine.results.clear();
    engine.error = message;
    return false;
  }

  // Move simulated time forward by `seconds`. Returns the ids of parts that
  // failed; stepping stops there, since the circuit has changed. Without
  // time-dependent parts the solution can't change, so only heat moves.
  // Otherwise time goes in whole steps: in slow motion one call can be shorter
  // than a step, so the remainder carries over to the next call.
  function advance(seconds: number): string[] {
    if (!engine.dynamic) {
      t += seconds;
      if (engine.error) return [];
      const failed = heatUp(seconds);
      drain(seconds);
      // A draining battery's voltage sags, so refresh the solution.
      if (engine.draining) step(HOLD_STEP, false);
      return failed;
    }
    pending += seconds;
    let limit = MAX_TIME_STEP;
    for (const el of elements) if (el.model.maxStep && !el.open) limit = Math.min(limit, el.model.maxStep(el.props));
    const dt = Math.min(Math.max(TIME_STEP, pending / STEPS_PER_ADVANCE), limit);
    const steps = Math.floor(pending / dt);
    pending -= steps * dt;
    const start = performance.now();
    for (let k = 0; k < steps; k++) {
      if (k % 100 === 99 && performance.now() - start > BUDGET_MS) {
        pending = 0; // can't keep up at this speed: let the rest go
        break;
      }
      t += dt;
      if (!step(dt)) return [];
      engine.onStep?.(t);
      respond(dt);
      const failed = heatUp(dt);
      drain(dt);
      if (failed.length) return failed;
    }
    return [];
  }

  return engine;
}
