import { PARTS } from '../components.ts';
import type { Circuit } from '../model.ts';
import { pinKey, type Nets } from '../nets.ts';
import { solve } from './linear.ts';
import { MODELS, type Element, type PartState, type Result, type Stamper } from './models.ts';

// Modified Nodal Analysis, stepped through time.
//
// Unknowns are the voltage of every net plus the current of every branch
// (voltage sources). Each step, every part stamps its equations into A·x = b
// and the system is solved; non-linear parts are re-linearised and solved
// again until the answer settles (Newton-Raphson). A DC circuit simply gives
// the same answer every step; time-dependent parts make it change.
//
// There is no ground part yet, so each separate circuit on the board gets one
// net tied to the common reference: a battery's − terminal if it has one. A
// single tie carries no current, so it only fixes absolute voltages and never
// changes what flows. Every net also leaks to the reference through a tiny
// conductance (GMIN), as in SPICE, so nets left floating (open switches, loose
// parts) still have a solution.
//
// Parts heat up toward their load (1 = at their rating) with their own time
// constant, and fail once their heat passes their limit. Short spikes are
// survivable; sustained overload is not. While anything is still heating or
// cooling, `heating` is set so time keeps running even in a DC circuit.
//
// For AC, every part also keeps running averages of v², i² and power over
// AVERAGE_TAU of simulated time, giving RMS and average readings.
//
// The time step is TIME_STEP normally, and grows when the simulation is run
// fast so a frame needs about STEPS_PER_ADVANCE steps, but never beyond what
// the parts can follow (a twentieth of an AC period). Each advance gets a
// compute budget; time it can't fit is dropped, so the page stays responsive
// and the simulation simply runs slower than asked.

export const TIME_STEP = 1e-4; // s
const MAX_TIME_STEP = 0.01; // s
const GMIN = 1e-12;
const MAX_ITERATIONS = 100;
const STEPS_PER_ADVANCE = 2000;
const BUDGET_MS = 10;
const AVERAGE_TAU = 0.1; // s

const settled = (prev: Float64Array, next: Float64Array) =>
  next.every((v, i) => Math.abs(v - prev[i]) <= 1e-6 + 1e-6 * Math.abs(v));

export type Engine = ReturnType<typeof createEngine>;

export function createEngine(circuit: Circuit) {
  let elements: Element[] = [];
  let refs: number[] = []; // one reference net per separate circuit
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
    heating: false,
    rebuild,
    advance,
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
    };
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
        nodes: PARTS[c.type].pins.map((_, i) => netOf.get(pinKey(c.id, i))!),
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
    x = new Float64Array(size);
    step(TIME_STEP);
  }

  // Group nets joined through parts into separate circuits and pick one net in
  // each to tie to the reference, preferring a battery's − terminal.
  function referenceNets() {
    const parent = Array.from({ length: nodeCount }, (_, n) => n);
    const find = (n: number): number => (parent[n] === n ? n : (parent[n] = find(parent[n])));
    for (const el of elements) {
      for (const n of el.nodes.slice(1)) parent[find(n)] = find(el.nodes[0]);
    }
    const chosen = new Map<number, number>(); // circuit root -> reference net
    for (const el of elements) {
      if (circuit.part(el.id)?.type === 'battery' && !chosen.has(find(el.nodes[1]))) {
        chosen.set(find(el.nodes[1]), el.nodes[1]);
      }
    }
    for (let n = 0; n < nodeCount; n++) if (!chosen.has(find(n))) chosen.set(find(n), n);
    return [...chosen.values()];
  }

  // Solve the circuit at time t, the end of a step of length dt.
  function step(dt: number): boolean {
    const nonlinear = elements.some((el) => el.model.nonlinear);
    for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
      const A = Array.from({ length: size }, () => new Float64Array(size));
      const b = new Float64Array(size);
      const s = stamper(A, b, x, dt);
      for (let n = 0; n < nodeCount; n++) A[n][n] += GMIN;
      for (const n of refs) A[n][n] += 1;
      for (const el of elements) {
        if (!el.open) el.model.stamp(el, s);
        else if (el.branch >= 0) s.idle(el.branch);
      }
      const next = solve(A, b);
      if (!next) return fail('The circuit has no single solution (check for loops of ideal sources).');
      const done = !nonlinear || (iter > 0 && s.converged && settled(x, next));
      x = next;
      if (done) return finish(dt);
    }
    return fail('The simulation did not converge.');
  }

  function finish(dt: number): boolean {
    const s = stamper(null, null, x, dt);
    engine.results.clear();
    for (const el of elements) {
      if (!el.open) el.model.accept?.(el, s);
      const v = s.v(el.nodes[0]) - s.v(el.nodes[1]);
      const i = el.open ? 0 : el.model.current(el, s);
      const r: Result = { v, i, p: v * i, vrms: 0, irms: 0, pavg: 0, heat: el.state.heat ?? 0, load: 0, ac: engine.dynamic };
      r.load = el.model.thermal && !el.broken ? el.model.thermal.load(r, el.props) : 0;
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
    const m = (el.state.avg ??= { v2: r.v * r.v, i2: r.i * r.i, p: r.p });
    m.v2 += k * (r.v * r.v - m.v2);
    m.i2 += k * (r.i * r.i - m.i2);
    m.p += k * (r.p - m.p);
    r.vrms = Math.sqrt(m.v2);
    r.irms = Math.sqrt(m.i2);
    r.pavg = m.p;
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
      return engine.error ? [] : heatUp(seconds);
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
      const failed = heatUp(dt);
      if (failed.length) return failed;
    }
    return [];
  }

  return engine;
}
