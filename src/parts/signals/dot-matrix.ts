import { diode, stampJunction } from '../../sim/shared/junctions.ts';
import { fmt } from '../../sim/shared/readout.ts';
import type { PartDefs } from '../defs.ts';
import { LED_PRIMARIES, emitted, mixedSpot } from '../light.ts';
import { pinText } from '../symbols.ts';
import type { Element, ModelDefs, Result, Stamper } from '../../sim/models.ts';
import type { LedColor, Point, PropsByType } from '../../types.ts';

// The values each of these parts carries: what the properties panel edits
// and the simulator reads (gathered into PropsByType in src/types.ts).
export interface PartProps {
  // A dot-matrix LED display: `columns` × `rows` dots, each an LED between
  // its row line and its column line (rows are the anodes or the cathodes).
  // In colour RGB each dot is a red, a green and a blue LED with a column
  // line each. Forward voltage is for a single colour; max current is per LED.
  dotMatrix: {
    columns: number;
    rows: number;
    color: LedColor | 'RGB';
    rowsAre: 'anodes' | 'cathodes';
    forwardVoltage: number;
    maxCurrent: number;
  };
}

type Props = PropsByType['dotMatrix'];

// An RGB dot's forward voltages and intensities at max current (cd, typical
// of an RGB matrix module): red, green, blue.
const RGB_VOLTAGES = [2, 3, 3];
const RGB_INTENSITIES = [0.8, 2, 0.5];
const RGB_PRIMARIES = (['red', 'green', 'blue'] as const).map((c) => LED_PRIMARIES[c]);
const MAX_SIZE = 16;

const size = (n: number) => Math.min(MAX_SIZE, Math.max(1, Math.round(n)));

// Where everything goes. Dots sit on the grid, 20 apart (40 for RGB, whose
// columns need three pins each). Row pins are down the left; column pins
// along the bottom, or for RGB red along the bottom and green and blue along
// the top, so every pin lands on the grid.
function layout(p: Props) {
  const cols = size(p.columns);
  const rows = size(p.rows);
  const rgb = p.color === 'RGB';
  const pitch = rgb ? 40 : 20;
  const x = (c: number) => pitch * (c - Math.floor(cols / 2));
  const y = (r: number) => pitch * (r - Math.floor(rows / 2));
  const box = { left: x(0) - 20, right: x(cols - 1) + (rgb ? 30 : 20), top: y(0) - 20, bottom: y(rows - 1) + 20 };
  return { cols, rows, rgb, pitch, x, y, box };
}

// The pins, named: rows r1…, then columns c1… (or R1…, G1…, B1… for RGB).
function matrixPins(p: Props): (Point & { name: string })[] {
  const { cols, rows, rgb, x, y, box } = layout(p);
  const rowPins = Array.from({ length: rows }, (_, r) => ({ name: `r${r + 1}`, x: box.left - 20, y: y(r) }));
  const columnPins = rgb
    ? [
        ...Array.from({ length: cols }, (_, c) => ({ name: `R${c + 1}`, x: x(c), y: box.bottom + 20 })),
        ...Array.from({ length: cols }, (_, c) => ({ name: `G${c + 1}`, x: x(c), y: box.top - 20 })),
        ...Array.from({ length: cols }, (_, c) => ({ name: `B${c + 1}`, x: x(c) + 20, y: box.top - 20 })),
      ]
    : Array.from({ length: cols }, (_, c) => ({ name: `c${c + 1}`, x: x(c), y: box.bottom + 20 }));
  return [...rowPins, ...columnPins];
}

// Every LED, in the order its light level is reported (data-seg): row by
// row, column by column, and red, green, blue within an RGB dot. `row` and
// `col` are pin indexes; `fv` its forward voltage.
function leds(p: Props): { row: number; col: number; fv: number }[] {
  const { cols, rows, rgb } = layout(p);
  const out = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!rgb) out.push({ row: r, col: rows + c, fv: p.forwardVoltage });
      else for (let k = 0; k < 3; k++) out.push({ row: r, col: rows + k * cols + c, fv: RGB_VOLTAGES[k] });
    }
  }
  return out;
}

