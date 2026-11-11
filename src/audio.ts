import type { Sound } from './sim/models.ts';

const VOLUME = 0.08; // a sounder at full level; sounds add up, so keep it gentle
const RAMP = 0.02; // s, to start and stop without clicks
const LOOKAHEAD = 0.1; // s of bell strikes scheduled ahead on the audio clock

// A struck metal bar or gong: partials at these multiples of its note (out
// of tune with each other, which is what makes it sound metallic), each
// fading faster the higher it is.
const METAL = [
  { ratio: 1, gain: 1, decay: 1 },
  { ratio: 2.76, gain: 0.45, decay: 0.6 },
  { ratio: 5.4, gain: 0.25, decay: 0.35 },
];

interface Voice {
  update(sound: Sound, now: number): void;
  stop(now: number, quiet: boolean): void;
}

// Plays every sounding part (Web Audio), one voice per part, each made the
// way its kind sounds (see Sound). Browsers only allow sound after the page
// has been interacted with; the first sounds come after pressing Run, which
// counts.
export function createAudio() {
  let ctx: AudioContext | null = null;
  const voices = new Map<string, Voice>();

  // A gain node into the speakers, for one voice's overall level.
  function output(ac: AudioContext): GainNode {
    const gain = ac.createGain();
    gain.gain.value = 0;
    gain.connect(ac.destination);
    return gain;
  }

  // One strike of a metal bar of note `freq` into `to` at time t, ringing for
  // about `ring` seconds.
  function strike(ac: AudioContext, to: AudioNode, freq: number, t: number, ring: number) {
    for (const { ratio, gain, decay } of METAL) {
      const osc = ac.createOscillator();
      const env = ac.createGain();
      osc.frequency.value = freq * ratio;
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(gain, t + 0.003);
      env.gain.exponentialRampToValueAtTime(0.0001, t + ring * decay);
      osc.connect(env).connect(to);
      osc.start(t);
      osc.stop(t + ring * decay + 0.05);
    }
  }

  function toneVoice(ac: AudioContext): Voice {
    const out = output(ac);
    const osc = ac.createOscillator();
    osc.connect(out);
    osc.start();
    return {
      update(s, now) {
        osc.type = s.wave;
        osc.frequency.setTargetAtTime(s.frequency, now, RAMP);
        out.gain.setTargetAtTime(s.level * VOLUME, now, RAMP);
      },
      stop(now) {
        out.gain.setTargetAtTime(0, now, RAMP);
        osc.stop(now + RAMP * 5);
      },
    };
  }

  // A rough tone (soft-clipped) switched on and off `rate` times a second.
  function buzzVoice(ac: AudioContext): Voice {
    const out = output(ac);
    const osc = ac.createOscillator();
    const rough = ac.createWaveShaper();
    rough.curve = Float32Array.from({ length: 256 }, (_, k) => Math.tanh(3 * (k / 127.5 - 1)));
    const chop = ac.createGain();
    chop.gain.value = 0.5;
    const lfo = ac.createOscillator();
    lfo.type = 'square';
    const depth = ac.createGain();
    depth.gain.value = 0.5; // chop.gain swings 0 .. 1
    lfo.connect(depth).connect(chop.gain);
    osc.connect(rough).connect(chop).connect(out);
    osc.start();
    lfo.start();
    return {
      update(s, now) {
        osc.type = s.wave;
        osc.frequency.setTargetAtTime(s.frequency, now, RAMP);
        lfo.frequency.setTargetAtTime(s.rate ?? 100, now, RAMP);
        out.gain.setTargetAtTime(s.level * VOLUME, now, RAMP);
      },
      stop(now) {
        out.gain.setTargetAtTime(0, now, RAMP);
        osc.stop(now + RAMP * 5);
        lfo.stop(now + RAMP * 5);
      },
    };
  }

  // A hammer striking a gong `rate` times a second, scheduled a little ahead.
  function bellVoice(ac: AudioContext): Voice {
    const out = output(ac);
    let next = ac.currentTime;
    return {
      update(s, now) {
        out.gain.setTargetAtTime(s.level * VOLUME * 0.7, now, RAMP);
        const gap = 1 / (s.rate ?? 18);
        next = Math.max(next, now);
        while (next < now + LOOKAHEAD) {
          strike(ac, out, s.frequency, next, 0.25);
          next += gap;
        }
      },
      stop(now) {
        // The last strikes ring out on their own.
        out.gain.setTargetAtTime(0, now + 0.2, 0.1);
      },
    };
  }

  // Ding when it starts; dong (the second bar) when it stops, unless the
  // simulation was only paused.
  function chimeVoice(ac: AudioContext, first: Sound): Voice {
    const out = output(ac);
    out.gain.value = first.level * VOLUME * 1.5;
    strike(ac, out, first.frequency, ac.currentTime, 1.8);
    let last = first;
    return {
      update(s) {
        last = s;
      },
      stop(now, quiet) {
        if (!quiet) strike(ac, out, last.second ?? last.frequency, now, 1.8);
        else out.gain.setTargetAtTime(0, now, RAMP);
      },
    };
  }

  // Make the given sounds play (by part id) and stop any others; `quiet`
  // stops them without a closing sound (the simulation was paused).
  function play(sounds: Map<string, Sound>, quiet = false) {
    if (!sounds.size && !voices.size) return;
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    const now = ctx.currentTime;
    for (const [id, voice] of voices) {
      if (sounds.has(id)) continue;
      voice.stop(now, quiet);
      voices.delete(id);
    }
    for (const [id, sound] of sounds) {
      let voice = voices.get(id);
      if (!voice) {
        const make = { tone: toneVoice, buzz: buzzVoice, bell: bellVoice, chime: chimeVoice }[sound.voice ?? 'tone'];
        voice = make(ctx, sound);
        voices.set(id, voice);
      }
      voice.update(sound, now);
    }
  }

  return { play };
}
