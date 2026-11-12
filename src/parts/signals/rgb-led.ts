import { ledGroup } from '../../sim/shared/leds.ts';
import type { PartDefs } from '../defs.ts';
import { LED_PRIMARIES, emitted, mixedSpot } from '../light.ts';
import { pinText } from '../symbols.ts';
import type { ModelDefs } from '../../sim/models.ts';
import type { PropsByType } from '../../types.ts';

// The values each of these parts carries: what the properties panel edits
// and the simulator reads (gathered into PropsByType in src/types.ts).
export interface PartProps {
  // Red, green and blue LEDs in one package (pins R, G, B, then common);
  // maxCurrent is per colour. Mixed, they make any colour. Each colour's
  // intensity is how bright it is at maxCurrent (cd): green outshines red and
  // blue, so equal currents give a tinted white and real circuits balance
  // them with different resistors. A diffused lens blends the three into one
  // colour; through a clear one the dies show as points of their own colour.
  rgbLed: {
    common: 'cathode' | 'anode';
    lens: 'diffused' | 'clear';
    redVoltage: number;
    greenVoltage: number;
    blueVoltage: number;
    maxCurrent: number;
    redIntensity: number;
    greenIntensity: number;
    blueIntensity: number;
  };
}

const COLORS = ['red', 'green', 'blue'] as const;
const PRIMARIES = COLORS.map((c) => LED_PRIMARIES[c]);

export const defs: PartDefs<'rgbLed'> = {
  // Pins R, G, B, then the common one. The lens fills with the colour of the
  // three dies' light added up (see mixedSpot).
  rgbLed: {
    name: 'RGB LED',
    letter: 'P',
    category: 'signals',
    group: 'Lights',
    pins: [{ x: -40, y: -20 }, { x: -40, y: 0 }, { x: -40, y: 20 }, { x: 40, y: 0 }],
    props: {
      common: { label: 'Common', value: 'cathode', options: ['cathode', 'anode'] },
      lens: { label: 'Lens', value: 'diffused', options: ['diffused', 'clear'] },
      redVoltage: { label: 'Red forward voltage', unit: 'V', value: 2, min: 0.1 },
      greenVoltage: { label: 'Green forward voltage', unit: 'V', value: 3, min: 0.1 },
      blueVoltage: { label: 'Blue forward voltage', unit: 'V', value: 3, min: 0.1 },
      maxCurrent: { label: 'Max current (each)', unit: 'A', value: 0.02, min: 0.0001 },
      // Typical of a 5 mm RGB LED at 20 mA.
      redIntensity: { label: 'Red intensity', unit: 'cd', value: 0.8, min: 0.001 },
      greenIntensity: { label: 'Green intensity', unit: 'cd', value: 2, min: 0.001 },
      blueIntensity: { label: 'Blue intensity', unit: 'cd', value: 0.5, min: 0.001 },
    },
    draw: (p) => `
      <path d="M -40 -20 H -24 L -13 -9 M -40 0 H -16 M -40 20 H -24 L -13 9 M 40 0 H 16" />
      ${mixedSpot({ r: 16, halo: 30, lens: p.lens })}
      <circle r="16" />
      <path d="M 8 -18 L 15 -25 M 10 -25 H 15 V -20 M 15 -13 L 22 -20 M 17 -20 H 22 V -15" />
      ${pinText('R', -37, -24)}${pinText('G', -37, -4)}${pinText('B', -37, 16)}${pinText(p.common === 'cathode' ? 'K' : 'A', 30, -4)}`,
  },
};

// Typical forward voltages: red 2 V, green and blue 3 V.
const group = ledGroup<PropsByType['rgbLed']>([...COLORS], (p, k) => [p.redVoltage, p.greenVoltage, p.blueVoltage][k]);

export const models: ModelDefs<'rgbLed'> = {
  rgbLed: {
    ...group,
    light: (r, p) => emitted(PRIMARIES, group.segments!(r, p), [p.redIntensity, p.greenIntensity, p.blueIntensity]),
  },
};
