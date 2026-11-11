import { ledGroup } from '../../sim/shared/leds.ts';
import { LIGHT_COLORS, type LightColor, type PartDefs } from '../defs.ts';
import { pinText } from '../symbols.ts';
import type { ModelDefs } from '../../sim/models.ts';
import type { PropsByType } from '../../types.ts';

// The values each of these parts carries: what the properties panel edits
// and the simulator reads (gathered into PropsByType in src/types.ts).
export interface PartProps {
  // Red, green and blue LEDs in one package (pins R, G, B, then common);
  // maxCurrent is per colour. Mixed, they make any colour.
  rgbLed: { common: 'cathode' | 'anode'; redVoltage: number; greenVoltage: number; blueVoltage: number; maxCurrent: number };
}

export const defs: PartDefs<'rgbLed'> = {
  // Pins R, G, B, then the common one. Inside, a spot of each colour lights
  // with its LED; where spots overlap their light adds up (red + green =
  // yellow, all three = white).
  rgbLed: {
    name: 'RGB LED',
    letter: 'P',
    category: 'signals',
    group: 'Lights',
    pins: [{ x: -40, y: -20 }, { x: -40, y: 0 }, { x: -40, y: 20 }, { x: 40, y: 0 }],
    props: {
      common: { label: 'Common', value: 'cathode', options: ['cathode', 'anode'] },
      redVoltage: { label: 'Red forward voltage', unit: 'V', value: 2, min: 0.1 },
      greenVoltage: { label: 'Green forward voltage', unit: 'V', value: 3, min: 0.1 },
      blueVoltage: { label: 'Blue forward voltage', unit: 'V', value: 3, min: 0.1 },
      maxCurrent: { label: 'Max current (each)', unit: 'A', value: 0.02, min: 0.0001 },
    },
    draw: (p) => `
      <path d="M -40 -20 H -24 L -13 -9 M -40 0 H -16 M -40 20 H -24 L -13 9 M 40 0 H 16" />
      <circle r="16" />
      <g class="rgb-mix">
        ${['red', 'green', 'blue']
          .map((c, k) => {
            const [x, y] = [[-3.5, -3], [3.5, -3], [0, 3.5]][k];
            return `<circle class="rgb-off" cx="${x}" cy="${y}" r="7" style="fill: ${LIGHT_COLORS[c as LightColor]}" />
              <circle class="seg-lit rgb-lit" data-seg="${k}" cx="${x}" cy="${y}" r="7" style="opacity: 0; fill: ${LIGHT_COLORS[c as LightColor]}" />`;
          })
          .join('')}
      </g>
      <path d="M 8 -18 L 15 -25 M 10 -25 H 15 V -20 M 15 -13 L 22 -20 M 17 -20 H 22 V -15" />
      ${pinText('R', -37, -24)}${pinText('G', -37, -4)}${pinText('B', -37, 16)}${pinText(p.common === 'cathode' ? 'K' : 'A', 30, -4)}`,
  },
};

export const models: ModelDefs<'rgbLed'> = {
  // Typical forward voltages: red 2 V, green and blue 3 V.
  rgbLed: ledGroup<PropsByType['rgbLed']>(['red', 'green', 'blue'], (p, k) => [p.redVoltage, p.greenVoltage, p.blueVoltage][k]),
};
