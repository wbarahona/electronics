import { formatSI } from './units.ts';

const CHANNELS = ['CH1', 'CH2'] as const;
export type Channel = (typeof CHANNELS)[number];

const DIVS_X = 10;
const DIVS_Y = 8;
const SCREEN_SECONDS = 2; // real seconds of history across the screen, at any speed
const CAPACITY = 1 << 16; // samples kept per channel (a ring)
const STEPS = [1, 2, 5]; // volts/div and time/div run 1, 2, 5, 10, 20, 50…
const SCALE_SIDE = 56; // px beside the screen for each channel's volts
const SCALE_BOTTOM = 22; // px under it for the time

// The screen's colours on paper: white, a grey graticule, the channels in the
// light theme's tertiary (CH1) and primary (CH2).
const LIGHT: Record<string, string> = {
  '--scope-bg': '#ffffff',
  '--scope-border': '#c2c6d6',
  '--scope-grid': '#e6e8ef',
  '--scope-axis': '#9aa0ac',
  '--ch1': '#246200',
  '--ch2': '#0051ae',
  '--ch1-role': '#246200',
  '--ch2-role': '#0051ae',
  '--md-sys-color-on-surface-variant': '#424753',
};

// The smallest 1-2-5 step that is at least x.
function niceStep(x: number): number {
  if (!(x > 0)) return 1;
  const decade = 10 ** Math.floor(Math.log10(x));
  for (const s of STEPS) if (s * decade >= x * (1 - 1e-9)) return s * decade;
  return 10 * decade;
}

