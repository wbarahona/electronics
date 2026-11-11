import { basicReadout } from '../../sim/shared/readout.ts';
import { ohmic } from '../../sim/shared/resistance.ts';
import { SOUND_WAVES } from '../symbols.ts';
import type { ModelDef, ModelDefs, Result, Sound } from '../../sim/models.ts';
import type { PartDefs } from '../defs.ts';

// The values each of these parts carries: what the properties panel edits
// and the simulator reads (gathered into PropsByType in src/types.ts).
export interface PartProps {
  // A magnetic buzzer (DC + to −, or AC) and a piezo (DC + to −). Rated
  // voltage is the one it's meant to run on.
  buzzer: { ratedVoltage: number; ratedCurrent: number };
  piezo: { ratedVoltage: number; ratedCurrent: number; frequency: number };
  // An electromechanical bell: rings on its rated (RMS) voltage, AC or DC.
  bell: { ratedVoltage: number; ratedCurrent: number };
  // A door chime: a plunger strikes one tone bar when powered and the other
  // when released (rated RMS voltage; doorbell transformers give 8–24 V~).
  chime: { ratedVoltage: number; ratedCurrent: number };
}

// --- Sounders ----------------------------------------------------------------

// A resistive load that sounds while what drives it is at least SOUND_FROM of
// its rated voltage, louder up to the rating. What drives it (`drive`):
//   polar  the average voltage, + to − (a piezo: silent reversed or on AC)
//   rms    the RMS voltage, AC or DC either way round (a bell, a chime)
//   buzzer the larger of the forward average and the AC part: a magnetic
//          buzzer runs on DC the right way round or on AC
const SOUND_FROM = 0.5;

type Drive = 'polar' | 'rms' | 'buzzer';
const acPart = (r: Result) => Math.sqrt(Math.max(0, r.vrms ** 2 - r.vavg ** 2));
const driving = (r: Result, how: Drive) =>
  how === 'polar' ? r.vavg : how === 'rms' ? r.vrms : Math.max(r.vavg, acPart(r));

function sounder<P extends { ratedVoltage: number; ratedCurrent: number }>(
  tone: (p: P, r: Result) => Omit<Sound, 'level'>,
  how: Drive,
): ModelDef<P> {
  const drive = (r: Result, p: P) => driving(r, how) / p.ratedVoltage;
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
    sound: (r, p) => (r.state.energized ? { ...tone(p, r), level: Math.min(1, drive(r, p)) } : null),
    thermal: { load: (r, p) => Math.abs(r.v) / p.ratedVoltage, tau: 1, limit: 2 },
    failure: { label: 'burnt out', open: true },
  };
}

export const defs: PartDefs<'buzzer' | 'piezo' | 'bell' | 'chime'> = {
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
  // Door chime: its plunger's coil between two tone bars.
  chime: {
    name: 'Door chime',
    letter: 'P',
    category: 'signals',
    group: 'Sounders',
    pins: [{ x: -40, y: 0 }, { x: 40, y: 0 }],
    props: {
      ratedVoltage: { label: 'Rated voltage (rms)', unit: 'V', value: 16, min: 0.1 },
      ratedCurrent: { label: 'Rated current', unit: 'A', value: 0.5, min: 0.0001 },
    },
    draw: () => `
      <path d="M -40 0 H -10 M 10 0 H 40" />
      <rect x="-10" y="-6" width="20" height="12" />
      <path class="thick" d="M -16 -26 V -10 M 16 -24 V -12" />
      <path class="link" d="M -10 -14 H 10" />
      ${SOUND_WAVES}`,
  },
};

export const models: ModelDefs<'buzzer' | 'piezo' | 'bell' | 'chime'> = {
  // A magnetic buzzer's rough buzz: its armature hits the pole piece twice a
  // mains cycle on AC (100 Hz at 50 Hz), at its interrupter's rate on DC.
  buzzer: sounder(
    (_p, r) => ({ voice: 'buzz', frequency: 320, wave: 'sawtooth', rate: acPart(r) > r.vavg ? 100 : 120 }),
    'buzzer',
  ),
  // An active piezo: a steady shrill tone.
  piezo: sounder((p) => ({ voice: 'tone', frequency: p.frequency, wave: 'square' }), 'polar'),
  // The bell's hammer strikes the gong about 18 times a second.
  bell: sounder(() => ({ voice: 'bell', frequency: 1100, wave: 'sine', rate: 18 }), 'rms'),
  // Ding (E5) on, dong (C5) off.
  chime: sounder(() => ({ voice: 'chime', frequency: 659, second: 523, wave: 'sine' }), 'rms'),
};
