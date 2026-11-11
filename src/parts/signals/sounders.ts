import { basicReadout } from '../../sim/shared/readout.ts';
import { ohmic } from '../../sim/shared/resistance.ts';
import { SOUND_WAVES } from '../symbols.ts';
import type { ModelDef, ModelDefs, Result } from '../../sim/models.ts';
import type { PartDefs } from '../defs.ts';

// The values each of these parts carries: what the properties panel edits
// and the simulator reads (gathered into PropsByType in src/types.ts).
export interface PartProps {
  // Sound when driven + to −: a magnetic buzzer's low buzz, a piezo's shrill
  // tone. Rated voltage is the one it's meant to run on.
  buzzer: { ratedVoltage: number; ratedCurrent: number };
  piezo: { ratedVoltage: number; ratedCurrent: number; frequency: number };
  // An electromechanical bell: rings on its rated (RMS) voltage, AC or DC.
  bell: { ratedVoltage: number; ratedCurrent: number };
}

// --- Sounders ----------------------------------------------------------------

// A resistive load that sounds while the average voltage across it, + to −,
// is at least SOUND_FROM of its rating, louder up to the rating.
const SOUND_FROM = 0.5;

function sounder<P extends { ratedVoltage: number; ratedCurrent: number }>(
  tone: (p: P) => { frequency: number; wave: OscillatorType },
  ac = false, // driven by RMS (a bell), rather than + to − (a buzzer)
): ModelDef<P> {
  const drive = (r: Result, p: P) => (ac ? r.vrms : r.vavg) / p.ratedVoltage;
  return {
    ...ohmic((p) => p.ratedVoltage / p.ratedCurrent, (r, p) => [
      ...basicReadout(r),
      ['Sound', r.state.energized ? `${Math.round(Math.min(1, drive(r, p)) * 100)} %` : 'silent'],
    ]),
    respond(el, _env, r) {
      el.state.energized = drive(r, el.props) >= SOUND_FROM;
      return false;
    },
    active: (r) => !!r.state.energized,
    sound: (r, p) => (r.state.energized ? { ...tone(p), level: Math.min(1, drive(r, p)) } : null),
    thermal: { load: (r, p) => Math.abs(r.v) / p.ratedVoltage, tau: 1, limit: 2 },
    failure: { label: 'burnt out', open: true },
  };
}

export const defs: PartDefs<'buzzer' | 'piezo' | 'bell'> = {
  // Magnetic buzzer (DIN: a dome on its base); + is pin 0.
  buzzer: {
    name: 'Buzzer',
    letter: 'P',
    category: 'signals',
    group: 'Sounders',
    pins: [{ x: -40, y: 0 }, { x: 40, y: 0 }],
    props: {
      ratedVoltage: { label: 'Rated voltage', unit: 'V', value: 12, min: 0.1 },
      ratedCurrent: { label: 'Rated current', unit: 'A', value: 0.03, min: 0.0001 },
    },
    draw: () => `
      <path d="M -40 0 H 40 M -14 0 A 14 14 0 0 1 14 0" />
      <text class="sym-text" x="-30" y="-6" text-anchor="middle">+</text>
      ${SOUND_WAVES}`,
  },
  // Piezo sounder: a crystal between two plates; + is pin 0.
  piezo: {
    name: 'Piezo buzzer',
    letter: 'P',
    category: 'signals',
    group: 'Sounders',
    pins: [{ x: -40, y: 0 }, { x: 40, y: 0 }],
    props: {
      ratedVoltage: { label: 'Rated voltage', unit: 'V', value: 5, min: 0.1 },
      ratedCurrent: { label: 'Rated current', unit: 'A', value: 0.01, min: 0.0001 },
      frequency: { label: 'Tone', unit: 'Hz', value: 2700, min: 100, max: 8000 },
    },
    draw: () => `
      <path d="M -40 0 H -8 M 8 0 H 40 M -8 -12 V 12 M 8 -12 V 12" />
      <rect x="-4" y="-9" width="8" height="18" />
      <text class="sym-text" x="-30" y="-6" text-anchor="middle">+</text>
      ${SOUND_WAVES}`,
  },
  // Electromechanical bell (DIN: a bowl under its base).
  bell: {
    name: 'Bell',
    letter: 'P',
    category: 'signals',
    group: 'Sounders',
    pins: [{ x: -40, y: 0 }, { x: 40, y: 0 }],
    props: {
      ratedVoltage: { label: 'Rated voltage (rms)', unit: 'V', value: 120, min: 0.1 },
      ratedCurrent: { label: 'Rated current', unit: 'A', value: 0.1, min: 0.0001 },
    },
    draw: () => `
      <path d="M -40 0 H 40 M -14 0 A 14 14 0 0 0 14 0" />
      ${SOUND_WAVES}`,
  },
};

export const models: ModelDefs<'buzzer' | 'piezo' | 'bell'> = {
  // A magnetic buzzer's harsh low buzz; a piezo's shrill tone.
  buzzer: sounder(() => ({ frequency: 400, wave: 'sawtooth' })),
  piezo: sounder((p) => ({ frequency: p.frequency, wave: 'square' })),
  bell: sounder(() => ({ frequency: 1100, wave: 'triangle' }), true),
};