// The oscilloscope: a strip across the bottom of the screen showing the
// voltage at each probe over the last SCREEN_SECONDS of real time (so the
// time base follows the simulation speed), recorded after every simulation
// step. It rolls: the newest moment at the right edge. Each channel scales
// itself so its trace fits; both share the centre line as 0 V. Scales sit
// outside the screen: CH1's volts to its left and CH2's to its right (each in
// its channel's colour) at every grid line, and the time before now below.
export function createScope(root: HTMLElement) {
  const canvas = root.querySelector('canvas')!;
  const ctx = canvas.getContext('2d')!;
  const labels = Object.fromEntries(CHANNELS.map((ch) => [ch, root.querySelector<HTMLElement>(`[data-channel="${ch}"]`)!]));
  const timeLabel = root.querySelector<HTMLElement>('.scope-time')!;

  const times = new Float64Array(CAPACITY);
  const values = CHANNELS.map(() => new Float64Array(CAPACITY).fill(NaN));
  let head = 0; // next slot to write
  let count = 0;

  function clear() {
    head = 0;
    count = 0;
  }

  // One sample: the time reached and each channel's voltage (NaN: no probe).
  function record(t: number, vs: number[]) {
    if (count && t < times[(head - 1 + CAPACITY) % CAPACITY]) clear(); // time went back: a new run
    times[head] = t;
    vs.forEach((v, k) => (values[k][head] = v));
    head = (head + 1) % CAPACITY;
    count = Math.min(count + 1, CAPACITY);
  }

  // Keep the canvas sharp at the current size.
  new ResizeObserver(() => {
    const r = canvas.getBoundingClientRect();
    canvas.width = Math.round(r.width * devicePixelRatio);
    canvas.height = Math.round(r.height * devicePixelRatio);
  }).observe(canvas);

  let shownAt = 0; // the time and speed last drawn, for snapshots
  let shownSpeed = 1;

  function draw(now: number, speed: number) {
    if (root.hidden) return;
    shownAt = now;
    shownSpeed = speed;
    const style = getComputedStyle(root);
    render(ctx, canvas.width, canvas.height, devicePixelRatio, (name) => style.getPropertyValue(name), now, speed, true);
  }

  // A picture of the screen as last drawn, in light colours (for printing),
  // as a PNG data URL `width` × `height` CSS pixels at twice their density.
  function snapshot(width: number, height: number): string {
    const out = document.createElement('canvas');
    out.width = width * 2;
    out.height = height * 2;
    render(out.getContext('2d')!, out.width, out.height, 2, (name) => LIGHT[name] ?? '#000', shownAt, shownSpeed, false);
    return out.toDataURL('image/png');
  }

  // Draw the screen and its scales into `ctx` (w × h device pixels, `dpr` per
  // CSS pixel) with colours from `color`; `live` also updates the header.
  function render(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    dpr: number,
    color: (name: string) => string,
    now: number,
    speed: number,
    live: boolean,
  ) {
    ctx.clearRect(0, 0, w, h);

    const span = SCREEN_SECONDS * speed;
    const start = now - span;
    if (live) timeLabel.textContent = `${formatSI(span / DIVS_X, 's')}/div`;

    // The screen, inset to leave margins for the scales: volts left (CH1)
    // and right (CH2), time below.
    const [ml, mr, mt, mb] = [SCALE_SIDE * dpr, SCALE_SIDE * dpr, 8 * dpr, SCALE_BOTTOM * dpr];
    const sx = ml;
    const sy = mt;
    const sw = Math.max(1, w - ml - mr);
    const sh = Math.max(1, h - mt - mb);
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(sx, sy, sw, sh, 12 * dpr);
    ctx.fillStyle = color('--scope-bg');
    ctx.fill();
    const border = color('--scope-border');
    if (border) {
      ctx.lineWidth = dpr;
      ctx.strokeStyle = border;
      ctx.stroke();
    }
    ctx.clip();

    // Graticule, with the 0 V line stronger.
    ctx.lineWidth = dpr;
    ctx.strokeStyle = color('--scope-grid');
    ctx.beginPath();
    for (let k = 1; k < DIVS_X; k++) {
      const x = Math.round(sx + (k * sw) / DIVS_X) + 0.5;
      ctx.moveTo(x, sy);
      ctx.lineTo(x, sy + sh);
    }
    for (let k = 1; k < DIVS_Y; k++) {
      const y = Math.round(sy + (k * sh) / DIVS_Y) + 0.5;
      ctx.moveTo(sx, y);
      ctx.lineTo(sx + sw, y);
    }
    ctx.stroke();
    ctx.strokeStyle = color('--scope-axis');
    ctx.beginPath();
    ctx.moveTo(sx, Math.round(sy + sh / 2) + 0.5);
    ctx.lineTo(sx + sw, Math.round(sy + sh / 2) + 0.5);
    ctx.stroke();

    // The samples on screen, oldest first.
    const first = (head - count + CAPACITY) % CAPACITY;
    let from = 0;
    while (from < count && times[(first + from) % CAPACITY] < start) from++;

    // Each channel's scale (null: no probe), from the largest swing on screen.
    const scales = CHANNELS.map((_, c) => {
      let peak = 0;
      let last = NaN;
      for (let k = from; k < count; k++) {
        const v = values[c][(first + k) % CAPACITY];
        if (Number.isNaN(v)) continue;
        peak = Math.max(peak, Math.abs(v));
        last = v;
      }
      return Number.isNaN(last) ? null : { perDiv: niceStep(peak / (DIVS_Y / 2)), last };
    });

    CHANNELS.forEach((ch, c) => {
      const vs = values[c];
      const scale = scales[c];
      const label = labels[ch];
      if (!scale) {
        if (live) label.textContent = `${ch} —`;
        return;
      }
      const { perDiv, last } = scale;
      if (live) label.textContent = `${ch} ${formatSI(perDiv, 'V')}/div · ${formatSI(last, 'V')}`;
      const y = (v: number) => sy + sh / 2 - (v / (perDiv * DIVS_Y)) * sh;

      // One vertical stroke per pixel column from its lowest to highest
      // sample, joined to the next: every step shows, however many there are.
      ctx.strokeStyle = color(`--${ch.toLowerCase()}`);
      ctx.lineWidth = 1.5 * dpr;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      let col = -1;
      let lo = 0;
      let hi = 0;
      let started = false;
      const flush = () => {
        if (col < 0) return;
        if (!started) ctx.moveTo(col, lo);
        else ctx.lineTo(col, lo);
        if (hi !== lo) ctx.lineTo(col, hi);
        started = true;
      };
      for (let k = from; k < count; k++) {
        const i = (first + k) % CAPACITY;
        const v = vs[i];
        if (Number.isNaN(v)) continue;
        const x = Math.round(sx + ((times[i] - start) / span) * sw);
        const py = y(v);
        if (x !== col) {
          flush();
          col = x;
          lo = hi = py;
        } else {
          lo = Math.max(lo, py);
          hi = Math.min(hi, py);
        }
      }
      flush();
      ctx.stroke();
    });
    ctx.restore();

    // Scales in the margins: each channel's volts beside every horizontal
    // grid line, in its colour; time before now under every vertical one.
    const gap = 6 * dpr;
    ctx.font = `500 ${11 * dpr}px ui-monospace, 'SF Mono', Menlo, monospace`;
    ctx.textBaseline = 'middle';
    scales.forEach((scale, c) => {
      if (!scale) return;
      ctx.fillStyle = color(`--${CHANNELS[c].toLowerCase()}-role`);
      ctx.textAlign = c === 0 ? 'right' : 'left';
      for (let k = 0; k <= DIVS_Y; k++) {
        ctx.fillText(formatSI((DIVS_Y / 2 - k) * scale.perDiv, 'V'), c === 0 ? sx - gap : sx + sw + gap, sy + (k * sh) / DIVS_Y);
      }
    });
    ctx.fillStyle = color('--md-sys-color-on-surface-variant');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let k = 0; k <= DIVS_X; k++) {
      const t = -((DIVS_X - k) * span) / DIVS_X;
      ctx.fillText(k === DIVS_X ? 'now' : formatSI(t, 's'), sx + (k * sw) / DIVS_X, sy + sh + gap / 2);
    }
  }

  function toggle(open = root.hidden) {
    root.hidden = !open;
  }

  root.querySelector('.scope-close')!.addEventListener('click', () => toggle(false));

  return { record, clear, draw, snapshot, toggle, CHANNELS };
}
