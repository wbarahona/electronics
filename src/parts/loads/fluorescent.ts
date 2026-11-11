import { R_SWITCH_ON } from '../../sim/shared/resistance.ts';
import { fmt } from '../../sim/shared/readout.ts';
import { inductorModel } from '../../sim/shared/coils.ts';
import { formatSI } from '../../units.ts';
import type { Element, ModelDef, ModelDefs, Stamper } from '../../sim/models.ts';
import type { PartDefs } from '../defs.ts';
import type { PropsByType } from '../../types.ts';

// The values each of these parts carries: what the properties panel edits
// and the simulator reads (gathered into PropsByType in src/types.ts).
export interface PartProps {
  // Fluorescent lighting: a tube (filament A on pins 0–1, B on pins 2–3, the
  // arc between them), its ballast choke, and a glow starter.
  tube: { ratedPower: number; arcVoltage: number; strikeVoltage: number };
  ballast: { inductance: number; resistance: number; maxCurrent: number };
  starter: { glowVoltage: number };
}

// --- Fluorescent lighting ----------------------------------------------------

// Glow starter: while open with enough voltage across it, it glows (drawing a
// little current), which warms its bimetal until it closes; closed, the glow
// goes out and the bimetal cools until it opens again. Its smoothed voltage
// follows the rectified average, capped so a voltage spike reads as no more
// than a strong glow.
const STARTER_HEAT = 0.8; // s of glowing to close

const STARTER_COOL = 0.6; // s closed before it opens

const R_GLOW = 50e3;

const starterModel: ModelDef<PropsByType['starter']> = {
  stamp(el, s) {
    if (el.state.energized) s.conductance(el.nodes[0], el.nodes[1], 1 / R_SWITCH_ON);
    else if (el.state.glowing) s.conductance(el.nodes[0], el.nodes[1], 1 / R_GLOW);
  },
  current: (el, s) =>
    (s.v(el.nodes[0]) - s.v(el.nodes[1])) / (el.state.energized ? R_SWITCH_ON : el.state.glowing ? R_GLOW : Infinity),
  respond(el, _env, r, dt) {
    if (dt === null) return false;
    const p = el.props;
    const v = Math.min(Math.abs(r.v), 3 * p.glowVoltage);
    el.state.glow = (el.state.glow ?? 0) + (v - (el.state.glow ?? 0)) * (1 - Math.exp(-dt / 0.05));
    const closed = el.state.energized ?? false;
    const glowing = !closed && el.state.glow >= 0.9 * p.glowVoltage;
    // The bimetal's warmth, 0 cold .. 1 bent shut (kept in el.state.temp).
    const t = Math.min(1, Math.max(0, (el.state.temp ?? 0) + (glowing ? dt / STARTER_HEAT : -dt / STARTER_COOL)));
    el.state.temp = t;
    const next = closed ? t > 0 : t >= 1;
    const changed = next !== closed || glowing !== (el.state.glowing ?? false);
    el.state.energized = next;
    el.state.glowing = glowing;
    return changed;
  },
  dynamic: true,
  active: (r) => !!r.state.energized,
  brightness: (r) => (r.state.glowing ? 1 : 0),
  readout: (r) => [['State', r.state.energized ? 'closed' : r.state.glowing ? 'glowing' : 'open']],
};

// Tube: filaments A (pins 0–1) and B (pins 2–3) are resistances; the arc
// runs between pins 1 and 3, in parallel with the starter. Unlit, the gap
// breaks down past the strike voltage (clamping the ballast's kick there);
// that strikes the arc once the filaments are warm, and the lit arc is a
// resistance dropping about the arc voltage at rated current. It goes out
// when its current dies away.
const R_FILAMENT = 5;

const G_BREAKDOWN = 1;

const tubeArc = (p: PropsByType['tube']) => p.arcVoltage ** 2 / p.ratedPower;

const tubeRated = (p: PropsByType['tube']) => p.ratedPower / p.arcVoltage;

function tubeCurrents(el: Element<PropsByType['tube']>, s: Stamper): number[] {
  const v = (k: number) => s.v(el.nodes[k]);
  const ia = (v(0) - v(1)) / R_FILAMENT;
  const ib = (v(2) - v(3)) / R_FILAMENT;
  const gap = v(1) - v(3);
  let arc = 0;
  if (el.state.struck) arc = gap / tubeArc(el.props);
  else if (Math.abs(gap) > el.props.strikeVoltage) arc = G_BREAKDOWN * (gap - Math.sign(gap) * el.props.strikeVoltage);
  return [ia, -ia + arc, ib, -ib - arc];
}

