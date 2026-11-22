import { pinsOf } from '../components.ts';
import { AMBIENT, type Circuit } from '../model.ts';
import { pinKey, type Nets } from '../nets.ts';
import { flatten } from '../modules.ts';
import { dockings } from '../shaft.ts';
import { WALL_CONDUCTANCE, frameSize } from '../parts/annotate/frame.ts';
import type { Part, PropsByType } from '../types.ts';
import { STOPPED } from './shared/shaft.ts';
import { solve } from './linear.ts';
import { actualProps } from './shared/tolerance.ts';
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
export { FAN_LENGTH, FAN_REACH, INTAKE_LENGTH };
// Step used when re-solving without moving time on: so short that capacitors
// and inductors simply hold what they have.
const HOLD_STEP = 1e-9; // s
const MAX_TIME_STEP = 0.01; // s
const GMIN = 1e-12;
const MAX_ITERATIONS = 100;

// The fallback for a step that didn't converge (see step): more, smaller
// Newton steps, no node voltage moving more than DAMPED_STEP each.
const DAMPED_ITERATIONS = 400;
const DAMPED_STEP = 0.5; // V
const STEPS_PER_ADVANCE = 2000;
const BUDGET_MS = 10;
const AVERAGE_TAU = 0.1; // s
// Light from a glowing part falls off with distance (world units, a grid
// square is 20): at LIGHT_REACH it's half as strong as right next to it.
const LIGHT_REACH = 60;

// Heat reaches nearby parts the same way: at HEAT_REACH a part feels half the
// warmth it would right next to the source. WARMTH_PER_WATT is how much a
// part next to a source warms per watt it gives off (a hot 1 W resistor
// warms its neighbour by about 15 °C).
const HEAT_REACH = 60;
const WARMTH_PER_WATT = 15; // °C/W

// A fan's air: a cone FAN_SPREAD either side of its axis and FAN_LENGTH long
// (ten grid squares), half as strong FAN_REACH away; full air takes
// MAX_COOLING of a part's rise away (forced air cools much better than still).
// Those are for an 80 mm fan moving FAN_FLOW; a fan reaches in proportion to
// its diameter, and its air is as strong as its flow against FAN_FLOW. Behind
// it, the air it draws in comes from all round and slowly: a half circle
// INTAKE_LENGTH deep (also scaled), at INTAKE_SHARE of its strength, fading
// to nothing at its edge.
const FAN_SPREAD = (35 * Math.PI) / 180;
const FAN_LENGTH = 200;
const FAN_REACH = 120;
const FAN_FLOW = 60; // m³/h
const FAN_SIZE = 80; // mm
const INTAKE_LENGTH = 60;
const INTAKE_SHARE = 0.25;
const MAX_COOLING = 0.6;

// Enclosures (see enclosures()): how deep a box is, how big a board pixel is,
// what a box holds per m² of wall (air, walls, boards), the heat a m³/h of
// air carries per kelvin (ρ·c of air ÷ 3600), and how near its edge a fan
// counts as on its wall.
const BOX_DEPTH = 0.05; // m
const M_PER_PX = 0.0005; // m: a 20 px grid square is a centimetre
const BOX_HEAT = 600; // J/(K·m²)
const AIR_HEAT = 0.335; // W/K per m³/h
const WALL_REACH = 10; // px

