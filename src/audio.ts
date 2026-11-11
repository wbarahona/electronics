import type { Sound } from './sim/models.ts';

const VOLUME = 0.08; // a sounder at full level; tones add up, so keep it gentle
const RAMP = 0.02; // s, to start and stop without clicks

// Plays every sounding part's tone (Web Audio), one oscillator per part.
// Browsers only allow sound after the page has been interacted with; the
// first update comes from pressing Run, which counts.
export function createAudio() {
  let ctx: AudioContext | null = null;
  const voices = new Map<string, { osc: OscillatorNode; gain: GainNode }>();

  // Make the given tones sound (by part id) and silence any others.
  function play(sounds: Map<string, Sound>) {
    if (!sounds.size && !voices.size) return;
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    const now = ctx.currentTime;
    for (const [id, voice] of voices) {
      if (sounds.has(id)) continue;
      voice.gain.gain.setTargetAtTime(0, now, RAMP);
      voice.osc.stop(now + RAMP * 5);
      voices.delete(id);
    }
    for (const [id, { frequency, wave, level }] of sounds) {
      let voice = voices.get(id);
      if (!voice) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        gain.gain.value = 0;
        osc.connect(gain).connect(ctx.destination);
        osc.start();
        voice = { osc, gain };
        voices.set(id, voice);
      }
      voice.osc.type = wave;
      voice.osc.frequency.setTargetAtTime(frequency, now, RAMP);
      voice.gain.gain.setTargetAtTime(level * VOLUME, now, RAMP);
    }
  }

  return { play };
}
