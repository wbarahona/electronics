import { basicReadout, fmt } from '../../sim/shared/readout.ts';
import { ohmic } from '../../sim/shared/resistance.ts';
import { formatSI } from '../../units.ts';
import { SOUND_WAVES } from '../symbols.ts';
import type { ModelDef, ModelDefs } from '../../sim/models.ts';
import type { PartDefs } from '../defs.ts';
import type { PropsByType } from '../../types.ts';

// The values each of these parts carries: what the properties panel edits
// and the simulator reads (gathered into PropsByType in src/types.ts).
export interface PartProps {
  // Plays the AC part of the voltage across it, at that signal's frequency.
  speaker: { impedance: number; ratedPower: number };
}

// --- Speaker -----------------------------------------------------------------

// A resistance (its impedance) that sounds the AC part of the voltage across
// it at that signal's own frequency, measured from its upward zero crossings
// (in simulated time, placed between steps by interpolation), as loud as
// that is against its rated power.
const speakerModel: ModelDef<PropsByType['speaker']> = {
  ...ohmic((p) => p.impedance),
  respond(el, env, r, dt) {
    if (dt === null) return false;
    const now = r.v - r.vavg;
    const last = el.state.last;
    if (last !== undefined && last <= 0 && now > 0) {
      const at = env.time - (dt * now) / (now - last);
      if (el.state.crossAt !== undefined) el.state.span = at - el.state.crossAt;
      el.state.crossAt = at;
    }
    el.state.last = now;
    // Silent once no crossing has come for a while.
    if (el.state.crossAt !== undefined && env.time - el.state.crossAt > 0.1) el.state.span = undefined;
    return false;
  },
  sound(r, p) {
    const span = r.state.span;
    const ac = Math.sqrt(Math.max(0, r.vrms ** 2 - r.vavg ** 2));
    const level = Math.min(1, ac / Math.sqrt(p.ratedPower * p.impedance));
    if (!span || level < 0.02 || 1 / span < 20 || 1 / span > 20000) return null;
    return { frequency: 1 / span, wave: 'square', level };
  },
  readout(r, p) {
    const tone = this.sound!(r, p);
    return [...basicReadout(r), ['Tone', tone ? fmt(tone.frequency, 'Hz') : 'silent']];
  },
  thermal: { load: (r, p) => Math.abs(r.ac ? r.pavg : r.p) / p.ratedPower, tau: 0.5, limit: 2 },
  failure: { label: 'burnt out', open: true },
};

export const defs: PartDefs<'speaker'> = {
  // Loudspeaker (DIN: magnet and cone).
  speaker: {
    name: 'Speaker',
    letter: 'P',
    category: 'signals',
    group: 'Sounders',
    pins: [{ x: -40, y: 0 }, { x: 40, y: 0 }],
    props: {
      impedance: { label: 'Impedance', unit: 'Ω', value: 8, min: 0.1 },
      ratedPower: { label: 'Rated power', unit: 'W', value: 0.5, min: 0.001 },
    },
    tag: (p) => formatSI(p.impedance, 'Ω'),
    draw: () => `
      <path d="M -40 0 H -14 M 40 0 H 24 V 20 H -9 V 6" />
      <rect x="-14" y="-6" width="10" height="12" />
      <path d="M -4 -6 L 8 -16 V 16 L -4 6" />
      ${SOUND_WAVES}`,
  },
};

export const models: ModelDefs<'speaker'> = {
  speaker: speakerModel,
};
