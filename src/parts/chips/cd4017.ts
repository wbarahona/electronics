import { chip } from '../symbols.ts';
import { cmos } from '../../sim/shared/logic.ts';
import type { ModelDefs } from '../../sim/models.ts';
import type { PartDefs } from '../defs.ts';
import type { PropsByType } from '../../types.ts';

// The values each of these parts carries: what the properties panel edits
// and the simulator reads (gathered into PropsByType in src/types.ts).
export interface PartProps {
  cd4017: { maxCurrent: number }; // decade counter, ten decoded outputs
}

// Pins (index = pin − 1): inputs CLK, INH, RST; outputs Q0–Q9 and CO.
const cd4017Model = cmos<PropsByType['cd4017']>({
  vdd: 15,
  vss: 7,
  inputs: [13, 12, 14],
  outputs: [2, 1, 3, 6, 9, 0, 4, 5, 8, 10, 11],
  rOut: 1000,
  logic(state, [clk, inh, rst], was) {
    let count = state.count ?? 0;
    if (rst) count = 0;
    else if (was && clk && !was[0] && !inh) count = (count + 1) % 10;
    state.count = count;
    return [...Array.from({ length: 10 }, (_, k) => k === count), count < 5];
  },
  readout: (state) => [['Count', `Q${state.count ?? 0}`], ['Carry out', (state.count ?? 0) < 5 ? 'high' : 'low']],
});

export const defs: PartDefs<'cd4017'> = {
  // CD4017: decade counter; each rising CLK edge (with INH low) moves the one
  // high output Q0 → Q9 → Q0; RST high returns to Q0; CO is high for 0–4.
  cd4017: {
    name: 'CD4017 counter',
    letter: 'K',
    category: 'chips',
    group: 'Counters & decoders',
    pins: [
      { x: 60, y: 0 }, { x: 60, y: -80 }, { x: 60, y: -100 }, { x: 60, y: -60 }, { x: 60, y: 20 }, { x: 60, y: 40 },
      { x: 60, y: -40 }, { x: 0, y: 120 }, { x: 60, y: 60 }, { x: 60, y: -20 }, { x: 60, y: 80 }, { x: 60, y: 100 },
      { x: -60, y: -20 }, { x: -60, y: -60 }, { x: -60, y: 20 }, { x: 0, y: -120 },
    ],
    props: { maxCurrent: { label: 'Max output current', unit: 'A', value: 0.01, min: 0.001 } },
    tag: () => 'CD4017',
    hit: { w: 120, h: 250 },
    labelAt: () => [44, -124, 'start'],
    draw: () =>
      chip({ w: 40, h: 110 }, '4017', [
        ['Q5', 1, 60, 0], ['Q1', 2, 60, -80], ['Q0', 3, 60, -100], ['Q2', 4, 60, -60], ['Q6', 5, 60, 20], ['Q7', 6, 60, 40],
        ['Q3', 7, 60, -40], ['VSS', 8, 0, 120], ['Q8', 9, 60, 60], ['Q4', 10, 60, -20], ['Q9', 11, 60, 80], ['CO', 12, 60, 100],
        ['INH', 13, -60, -20], ['<tspan dx="5">CLK</tspan>', 14, -60, -60], ['RST', 15, -60, 20], ['VDD', 16, 0, -120],
      ]) + '<path class="clock-mark" d="M -40 -64 L -34 -60 L -40 -56" />',
  },
};

export const models: ModelDefs<'cd4017'> = {
  cd4017: cd4017Model,
};