// A fan as the air sees it: where it is, the way its air goes (dx, dy), how
// strong its air is (1 = an 80 mm fan at FAN_FLOW) and its size against 80 mm.
export interface Fan {
  x: number;
  y: number;
  dx: number;
  dy: number;
  strength: number;
  scale: number;
  id: string;
}
const G_GROUND = 1e6; // S; how firmly Ground holds its net at 0 V
const G_TIE = 1; // S; the tie for a circuit that has no Ground
const G_SHORT = 1e3; // S; a short-circuit fault (1 mΩ)
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
  // The load each motor's shaft drives: motor id → the load's element.
  const docked = new Map<string, Element>();
  // Every part the simulator sees by id: the board's own, and the parts inside
  // module blocks (see flatten), which for position (heat, light, air) sit
  // where their block does.
  let placed = new Map<string, Part>();
  // Each module block's element and the elements inside it (blocks in it too).
  let blocks: { el: Element; inside: Element[] }[] = [];
  const engine = {
    results: new Map<string, Result>(),
    error: null as string | null,
    dynamic: false,
    ac: false, // driven by an alternating source: readouts show RMS
    tolerances: false, // simulate parts as built (within their tolerance), not as marked
    burnOut: true, // overloaded parts fail (else they only get hot)
    temperatures: true, // ambient, heat between parts and fans (else every part on its own at 25 °C)
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
    // The air as the last thermal pass left it, for drawing it (see
    // src/airflow.ts): the running fans, the air's temperature at a point
    // (its box's air plus warmth from the parts near it in the same box,
    // leaving out part `except`), and the enclosure a point is in.
    air: {
      fans: (): readonly Fan[] => air.fans,
      at(p: { x: number; y: number }, except?: string): number {
        const box = innermost(air.boxes, p);
        let celsius = box ? box.el.state.air! : engine.temperatures ? circuit.ambient : AMBIENT;
        for (const s of air.sources) {
          if (s.id === except || air.home.get(s.id) !== box) continue;
          celsius += s.warmth / (1 + (Math.hypot(s.x - p.x, s.y - p.y) / HEAT_REACH) ** 2);
        }
        return celsius;
      },
      box: (p: { x: number; y: number }): string | null => innermost(air.boxes, p)?.el.id ?? null,
    },
  };
  // What the last thermal pass found (see feelSurroundings).
  const air = {
    fans: [] as Fan[],
    boxes: [] as Enclosure[],
    sources: [] as { x: number; y: number; warmth: number; id: string }[],
    home: new Map<string, Enclosure | null>(),
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
    const flat = flatten(circuit);
    placed = new Map(flat.parts.map(({ part, space, home }) => [part.id, space ? { ...part, x: home.x, y: home.y } : part]));
    elements = flat.parts.map(({ part: c }) => {
      const model = MODELS[c.type];
      const branches = model.branches?.(c.props) ?? 0;
      if (!state.has(c.id)) state.set(c.id, {});
      const el: Element = {
        id: c.id,
        props: engine.tolerances && model.tolerance ? actualProps(c.props, model.tolerance) : c.props,
        model,
        broken: !!c.broken || !!c.fault,
        // A failed part that now conducts nothing, or a fault put in on
        // purpose: open (nothing) or short (a wire across its two pins).
        open: (!!c.broken && !!model.failure?.open) || !!c.fault,
        short: c.fault?.kind === 'short',
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
    // Which loads sit on which shafts. A docked load starts out standing still
    // (its motor writes its motion once it runs), and stands still while its
    // motor is out; a load on no shaft has no motion at all.
    docked.clear();
    const byId = new Map(elements.map((el) => [el.id, el]));
    // (Shafts and loads meet on the board, or inside the same block.)
    const spaces = new Map<string, Part[]>();
    for (const { part, space } of flat.parts) spaces.set(space, [...(spaces.get(space) ?? []), part]);
    for (const parts of spaces.values()) for (const [motor, load] of dockings(parts)) docked.set(motor, byId.get(load)!);
    for (const [motor, load] of docked) {
      if (!load.state.shaft || byId.get(motor)!.open) load.state.shaft = { ...STOPPED, work: load.state.shaft?.work ?? 0 };
    }
    const onShaft = new Set(docked.values());
    for (const el of elements) if (el.model.shaftLoad && !onShaft.has(el)) delete el.state.shaft;
    refs = referenceNets();
    for (const id of state.keys()) if (!placed.has(id)) state.delete(id);
    blocks = elements
      .filter((el) => placed.get(el.id)!.type === 'module')
      .map((el) => ({ el, inside: elements.filter((e) => e.id.startsWith(`${el.id}/`)) }));
    engine.dynamic = elements.some((el) => el.model.dynamic);
    engine.ac = elements.some((el) => el.model.alternating && !el.open);
    x = new Float64Array(size);
    step(HOLD_STEP, false);
    feelSurroundings();
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
      const at = placed.get(el.id);
      if (!at) return 0;
      let light = 0;
      for (const other of elements) {
        const r = engine.results.get(other.id);
        const from = placed.get(other.id);
        if (other === el || !other.model.brightness || !r || !from) continue;
        const d = Math.hypot(from.x - at.x, from.y - at.y);
        light += other.model.brightness(r, other.props) / (1 + (d / LIGHT_REACH) ** 2);
      }
      return light;
    },
    temperature: around,
    shaft(el) {
      const load = docked.get(el.id);
      return load?.model.shaftLoad && !load.open ? { load: load.model.shaftLoad(load.props, load.state), state: load.state } : null;
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
      if (placed.get(el.id)?.type === 'battery' && !chosen.has(find(el.nodes[1]))) {
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
  // Solve one step by Newton's method from the last solution. If that doesn't
  // converge (a steep, high-gain transition, like a comparator flipping with
  // positive feedback), try again from the last good solution with damped
  // steps: no node moves more than DAMPED_STEP volts per iteration, so the
  // iteration creeps through the steep part instead of overshooting it. A
  // failed step leaves the last good solution in place, so the next step
  // starts from sense rather than from where it diverged.
  function step(dt: number, commit = true): boolean {
    const nonlinear = elements.some((el) => el.model.nonlinear);
    const good = x.slice();
    const result = iterate(dt, nonlinear, MAX_ITERATIONS, Infinity);
    if (result === 'converged') return finish(dt, commit);
    if (result === 'singular') return fail('The circuit has no single solution (check for loops of ideal sources).');
    x = good.slice();
    if (iterate(dt, nonlinear, DAMPED_ITERATIONS, DAMPED_STEP) === 'converged') return finish(dt, commit);
    x = good;
    return fail('The simulation did not converge.');
  }

  function iterate(dt: number, nonlinear: boolean, iterations: number, maxStep: number): 'converged' | 'singular' | 'diverged' {
    for (let iter = 0; iter < iterations; iter++) {
      const A = Array.from({ length: size }, () => new Float64Array(size));
      const b = new Float64Array(size);
      const s = stamper(A, b, x, dt);
      for (let n = 0; n < nodeCount; n++) A[n][n] += GMIN;
      for (const [n, g] of refs) A[n][n] += g;
      for (const el of elements) {
        if (!el.open) el.model.stamp(el, s);
        else {
          if (el.short) s.conductance(el.nodes[0], el.nodes[1], G_SHORT);
          if (el.branch >= 0) s.idle(el.branch);
        }
      }
      let next = solve(A, b);
      if (!next) return 'singular';
      if (maxStep < Infinity) {
        // Damped: scale the whole update down so no node voltage moves more
        // than maxStep (branch currents follow along).
        let biggest = 0;
        for (let n = 0; n < nodeCount; n++) biggest = Math.max(biggest, Math.abs(next[n] - x[n]));
        if (biggest > maxStep) {
          const k = maxStep / biggest;
          next = next.map((v, i) => x[i] + k * (v - x[i]));
        }
      }
      const done = !nonlinear || (iter > 0 && s.converged && settled(x, next));
      x = next;
      if (done) return 'converged';
    }
    return 'diverged';
  }

  function finish(dt: number, commit: boolean): boolean {
    const s = stamper(null, null, x, dt);
    engine.results.clear();
    for (const el of elements) {
      const v = el.nodes.length > 1 ? s.v(el.nodes[0]) - s.v(el.nodes[1]) : el.nodes.length ? s.v(el.nodes[0]) : 0;
      // Current first: accept() moves an energy store on to this step's value.
      const i = el.short ? G_SHORT * v : el.open ? 0 : el.model.current(el, s);
      const pins = el.short ? [i, -i] : el.open ? el.nodes.map(() => 0) : (el.model.pinCurrents?.(el, s) ?? [i, -i]);
      const pinV = el.nodes.map((n) => s.v(n));
      // Power taken in: the sum over pins of voltage × current in.
      const p = el.short ? i * v : el.open ? 0 : (el.model.power?.(el, s) ?? pins.reduce((sum, ik, k) => sum + ik * pinV[k], 0));
      if (commit && !el.open) el.model.accept?.(el, s);
      const r: Result = {
        v, i, p, vavg: 0, iavg: 0, vrms: 0, irms: 0, pavg: 0, heat: el.state.heat ?? 0, load: 0, ac: engine.ac,
        pins, pinV, state: el.state, extraRms: [],
      };
      // (Averages first: AC parts judge their load by RMS values.)
      average(el, r, dt);
      r.load = el.model.thermal && !el.broken ? el.model.thermal.load(r, el.props) : 0;
      if (el.model.thermal && !el.broken) r.celsius = thermalState(el, r.heat).celsius;
      r.level = el.model.level?.(r, el.props);
      engine.results.set(el.id, r);
    }
    // What flows into a block at each pin: what the parts inside it take from
    // that pin's net.
    for (const { el, inside } of blocks) {
      const r = engine.results.get(el.id)!;
      r.pins = el.nodes.map((n) => {
        let i = 0;
        for (const e of inside) e.nodes.forEach((m, k) => m === n && (i += engine.results.get(e.id)?.pins[k] ?? 0));
        return i;
      });
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

  // --- Temperature ---------------------------------------------------------
  // The temperature around each part: the circuit's ambient plus warmth from
  // hot parts nearby. A part warms a neighbour by the heat it gives off (the
  // watts it dissipates now, WARMTH_PER_WATT °C each, but never more than its
  // own rise above its surroundings), fading with distance as light does. So
  // a small LED barely warms anything, a hot resistor warms what's next to
  // it, and a heater no more than its own element. Worked out once per
  // advance, not every step: heat moves slowly.
  const surroundings = new Map<string, number>(); // part id -> °C around it
  const coolings = new Map<string, number>(); // part id -> how much of its rise is left under forced air, 1 = none

  // How much a part's rise is left under the air of running fans: air reaches
  // parts in a cone in front of a fan (FAN_SPREAD either side of its axis,
  // FAN_LENGTH long), more strongly near the fan and the axis, in proportion
  // to the fan's speed. Several fans add up; full air takes MAX_COOLING of a
  // part's rise away.
  function coolingAt(el: Element, at: { x: number; y: number }, fans: Fan[]) {
    let still = 1; // share of air that doesn't reach it
    for (const f of fans) {
      if (f.id === el.id) continue;
      const [vx, vy] = [at.x - f.x, at.y - f.y];
      const along = vx * f.dx + vy * f.dy;
      const d = Math.hypot(vx, vy);
      let air: number;
      if (along <= 0) {
        // Behind it: drawn in from every side.
        if (d > INTAKE_LENGTH * f.scale) continue;
        air = INTAKE_SHARE * f.strength * (1 - d / (INTAKE_LENGTH * f.scale));
      } else {
        if (d > FAN_LENGTH * f.scale) continue;
        const off = Math.acos(Math.min(1, along / d)); // angle off the axis
        if (off > FAN_SPREAD) continue;
        air = f.strength * (1 - off / FAN_SPREAD) / (1 + (d / (FAN_REACH * f.scale)) ** 2);
      }
      still *= 1 - Math.min(1, air);
    }
    return 1 - MAX_COOLING * (1 - still);
  }

  // `dt`: the time since the last call, over which enclosures' air moves
  // toward its balance (0 when the circuit was just edited: nothing moves).
  function feelSurroundings(dt = 0) {
    surroundings.clear();
    coolings.clear();
    Object.assign(air, { fans: [], boxes: [], sources: [], home: new Map() });
    // Temperature effects off (Settings): nothing around any part but 25 °C.
    if (!engine.temperatures) return;
    const boxes = enclosures();
    // The innermost enclosure each part sits in; air, warmth and fans don't
    // cross walls (a fan on a wall belongs to the box it's on).
    const home = new Map<string, Enclosure | null>();
    for (const el of elements) {
      const at = placed.get(el.id);
      if (at && at.type !== 'frame') home.set(el.id, innermost(boxes, at));
    }
    const fans: Fan[] = [];
    for (const el of elements) {
      const r = engine.results.get(el.id);
      const at = placed.get(el.id);
      if (!el.model.airflow || el.broken || !r || !at) continue;
      const { flow, diameter } = el.model.airflow(r, el.props);
      const strength = flow / FAN_FLOW;
      // Its local up (−y), turned clockwise with the part.
      const turn = (at.rotation * Math.PI) / 180;
      if (strength > 0.01) fans.push({ x: at.x, y: at.y, dx: Math.sin(turn), dy: -Math.cos(turn), strength, scale: diameter / FAN_SIZE, id: el.id });
      // On a wall it swaps the box's air for the air outside, whichever way it blows.
      const box = home.get(el.id);
      if (box && onWall(box, at)) box.exchange += flow;
    }
    // Air first: a part under a fan's air runs cooler, and so gives off less
    // warmth to its neighbours (the air carries it away) and takes in less.
    if (fans.length) {
      for (const el of elements) {
        const at = placed.get(el.id);
        if (at) coolings.set(el.id, coolingAt(el, at, fans.filter((f) => home.get(f.id) === home.get(el.id))));
      }
    }
    const sources: { x: number; y: number; warmth: number; id: string }[] = [];
    for (const el of elements) {
      const thermal = el.model.thermal;
      const r = engine.results.get(el.id);
      const at = placed.get(el.id);
      if (!thermal?.rise || el.broken || !r || !at) continue;
      // The heat it gives off (watts, following its power at the pace of its
      // thermal mass, so a heater just switched off still warms what's
      // around it), but never more than its own temperature rise.
      const warmth = Math.min((el.state.watts ?? 0) * WARMTH_PER_WATT, (el.state.heat ?? 0) * thermal.rise);
      if (warmth > 0.01) sources.push({ x: at.x, y: at.y, warmth, id: el.id });
      // All of it ends up in the air of its box, and of the boxes round that.
      const heat = Math.abs(r.ac ? r.pavg : r.p) * (thermal.heatShare ?? 1);
      for (let box = home.get(el.id); box; box = box.parent) box.heat += heat;
    }
    breathe(boxes, dt);
    Object.assign(air, { fans, boxes, sources, home });
    for (const el of elements) {
      const at = placed.get(el.id);
      if (!at) continue;
      const cooling = coolings.get(el.id) ?? 1;
      const box = home.get(el.id);
      let around = box ? box.el.state.air! : circuit.ambient;
      for (const s of sources) {
        if (s.id === el.id || home.get(s.id) !== box) continue;
        around += (cooling * s.warmth) / (1 + (Math.hypot(s.x - at.x, s.y - at.y) / HEAT_REACH) ** 2);
      }
      surroundings.set(el.id, around);
    }
  }

  // --- Enclosures ------------------------------------------------------------
  // A frame set as an enclosure is a box of air round the parts inside it.
  // Their heat warms it; it loses heat through its walls (WALL_CONDUCTANCE
  // per m² of a box BOX_DEPTH deep, its face at M_PER_PX: a grid square is a
  // centimetre) and with the air the fans on its walls swap for outside air
  // (AIR_HEAT per m³/h). Its air settles at outside + heat ÷ (walls + fans),
  // at the pace of what it holds (BOX_HEAT per m² of wall). Outside is the
  // air of the box it's in, or the ambient: boxes in boxes pass their heat on.

  interface Enclosure {
    el: Element;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    area: number; // its walls, m²
    walls: number; // what they let out, W/K
    parent: Enclosure | null;
    heat: number; // W given off inside it (and in boxes inside it)
    exchange: number; // m³/h the fans on its walls move
  }

  function enclosures(): Enclosure[] {
    const boxes: Enclosure[] = [];
    for (const el of elements) {
      const c = placed.get(el.id);
      const p = c?.props as PropsByType['frame'];
      if (c?.type !== 'frame' || !p.enclosure) continue;
      const { w, h } = frameSize(p);
      const [a, b] = [w * M_PER_PX, h * M_PER_PX];
      const area = 2 * (a * b + (a + b) * BOX_DEPTH);
      boxes.push({ el, x1: c.x, y1: c.y, x2: c.x + w, y2: c.y + h, area, walls: area * WALL_CONDUCTANCE[p.walls], parent: null, heat: 0, exchange: 0 });
    }
    const size = (b: Enclosure) => (b.x2 - b.x1) * (b.y2 - b.y1);
    for (const b of boxes) {
      const outer = boxes.filter((o) => o !== b && o.x1 <= b.x1 && o.y1 <= b.y1 && o.x2 >= b.x2 && o.y2 >= b.y2 && size(o) > size(b));
      b.parent = outer.sort((p, q) => size(p) - size(q))[0] ?? null;
    }
    return boxes;
  }

  // The smallest box round point p (its edge counts as inside).
  function innermost(boxes: Enclosure[], p: { x: number; y: number }): Enclosure | null {
    let best: Enclosure | null = null;
    for (const b of boxes) {
      if (p.x < b.x1 || p.x > b.x2 || p.y < b.y1 || p.y > b.y2) continue;
      if (!best || (b.x2 - b.x1) * (b.y2 - b.y1) < (best.x2 - best.x1) * (best.y2 - best.y1)) best = b;
    }
    return best;
  }

  const onWall = (b: Enclosure, p: { x: number; y: number }) =>
    Math.min(p.x - b.x1, b.x2 - p.x, p.y - b.y1, b.y2 - p.y) <= WALL_REACH;

  // Move each box's air toward its balance over dt, outer boxes first, and
  // keep what it shows in its state.
  function breathe(boxes: Enclosure[], dt: number) {
    const depth = (b: Enclosure): number => (b.parent ? 1 + depth(b.parent) : 0);
    for (const b of [...boxes].sort((p, q) => depth(p) - depth(q))) {
      const outside = b.parent ? b.parent.el.state.air! : circuit.ambient;
      const g = b.walls + b.exchange * AIR_HEAT;
      const target = outside + b.heat / g;
      const air = b.el.state.air ?? outside;
      b.el.state.air = target + (air - target) * Math.exp(-(dt * g) / (b.area * BOX_HEAT));
      b.el.state.inside = b.heat;
      b.el.state.exchange = b.exchange;
    }
    for (const el of elements) {
      if (placed.get(el.id)?.type === 'frame' && !boxes.some((b) => b.el === el)) delete el.state.air;
    }
  }

  function around(el: Element): number {
    return surroundings.get(el.id) ?? (engine.temperatures ? circuit.ambient : AMBIENT);
  }

  // A part's temperature with heat `h`, and how close that is to failing on
  // the scale of its heat (its limit is where it fails). At the ambient its
  // ratings are given at (25 °C), exactly its heat; warmer surroundings bring
  // the failing point closer, cooler ones push it away. Stress that isn't
  // heat (rise 0) is just the heat.
  function thermalState(el: Element, h: number): { celsius?: number; stress: number } {
    const { rise } = el.model.thermal!;
    if (!rise) return { stress: h };
    const local = around(el);
    if (local === AMBIENT) return { celsius: local + h * rise, stress: h };
    return { celsius: local + h * rise, stress: h + (local - AMBIENT) / rise };
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
      const tau = typeof thermal.tau === 'function' ? thermal.tau(el.props) : thermal.tau;
      // Under a fan's air it settles at only part of its rise; it gets
      // there (or back) at the pace of its own thermal mass.
      const cooling = thermal.rise ? (coolings.get(el.id) ?? 1) : 1;
      const ease = Math.exp(-dt / tau);
      const target = r.load * cooling;
      el.state.heat = target + (h - target) * ease;
      // The watts it gives off to its neighbours follow at the same pace;
      // under a fan's air, part of them leave with the air.
      const watts = Math.abs(r.ac ? r.pavg : r.p) * (thermal.heatShare ?? 1) * cooling;
      el.state.watts = watts + ((el.state.watts ?? 0) - watts) * ease;
      r.heat = el.state.heat;
      const { celsius, stress } = thermalState(el, el.state.heat);
      r.celsius = celsius;
      if (engine.burnOut && stress > thermal.limit) failed.push(el.id);
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
    feelSurroundings(seconds);
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