const tubeModel: ModelDef<PropsByType['tube']> = {
  nonlinear: true,
  dynamic: true,
  stamp(el, s) {
    const [a0, a1, b0, b1] = el.nodes;
    s.conductance(a0, a1, 1 / R_FILAMENT);
    s.conductance(b0, b1, 1 / R_FILAMENT);
    if (el.state.struck) {
      s.conductance(a1, b1, 1 / tubeArc(el.props));
      return;
    }
    const gap = s.v(a1) - s.v(b1);
    if (Math.abs(gap) > el.props.strikeVoltage) {
      s.conductance(a1, b1, G_BREAKDOWN);
      s.current(a1, b1, -G_BREAKDOWN * Math.sign(gap) * el.props.strikeVoltage);
    }
  },
  // The arc current.
  current: (el, s) => tubeCurrents(el, s)[1] + tubeCurrents(el, s)[0],
  pinCurrents: tubeCurrents,
  respond(el, _env, r, dt) {
    if (dt === null) return false;
    const p = el.props;
    const ease = (now: number, to: number, tau: number) => now + (to - now) * (1 - Math.exp(-dt / tau));
    el.state.filament = ease(el.state.filament ?? 0, Math.abs(r.pins[0]) > 0.05 ? 1 : 0, 0.4);
    el.state.arc = ease(el.state.arc ?? 0, Math.abs(r.i), 0.05);
    const was = el.state.struck ?? false;
    if (!was && Math.abs(r.pinV[1] - r.pinV[3]) >= 0.98 * p.strikeVoltage && el.state.filament >= 0.6) {
      el.state.struck = true;
      el.state.arc = tubeRated(p);
    } else if (was && el.state.arc < 0.05 * tubeRated(p)) {
      el.state.struck = false;
    }
    return el.state.struck !== was;
  },
  brightness: (r, p) => (r.state.struck ? Math.min(1.2, ((r.state.arc ?? 0) / (0.9 * tubeRated(p))) ** 2) : 0),
  readout: (r, p) => [
    ['State', r.state.struck ? 'lit' : (r.state.filament ?? 0) > 0.5 ? 'preheating' : 'off'],
    ['Arc current', `${fmt(r.state.struck ? (r.state.arc ?? 0) / 0.9 : 0, 'A')}`],
    ['Arc voltage', `${fmt(Math.abs(r.pinV[1] - r.pinV[3]), 'V')}`],
    ['Rated', fmt(p.ratedPower, 'W')],
  ],
};

export const defs: PartDefs<'tube' | 'ballast' | 'starter'> = {
  // Fluorescent tube: filament A (pins 0–1) at the left end, B (pins 2–3) at
  // the right; the arc runs between them.
  tube: {
    name: 'Fluorescent tube',
    letter: 'E',
    category: 'loads',
    group: 'Fluorescent',
    pins: [{ x: -60, y: -20 }, { x: -60, y: 20 }, { x: 60, y: -20 }, { x: 60, y: 20 }],
    props: {
      ratedPower: { label: 'Rated power', unit: 'W', value: 20, min: 0.1 },
      arcVoltage: { label: 'Arc voltage', unit: 'V', value: 60, min: 1 },
      strikeVoltage: { label: 'Strike voltage', unit: 'V', value: 250, min: 1 },
    },
    tag: (p) => formatSI(p.ratedPower, 'W'),
    glow: { color: () => 'white', radius: 60 },
    hit: { w: 130, h: 60 },
    draw: () => `
      <rect class="bulb" x="-50" y="-10" width="100" height="20" rx="3" />
      <path d="M -60 -20 H -44 V 6 M -60 20 H -44 V 6 M 60 -20 H 44 V 6 M 60 20 H 44 V 6" />
      <path d="M -44 -6 V 6 M 44 -6 V 6" />`,
  },
  // The tube's choke: a coil on an iron core.
  ballast: {
    name: 'Ballast',
    letter: 'R',
    category: 'loads',
    group: 'Fluorescent',
    pins: [{ x: -40, y: 0 }, { x: 40, y: 0 }],
    props: {
      inductance: { label: 'Inductance', unit: 'H', value: 0.95, min: 1e-6 },
      resistance: { label: 'Winding resistance', unit: 'Ω', value: 10, min: 0 },
      maxCurrent: { label: 'Max current', unit: 'A', value: 0.6, min: 0.001 },
    },
    tag: (p) => formatSI(p.inductance, 'H'),
    draw: () => `
      <path d="M -40 0 H -20 A 5 5 0 0 1 -10 0 A 5 5 0 0 1 0 0 A 5 5 0 0 1 10 0 A 5 5 0 0 1 20 0 H 40 M -20 -9 H 20" />`,
  },
  // Glow starter: a bimetal contact inside a small glow lamp.
  starter: {
    name: 'Starter',
    letter: 'S',
    category: 'loads',
    group: 'Fluorescent',
    pins: [{ x: -40, y: 0 }, { x: 40, y: 0 }],
    props: {
      glowVoltage: { label: 'Glow voltage (rms)', unit: 'V', value: 80, min: 1 },
    },
    glow: { color: () => 'red', radius: 22 },
    draw: () => `
      <path d="M -40 0 H -12 M 12 0 H 40" />
      <circle class="bulb" r="12" />
      <path class="when-off" d="M -12 0 H -6 V -5 Q 0 -10 4 -5" />
      <path class="when-on" d="M -12 0 H -6 V -5 Q 2 -7 6 0" />
      <path d="M 6 0 H 12" />`,
  },
};

export const models: ModelDefs<'tube' | 'ballast' | 'starter'> = {
  tube: tubeModel,
  ballast: inductorModel,
  starter: starterModel,
};