export const defs: PartDefs<'dotMatrix'> = {
  // Pins: see matrixPins.
  dotMatrix: {
    name: 'Dot-matrix display',
    letter: 'P',
    category: 'signals',
    group: 'Displays',
    pins: (p) => matrixPins(p).map(({ x, y }) => ({ x, y })),
    pinNames: (p) => matrixPins(p).map(({ name }) => name),
    props: {
      columns: { label: 'Columns', unit: '', value: 8, min: 1, max: MAX_SIZE, slider: true },
      rows: { label: 'Rows', unit: '', value: 8, min: 1, max: MAX_SIZE, slider: true },
      color: { label: 'Colour', value: 'red', options: ['red', 'yellow', 'green', 'blue', 'white', 'RGB'] },
      rowsAre: { label: 'Rows are', value: 'anodes', options: ['anodes', 'cathodes'] },
      forwardVoltage: { label: 'Forward voltage (single colour)', unit: 'V', value: 2, min: 0.1 },
      maxCurrent: { label: 'Max current (per LED)', unit: 'A', value: 0.02, min: 0.0001 },
    },
    tag: (p) => `${size(p.columns)}×${size(p.rows)}`,
    glow: { color: (p) => (p.color === 'RGB' ? 'white' : p.color), radius: 0 },
    hit: (p) => {
      const { box } = layout(p);
      const [left, right, top, bottom] = [box.left - 20, box.right, box.top - 20, box.bottom + 20];
      return { w: right - left, h: 2 * Math.max(-top, bottom), x: (left + right) / 2 };
    },
    labelAt: (_vertical, p) => {
      const { box } = layout(p);
      return [box.right + 6, box.top + 10, 'start'];
    },
    draw: (p) => {
      const { cols, rows, rgb, x, y, box } = layout(p);
      const pins = matrixPins(p);
      const leads = pins
        .map((pin) =>
          pin.name.startsWith('r') ? `M ${pin.x} ${pin.y} H ${box.left}` : pin.y > 0 ? `M ${pin.x} ${pin.y} V ${box.bottom}` : `M ${pin.x} ${pin.y} V ${box.top}`,
        )
        .join(' ');
      let dots = '';
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const i = r * cols + c;
          if (!rgb) {
            dots += `<circle class="bar-off" cx="${x(c)}" cy="${y(r)}" r="6" /><circle class="bar-lit" data-seg="${i}" cx="${x(c)}" cy="${y(r)}" r="6" style="opacity: 0" />`;
            continue;
          }
          dots += mixedSpot({ x: x(c), y: y(r), r: 9, halo: 18, mix: i });
        }
      }
      const labels = pins.map((pin) => (pin.name.startsWith('r') ? pinText(pin.name.slice(1), pin.x + 2, pin.y - 3) : pinText(pin.name, pin.x + 3, pin.y > 0 ? pin.y - 4 : pin.y + 10)));
      return `
        <path d="${leads}" />
        <rect x="${box.left}" y="${box.top}" width="${box.right - box.left}" height="${box.bottom - box.top}" rx="3" />
        ${dots}
        ${labels.join('')}`;
    },
  },
};

// --- Model -------------------------------------------------------------------------

// Each LED is a junction from its row pin to its column pin (or the other way
// when rows are the cathodes), linearised like the single LED. Light levels
// come from the voltages across them, so a scanned (multiplexed) display
// shows whatever is driven at that moment.
type El = Element<Props>;
const junctionOf = (p: Props, fv: number) => diode({ forwardVoltage: fv, maxCurrent: p.maxCurrent });
const ends = (p: Props, led: { row: number; col: number }) => (p.rowsAre === 'anodes' ? [led.row, led.col] : [led.col, led.row]);

function ledCurrents(p: Props, v: (pin: number) => number): number[] {
  return leds(p).map((led) => {
    const [a, c] = ends(p, led);
    return Math.max(0, junctionOf(p, led.fv).current(v(a) - v(c)));
  });
}

function pinCurrents(el: El, s: Stamper): number[] {
  const pins = el.nodes.map(() => 0);
  const v = (k: number) => s.v(el.nodes[k]);
  leds(el.props).forEach((led) => {
    const [a, c] = ends(el.props, led);
    const i = junctionOf(el.props, led.fv).current(v(a) - v(c));
    pins[a] += i;
    pins[c] -= i;
  });
  return pins;
}

const levels = (r: Result, p: Props) => ledCurrents(p, (k) => r.pinV[k]).map((i) => i / p.maxCurrent);

export const models: ModelDefs<'dotMatrix'> = {
  dotMatrix: {
    nonlinear: true,
    stamp(el, s) {
      const all = leds(el.props);
      const vs = (el.state.segV ??= Array(all.length).fill(0));
      all.forEach((led, i) => {
        const [a, c] = ends(el.props, led);
        stampJunction(s, vs, i, el.nodes[a], el.nodes[c], junctionOf(el.props, led.fv));
      });
    },
    current: (el, s) => ledCurrents(el.props, (k) => s.v(el.nodes[k])).reduce((sum, i) => sum + i, 0),
    pinCurrents,
    segments: levels,
    // Each RGB dot's mixed light, three numbers per dot.
    light: (r, p) => {
      if (p.color !== 'RGB') return [];
      const all = levels(r, p);
      return all.flatMap((_, i) => (i % 3 ? [] : emitted(RGB_PRIMARIES, all.slice(i, i + 3), RGB_INTENSITIES)));
    },
    brightness: (r, p) => Math.max(0, ...levels(r, p)),
    readout: (r, p) => {
      const lit = levels(r, p).filter((l) => l > 0.01).length;
      const total = ledCurrents(p, (k) => r.pinV[k]).reduce((sum, i) => sum + i, 0);
      return [
        ['Size', `${size(p.columns)} × ${size(p.rows)}${p.color === 'RGB' ? ' RGB' : ''}`],
        ['Lit LEDs', String(lit)],
        ['Current', fmt(total, 'A')],
      ];
    },
    thermal: { load: (r, p) => Math.max(0, ...levels(r, p)), tau: 0.05, limit: 1.5 },
    failure: { label: 'burnt out', open: true },
  },
};
