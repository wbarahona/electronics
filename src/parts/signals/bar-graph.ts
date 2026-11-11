import { ledGroup } from '../../sim/shared/leds.ts';
import { pinText } from '../symbols.ts';
import type { ModelDefs } from '../../sim/models.ts';
import type { PartDefs } from '../defs.ts';
import type { LedColor, PropsByType } from '../../types.ts';

// The values each of these parts carries: what the properties panel edits
// and the simulator reads (gathered into PropsByType in src/types.ts).
export interface PartProps {
  // Ten LEDs in a row on a common pin; max current is per segment.
  barGraph: { color: LedColor; common: 'cathode' | 'anode'; forwardVoltage: number; maxCurrent: number };
}

export const defs: PartDefs<'barGraph'> = {
  // Ten segments (pins 1–10 down the left), then the common pin.
  barGraph: {
    name: 'LED bar graph',
    letter: 'P',
    category: 'signals',
    group: 'Displays',
    pins: [...Array.from({ length: 10 }, (_, k) => ({ x: -40, y: -100 + 20 * k })), { x: 40, y: 80 }],
    props: {
      color: { label: 'Colour', value: 'green', options: ['red', 'yellow', 'green', 'blue', 'white'] },
      common: { label: 'Common', value: 'cathode', options: ['cathode', 'anode'] },
      forwardVoltage: { label: 'Forward voltage', unit: 'V', value: 2, min: 0.1 },
      maxCurrent: { label: 'Max current (segment)', unit: 'A', value: 0.02, min: 0.0001 },
    },
    glow: { color: (p) => p.color, radius: 0 },
    hit: { w: 80, h: 220 },
    labelAt: () => [24, -114, 'start'],
    draw: (p) => `
      <rect x="-20" y="-110" width="40" height="200" rx="3" />
      <path d="${Array.from({ length: 10 }, (_, k) => `M -40 ${-100 + 20 * k} H -20`).join(' ')} M 20 80 H 40" />
      ${Array.from({ length: 10 }, (_, k) => {
        const y = -104 + 20 * k;
        return `<rect class="bar-off" x="-10" y="${y}" width="20" height="8" rx="1" />
          <rect class="bar-lit" data-seg="${k}" x="-10" y="${y}" width="20" height="8" rx="1" style="opacity: 0" />`;
      }).join('')}
      ${pinText(p.common === 'cathode' ? 'K' : 'A', 23, 76)}`,
  },
};

export const models: ModelDefs<'barGraph'> = {
  barGraph: ledGroup<PropsByType['barGraph']>(Array.from({ length: 10 }, (_, k) => String(k + 1)), (p) => p.forwardVoltage),
};
