// Components are never exactly their marked value: each one sits somewhere
// within its tolerance (±5 % for a common resistor), so two "identical"
// circuits differ slightly. A part with a tolerance carries it as a setting,
// plus the deviation it drew when it was made (−1 .. 1 of the tolerance),
// kept with it so it behaves the same every time. The simulator applies them
// only when Settings › Simulation asks for the real spread.
export type Tolerance = { tolerance: number; deviation: number };

// Most parts land near their value, a few near the edge of the band: a
// normal spread (σ = half the tolerance) clipped to it.
function drawDeviation(): number {
  const u = 1 - Math.random();
  const normal = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * Math.random());
  return Math.round(Math.max(-1, Math.min(1, normal / 2)) * 1000) / 1000;
}

// The settings to add to a part's props, with its usual tolerance in %.
export const toleranceProps = (percent: number) => ({
  tolerance: { label: 'Tolerance', unit: '%', value: percent, min: 0, max: 50 },
  deviation: { label: 'Deviation', unit: '', value: 0, hidden: true, fresh: drawDeviation },
});
