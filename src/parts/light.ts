// Light from coloured LEDs that mix (RGB LEDs): what each die gives off, added
// up as light, and the colour and brightness a screen can show for it.

export type Linear = [number, number, number]; // linear-light sRGB

// The colour of each die (red ≈ 625 nm, green ≈ 525 nm, blue ≈ 465 nm) in
// linear sRGB. Real LED greens and blues lie outside what a screen can show;
// these are the nearest the screen gets.
export const LED_PRIMARIES: Record<'red' | 'green' | 'blue', Linear> = {
  red: [1, 0.02, 0],
  green: [0.02, 1, 0.08],
  blue: [0.01, 0.06, 1],
};

// How bright a linear colour looks (relative luminance).
const luminance = ([r, g, b]: Linear) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

// Light from dies of colours `primaries`, each driven at `levels` (current
// over its maximum) and as bright at its maximum as `intensities` (cd, from a
// datasheet). Scaled so 1 is an average die at full current, so three equal
// currents give the tinted white a real part does.
export function emitted(primaries: Linear[], levels: number[], intensities: number[]): Linear {
  const average = intensities.reduce((sum, x) => sum + x, 0) / intensities.length || 1;
  const out: Linear = [0, 0, 0];
  primaries.forEach((c, k) => {
    const amount = (Math.max(0, levels[k] ?? 0) * intensities[k]) / average / luminance(c);
    for (let i = 0; i < 3; i++) out[i] += c[i] * amount;
  });
  return out;
}

const encode = (x: number) => Math.round(255 * (x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055));

// A linear colour at full strength as #rrggbb: the hue and saturation of the
// light, whatever its brightness.
export function hue(c: Linear): string {
  const top = Math.max(...c);
  if (top <= 0) return '#ffffff';
  return `#${c.map((x) => encode(Math.max(0, x) / top).toString(16).padStart(2, '0')).join('')}`;
}

// What to paint for light `c`: its colour, how strongly to show it (the eye
// sees brightness roughly as a square root, as for the other lights) and how
// far it overexposes into a white-hot centre, as a bright LED does to eyes
// and cameras.
export function mixedLight(c: Linear): { color: string; glow: number; hot: number } {
  const y = luminance(c);
  return { color: hue(c), glow: Math.sqrt(Math.min(1, y)), hot: Math.min(1, Math.max(0, (y - 0.5) / 2.5)) };
}

const DIES = [[-2.5, -1.5], [2.5, -1.5], [0, 2.5]]; // for a lens of radius 16

// A spot of mixed light at (x, y): a lens of radius r with a halo out to
// `halo`, lit from light triplet `mix` (the model's light[3·mix …]) and its
// dies from segments 3·mix … 3·mix + 2. The colours come from the CSS
// variables editor.paintMix sets on the spot. A diffused lens blends the
// dies into one colour; through a clear one the lit dies show as points.
export function mixedSpot({ x = 0, y = 0, r, halo, lens = 'diffused', mix = 0 }: {
  x?: number;
  y?: number;
  r: number;
  halo: number;
  lens?: 'diffused' | 'clear';
  mix?: number;
}): string {
  const dies = (cls: string, size: number, lit: boolean) =>
    (['red', 'green', 'blue'] as const)
      .map((c, k) => {
        const [dx, dy] = DIES[k].map((d) => (d * r) / 16);
        const seg = lit ? ` data-seg="${3 * mix + k}"` : '';
        return `<circle class="${cls}"${seg} cx="${x + dx}" cy="${y + dy}" r="${(size * r) / 16}" style="${lit ? 'opacity: 0; ' : ''}fill: ${hue(LED_PRIMARIES[c])}" />`;
      })
      .join('');
  const at = `cx="${x}" cy="${y}"`;
  return `<g class="mix" data-mix="${mix}">
    <circle class="rgb-halo" ${at} r="${halo}" mask="url(#glow-mask)" />
    <circle class="rgb-lens ${lens}" ${at} r="${r}" />
    ${dies('rgb-die', 1.6, false)}
    <circle class="rgb-wash ${lens}" ${at} r="${r}" />
    ${lens === 'clear' ? dies('seg-lit rgb-die-lit', 2.4, true) : ''}
    <circle class="rgb-core" ${at} r="${0.75 * r}" mask="url(#glow-mask)" />
  </g>`;
}
