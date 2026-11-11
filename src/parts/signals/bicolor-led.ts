import { basicReadout } from '../../sim/shared/readout.ts';
import { diode, stampJunction } from '../../sim/shared/junctions.ts';
import { LIGHT_COLORS, type PartDefs } from '../defs.ts';
import type { Element, ModelDef, ModelDefs, Result, Stamper } from '../../sim/models.ts';
import type { PropsByType } from '../../types.ts';

// The values each of these parts carries: what the properties panel edits
// and the simulator reads (gathered into PropsByType in src/types.ts).
export interface PartProps {
  // Red and green LEDs back to back: red lights with pin 0 positive, green
  // with pin 1 positive.
  bicolorLed: { redVoltage: number; greenVoltage: number; maxCurrent: number };
}

// --- Bi-colour LED ------------------------------------------------------------

// Red from pin 0 to 1, green from 1 to 0.
const bicolorModel: ModelDef<PropsByType['bicolorLed']> = (() => {
  const red = (p: PropsByType['bicolorLed']) => diode({ forwardVoltage: p.redVoltage, maxCurrent: p.maxCurrent });
  const green = (p: PropsByType['bicolorLed']) => diode({ forwardVoltage: p.greenVoltage, maxCurrent: p.maxCurrent });
  const both = (el: Element<PropsByType['bicolorLed']>, s: Stamper) => {
    const v = s.v(el.nodes[0]) - s.v(el.nodes[1]);
    return [red(el.props).current(v), green(el.props).current(-v)];
  };
  const segments = (r: Result, p: PropsByType['bicolorLed']) => [Math.max(0, r.i), Math.max(0, -r.i)].map((i) => i / p.maxCurrent);
  return {
    nonlinear: true,
    stamp(el, s) {
      const vs = (el.state.segV ??= [0, 0]);
      stampJunction(s, vs, 0, el.nodes[0], el.nodes[1], red(el.props));
      stampJunction(s, vs, 1, el.nodes[1], el.nodes[0], green(el.props));
    },
    current(el, s) {
      const [r, g] = both(el, s);
      return r - g;
    },
    segments,
    brightness: (r, p) => Math.max(...segments(r, p)),
    readout: (r) => [
      ...basicReadout(r),
      ['Lit', r.i > 1e-4 ? 'red' : r.i < -1e-4 ? 'green' : r.ac && r.irms > 1e-4 ? 'red and green (alternating)' : 'none'],
    ],
    thermal: { load: (r, p) => Math.abs(r.i) / p.maxCurrent, tau: 0.05, limit: 1.5 },
    failure: { label: 'burnt out', open: true },
  };
})();

export const defs: PartDefs<'bicolorLed'> = {
  // Two LED symbols back to back: red (top) conducts from pin 0, green
  // (bottom) from pin 1.
  bicolorLed: {
    name: 'Bi-colour LED',
    letter: 'P',
    category: 'signals',
    group: 'Lights',
    pins: [{ x: -40, y: 0 }, { x: 40, y: 0 }],
    props: {
      redVoltage: { label: 'Red forward voltage', unit: 'V', value: 2, min: 0.1 },
      greenVoltage: { label: 'Green forward voltage', unit: 'V', value: 2.2, min: 0.1 },
      maxCurrent: { label: 'Max current', unit: 'A', value: 0.02, min: 0.0001 },
    },
    draw: () => `
      <path d="M -40 0 H -24 M 24 0 H 40 M -24 -12 V 12 M 24 -12 V 12 M -24 -12 H -8 M 8 -12 H 24 M -24 12 H -8 M 8 12 H 24" />
      <path class="rgb-off" d="M -8 -20 V -4 L 8 -12 Z" style="fill: ${LIGHT_COLORS.red}" />
      <path class="seg-lit rgb-lit" data-seg="0" d="M -8 -20 V -4 L 8 -12 Z" style="opacity: 0; fill: ${LIGHT_COLORS.red}" />
      <path d="M -8 -20 V -4 L 8 -12 Z M 8 -20 V -4" />
      <path class="rgb-off" d="M 8 4 V 20 L -8 12 Z" style="fill: ${LIGHT_COLORS.green}" />
      <path class="seg-lit rgb-lit" data-seg="1" d="M 8 4 V 20 L -8 12 Z" style="opacity: 0; fill: ${LIGHT_COLORS.green}" />
      <path d="M 8 4 V 20 L -8 12 Z M -8 4 V 20" />
      <path d="M 4 -24 L 11 -31 M 6 -31 H 11 V -26 M 11 -19 L 18 -26 M 13 -26 H 18 V -21" />`,
  },
};

export const models: ModelDefs<'bicolorLed'> = {
  bicolorLed: bicolorModel,
};
