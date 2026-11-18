import { GRID, snap, type Board } from './board.ts';
import { getNorm, refText } from './norm.ts';
import { LIGHT_COLORS, PARTS, defaults, mixedLight, hitOf, keepUpright, pinNamesOf, pinsOf, symbolMarkup, tagOf, type ChoiceSpec } from './components.ts';
import { fromControl } from './keys.ts';
import { FRAME_MIN, frameSize, type Corner } from './parts/annotate/frame.ts';
import { blockLayout } from './parts/modules/block.ts';
import type { Circuit } from './model.ts';
import { makeModule } from './modules.ts';
import { buildNets, keyOf, pinKey, type Nets } from './nets.ts';
import { dockSpot, dockings, hasShaft, isShaftLoad } from './shaft.ts';
import { isPart, isWire, type End, type Joint, type Part, type PartType, type Point, type Props, type PropValue, type Wire } from './types.ts';
import {
  endHorizontal, endId, endPos, moveSegment, pinPos, pointOnPath, route, simplify, toPoints, wirePoints,
} from './wires.ts';

const SVG_NS = 'http://www.w3.org/2000/svg';
const PART_W = 80;
const PART_H = 40;
const DOUBLE_CLICK_MS = 500;
// The invisible area around a pin or joint that takes a press: bigger for a
// finger (a touch screen) than for a mouse.
const HIT_R = matchMedia('(pointer: coarse)').matches ? 13 : 7;
const DOT_SPACING = 16; // must match .wire-flow's stroke-dasharray
const FLOW_MIN = 1e-6; // A; below this a wire shows no flow
const FLOW_REF = 1e-4; // A
const FLOW_SPEED = 40; // world units/s per decade of current above FLOW_REF
// Real time over which the eye blends changing light and motion: at full speed
// a 50 Hz flicker blurs into a steady glow, in slow motion it shows.
const PERSISTENCE = 0.04; // s
// Invisible box over each symbol so thin strokes are easy to grab.
// Behind each part, the patch the thermal view colours.
const thermoBox = ({ w = PART_W, h = PART_H, x = 0 } = {}) =>
  `<rect class="thermo" x="${x - w / 2}" y="${-h / 2}" width="${w}" height="${h}" rx="10" />`;
const hitBox = ({ w = PART_W, h = PART_H, x = 0 } = {}) =>
  `<rect class="hit" x="${x - w / 2}" y="${-h / 2}" width="${w}" height="${h}" />`;

// Heat haze over something too hot to touch: wavy lines rising from it (shown
// with .touch-hot; see place() for where).
const HAZE = `<g class="haze">${[-8, 0, 8].map((x) => `<path d="M ${x} 0 q 3 -4 0 -8 q -3 -4 0 -8" />`).join('')}</g>`;

// Things with a position of their own (wires take theirs from their ends).
type Placed = Part | Joint;

// While drawing, a wire end can also be a spot on an existing wire, which
// becomes a joint once the new wire is placed.
interface Tap {
  wire: string;
  at: Point;
}
type Target = End | Tap;
const isTap = (t: Target): t is Tap => 'wire' in t;

// Where a part would sit inside a wire: centred on segment `i` of `wire`.
interface Spot extends Point {
  rotation: number;
  wire: string;
  i: number;
}

interface Box {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

// Live simulation state per part id: `glow` is brightness (1 = at its rating),
// `heat` is 0..1 from its rating up to the point where it fails, `level` how
// full an energy store is (for its gauge), `reading` what a meter shows,
// `active` whether it's switched on by itself (an energized relay: its symbol
// shows the contacts moved), `reverse` whether it turns counter-clockwise, `segments` each display segment's brightness,
// `light` the mixed light of RGB LEDs (linear RGB, three numbers per spot,
// see src/parts/light.ts),
// `temp` how hot it runs as a fraction of the heat that destroys it (for the
// thermal view; undefined for parts that don't heat up), `needle` where a
// panel meter points (0..1 of full scale), `shimmer` how hot it is to touch
// (0 below 60 °C, up to 1: it shimmers with heat haze).
export type Live = Map<
  string,
  {
    glow: number;
    heat: number;
    level?: number;
    reading?: string;
    active?: boolean;
    reverse?: boolean;
    segments?: number[];
    light?: number[];
    temp?: number;
    needle?: number;
    shimmer?: number;
  }
>;

// The light a part gives off, eased over time the way the eye blends flicker.
interface Lit {
  glow: number;
  segments?: number[];
  light?: number[];
}

const GAUGE_WIDTH = 15; // inner width of the gauge's fill bar

// A self-contained copy of part of the circuit, for copy/paste and duplicate.
// Wire ends point into its own parts and joints by index.
type CopyEnd = { joint: number } | { part: number; pin: number };
interface Copy {
  parts: { type: PartType; x: number; y: number; rotation: number; props: Props }[];
  joints: Point[];
  wires: { from: CopyEnd; to: CopyEnd; via: Point[] }[];
  center: Point;
}

export interface EditorEvents {
  // Whenever the selection changes.
  onSelect?: (ids: string[]) => void;
  // After every edit to the circuit.
  onChange?: (nets: Nets) => void;
  // When a part's props were changed on the board (e.g. a switch flipped).
  onPropChange?: (id: string, key?: string, value?: PropValue) => void;
  // On a right-click, after the selection is updated.
  onContextMenu?: (clientX: number, clientY: number, at: Point) => void;
  // Double-clicking a module block: step inside it.
  onEnterModule?: (id: string) => void;
  // Esc with nothing to cancel or deselect while inside a module: step out.
  onLeaveModule?: () => void;
}

// What the editor shows can be the inside of a module block (see insideOf in
// src/modules.ts) rather than the circuit itself: `root` is the circuit whose
// nets it works out (the whole circuit, which the simulator uses, or a
// module's definition being edited), and `locked` says the parts shown can be
// looked at and operated (buttons, switches) but not moved, wired or edited.
export interface EditorScope {
  root: () => Circuit;
  locked: () => boolean;
  // A part inside a block by its flattened id ("c12/c3"), for the parts
  // mounted on a block's face.
  inner?: (id: string) => Part | undefined;
}

export type Editor = ReturnType<typeof createEditor>;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const samePoint = (a: Point, b: Point) => a.x === b.x && a.y === b.y;

// A part's value by name, whatever its type.
const propOf = (c: Part, key: string) => (c.props as Record<string, PropValue>)[key];

function sameEnd(a: Target, b: Target): boolean {
  if (isTap(a) || isTap(b)) return isTap(a) && isTap(b) && a.wire === b.wire && samePoint(a.at, b.at);
  return endId(a) === endId(b) && a.pin === b.pin;
}

const isFrame = (n: Placed | undefined): n is Part<'frame'> => !!n && isPart(n) && n.type === 'frame';

// A frame's box on the board (its position is its top-left corner).
function frameBox(f: Part<'frame'>): Box {
  const { w, h } = frameSize(f.props);
  return { x1: f.x, y1: f.y, x2: f.x + w, y2: f.y + h };
}

const within = (outer: Box, inner: Box) =>
  inner.x1 >= outer.x1 && inner.x2 <= outer.x2 && inner.y1 >= outer.y1 && inner.y2 <= outer.y2;

// Does a part's (rotated) box, or a joint's point, fall in the selection box?
// A frame only when the box takes in all of it, so a box drawn round parts
// inside a frame doesn't pick up the frame too.
function touches(box: Box, n: Placed): boolean {
  if (isFrame(n)) return within(box, frameBox(n));
  let hw = 0;
  let hh = 0;
  if (isPart(n)) {
    const vertical = n.rotation % 180 !== 0;
    hw = (vertical ? PART_H : PART_W) / 2;
    hh = (vertical ? PART_W : PART_H) / 2;
  }
  return n.x + hw >= box.x1 && n.x - hw <= box.x2 && n.y + hh >= box.y1 && n.y - hh <= box.y2;
}

// The pin or joint under a pointer event target, or null.
function endOf(target: EventTarget | null): End | null {
  if (!(target instanceof Element)) return null;
  const pin = target.closest<SVGElement>('.pin-hit');
  if (pin) return { part: pin.closest<SVGElement>('.part')!.dataset.id!, pin: Number(pin.dataset.pin) };
  const joint = target.closest<SVGElement>('.joint');
  return joint ? { joint: joint.dataset.id! } : null;
}

const closestIn = (target: EventTarget | null, selector: string) =>
  target instanceof Element ? target.closest<SVGGElement>(selector) : null;

function svgEl<K extends keyof SVGElementTagNameMap>(name: K, className: string, parent: Element): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, name);
  el.setAttribute('class', className);
  parent.append(el);
  return el;
}

export function createEditor(board: Board, circuit: Circuit, events: EditorEvents = {}, scope?: EditorScope) {
  const { onSelect = () => {}, onChange = () => {}, onPropChange = () => {}, onContextMenu = () => {}, onEnterModule = () => {}, onLeaveModule = () => {} } = events;
  const root = scope?.root ?? (() => circuit);
  const locked = scope?.locked ?? (() => false);
  const { svg, world } = board;
  // Frames lie under everything; wires sit under joints, joints under parts,
  // so pins stay clickable.
  const framesLayer = svgEl('g', 'frames', world);
  const wiresLayer = svgEl('g', 'wires', world);
  const jointsLayer = svgEl('g', 'joints', world);
  const partsLayer = svgEl('g', 'parts', world);
  const nodes = new Map<string, SVGGElement>(); // part, wire or joint id -> <g>
  const selected = new Set<string>();

  // Moving the selection.
  let drag: {
    id: number;
    start: Point;
    dx: number;
    dy: number;
    list: Placed[];
    touching: Wire[];
    inside: Wire[];
    base: Map<string, Point>;
    orig: Map<string, Point & { rotation?: number }>;
    viaBase: Map<string, Point[]>;
    origVia: Map<string, Point[]>;
    free: Part | null; // a lone unwired part, which may drop into a wire
    rot: number; // the rotation the user chose for `free`
  } | null = null;
  // Rubber-band selection on empty board.
  let marquee: { id: number; start: Point; rect: SVGRectElement; keep: Set<string> } | null = null;
  // Wire being drawn.
  let wiring: { from: Target; via: Point[]; line: SVGPolylineElement; end: Point | null; pressed: boolean } | null = null;
  // Moving one segment of a wire sideways.
  let segDrag: {
    id: number;
    w: Wire;
    base: Point[];
    i: number;
    horiz: boolean;
    start: Point;
    d: number;
    orig: Point[];
  } | null = null;
  // Resizing a frame by one of its corner handles; `box` is where it started.
  let resize: { id: number; f: Part<'frame'>; corner: Corner; box: Box } | null = null;
  let wiringClickAt = -Infinity; // time of the last click used by wiring
  let lit: string | null = null; // wire highlighted as the place a dragged part will drop into
  let nets = buildNets(root());

  // One soft radial gradient per light colour, fading out to transparent, and
  // a mask fading any shape out the same way from its centre (for light whose
  // colour changes as it runs, an RGB LED's).
  svg.querySelector('defs')!.insertAdjacentHTML(
    'beforeend',
    `<filter id="heat-shimmer" x="-10%" y="-20%" width="120%" height="140%">
      <feTurbulence type="fractalNoise" baseFrequency="0.02 0.1" numOctaves="1" seed="3" result="noise">
        <animate attributeName="baseFrequency" values="0.02 0.1;0.024 0.07;0.02 0.1" dur="1.4s" repeatCount="indefinite" />
      </feTurbulence>
      <feDisplacementMap in="SourceGraphic" in2="noise" scale="2.5" xChannelSelector="R" yChannelSelector="G" />
    </filter>
    <radialGradient id="glow-fade">
      <stop offset="0" stop-color="#fff" stop-opacity="1" />
      <stop offset="0.35" stop-color="#fff" stop-opacity="0.5" />
      <stop offset="1" stop-color="#fff" stop-opacity="0" />
    </radialGradient>
    <mask id="glow-mask" maskContentUnits="objectBoundingBox">
      <rect width="1" height="1" fill="url(#glow-fade)" />
    </mask>` +
    Object.entries(LIGHT_COLORS)
      .map(([key, color]) => `
        <radialGradient id="glow-${key}">
          <stop offset="0" stop-color="${color}" stop-opacity="0.9" />
          <stop offset="0.35" stop-color="${color}" stop-opacity="0.45" />
          <stop offset="1" stop-color="${color}" stop-opacity="0" />
        </radialGradient>`)
      .join(''),
  );

  function place(n: Placed) {
    const g = nodes.get(n.id)!;
    const rotation = isPart(n) ? n.rotation : 0;
    g.setAttribute('transform', `translate(${n.x} ${n.y}) rotate(${rotation})`);
    keepUpright(g, rotation);
    if (!isPart(n)) return;
    // Keep a part's label and actuator upright. The label sits above the part
    // (right of it when vertical), or on the opposite side when the actuator
    // takes that spot.
    const vertical = rotation % 180 !== 0;
    const text = g.querySelector('.value');
    if (text) {
      const other = !!PARTS[n.type].actuator || !!PARTS[n.type].labelBelow;
      const [lx, ly, anchor] = PARTS[n.type].labelAt?.(vertical, n.props, rotation) ??
        (vertical ? [other ? -26 : 26, 4, other ? 'end' : 'start'] : [0, other ? 32 : -26, 'middle']);
      text.setAttribute('transform', `rotate(${-rotation}) translate(${lx} ${ly})`);
      text.setAttribute('text-anchor', anchor);
    }
    // (Its own, not a control on a block's front panel, which sits where placed.)
    g.querySelector(':scope > .actuator')
      ?.setAttribute('transform', `rotate(${-rotation}) translate(${vertical ? '34 0' : '0 -34'})`);
    // Heat rises: the haze sits just above it on screen, whichever way it's
    // turned (above a frame's top edge, mid-way along).
    if (isFrame(n)) {
      g.querySelector('.haze')?.setAttribute('transform', `translate(${frameSize(n.props).w / 2} -14)`);
    } else {
      const { w = PART_W, h = PART_H } = hitOf(n.type, n.props) ?? {};
      g.querySelector('.haze')?.setAttribute('transform', `rotate(${-rotation}) translate(0 ${-(vertical ? w : h) / 2 - 2})`);
    }
    // The charge gauge and a meter's display sit opposite the label: below,
    // or to the left when vertical.
    g.querySelector('.gauge')
      ?.setAttribute('transform', `rotate(${-rotation}) translate(${vertical ? '-34 0' : '0 30'})`);
    g.querySelector('.meter-display')
      ?.setAttribute('transform', `rotate(${-rotation}) translate(${vertical ? '-46 0' : '0 32'})`);
  }

  // A meter's small digital readout, with a tab on its left for the part's
  // selector (a meter's DC/AC knob) when it has one.
  const SELECTOR_WIDTH = 20;

  function displayMarkup(c: Part): string {
    const key = PARTS[c.type].selector;
    const tab = key
      ? `<g class="selector"><rect class="sel-bg" y="-8" width="${SELECTOR_WIDTH + 4}" height="16" rx="3" /><text class="sel-text" y="3.5" text-anchor="middle">${propOf(c, key)}</text></g>`
      : '';
    return `
      <g class="meter-display">
        ${tab}
        <rect class="meter-screen" y="-8" height="16" rx="3" />
        <text class="meter-text" y="4" text-anchor="middle">–</text>
      </g>`;
  }

  // Size the screen to the reading, and keep screen and tab centred together.
  function layoutDisplay(display: Element) {
    const text = display.querySelector<SVGTextElement>('.meter-text')!;
    const tab = display.querySelector('.selector');
    const w = Math.max(32, text.getComputedTextLength() + 10);
    const t = tab ? SELECTOR_WIDTH : 0;
    const left = -(w + t) / 2;
    const screen = display.querySelector('.meter-screen')!;
    screen.setAttribute('x', String(left + t));
    screen.setAttribute('width', String(w));
    text.setAttribute('x', String(left + t + w / 2));
    tab?.querySelector('.sel-bg')!.setAttribute('x', String(left));
    tab?.querySelector('.sel-text')!.setAttribute('x', String(left + t / 2));
  }

  function paintDisplay(g: SVGElement, reading: string) {
    const frame = g.querySelector<SVGTSpanElement>('.frame-reading');
    if (frame) return paintFrameReading(frame, reading);
    const text = g.querySelector<SVGTextElement>('.meter-text');
    if (!text || text.textContent === reading) return;
    text.textContent = reading;
    layoutDisplay(g.querySelector('.meter-display')!);
  }

  // An enclosure's inside air on its title tab, the tab sized to fit.
  function paintFrameReading(span: SVGTSpanElement, reading: string) {
    const shown = (span.textContent!.startsWith(' · ') ? ' · ' : '') + reading;
    if (span.textContent === shown) return;
    span.textContent = shown;
    const text = span.parentNode as SVGTextElement;
    const tab = text.parentNode!.querySelector('.frame-tab')!;
    tab.setAttribute('width', String(text.getComputedTextLength() + 20));
  }

  // A small battery icon whose fill shows how full an energy store is.
  const GAUGE = `
    <g class="gauge">
      <rect class="gauge-body" x="-10" y="-5" width="19" height="10" rx="2" />
      <rect class="gauge-nub" x="9" y="-2.5" width="2" height="5" rx="0.5" />
      <rect class="gauge-fill" x="-8.5" y="-3.5" width="0" height="7" rx="1" />
    </g>`;

  function paintGauge(g: SVGElement, level: number) {
    const gauge = g.querySelector('.gauge');
    if (!gauge) return;
    const l = Math.min(1, Math.max(0, level));
    gauge.querySelector('.gauge-fill')!.setAttribute('width', (l * GAUGE_WIDTH).toFixed(2));
    gauge.classList.toggle('low', l < 0.2);
    gauge.classList.toggle('mid', l >= 0.2 && l < 0.5);
  }

  // The small on-board control for a part you operate by hand: a toggle pill
  // for switches, a round button for momentary ones.
  function actuatorMarkup(c: Part): string {
    const { prop, momentary } = PARTS[c.type].actuator!;
    const on = propOf(c, prop);
    const body = momentary
      ? '<circle class="act-bg" r="7" /><circle class="act-knob" r="3.5" />'
      : `<rect class="act-bg" x="-10" y="-6" width="20" height="12" rx="6" />
         <circle class="act-knob" cx="${on ? 4 : -4}" r="3.5" />`;
    return `<g class="actuator${on ? ' on' : ''}">${body}<rect class="act-hit" x="-13" y="-10" width="26" height="20" /></g>`;
  }

  // The names of each part's pins as last drawn (see refreshPart).
  const drawnPins = new Map<string, string[]>();

  // A note's or text label's values with its text as shown: a part's EU reference in braces
  // ({R1}) reads as that part's reference in the drawing standard in use
  // (R1, or L1 for an inductor under US), so notes stay right in both. Braces
  // round anything else are left alone.
  function annotationText<T extends 'note' | 'textLabel' | 'frame'>(c: Part<T>): Part<T>['props'] {
    const text = c.props.text.replace(/\{([A-Z]+\d+)\}/g, (all, ref: string) => {
      const part = circuit.components.find((p) => p.ref === ref);
      return part ? (getNorm() === 'us' ? part.usRef : part.ref) : all;
    });
    return { ...c.props, text };
  }

  // (Re)draw a part's symbol, value text and hit areas from its current props.
  function renderPart(c: Part) {
    const part = PARTS[c.type];
    const tag = tagOf(c.type, c.props);
    drawnPins.set(c.id, pinNamesOf(c.type, c.props));
    const pinHits = pinsOf(c.type, c.props).map(
      (p, i) => `<circle class="pin-hit" data-pin="${i}" cx="${p.x}" cy="${p.y}" r="${HIT_R}" />`,
    );
    const g = nodes.get(c.id)!;
    g.classList.toggle('broken', c.broken);
    g.classList.toggle('faulted', !!c.fault?.shown);
    let glow = '';
    if (part.glow) {
      const key = part.glow.color(c.props);
      glow = `<circle class="glow" r="${part.glow.radius}" fill="url(#glow-${key})" />`;
      g.style.setProperty('--glow-color', LIGHT_COLORS[key]);
    }
    const props = c.type === 'note' || c.type === 'textLabel' || c.type === 'frame' ? annotationText(c as Part<'note'>) : c.props;
    const hit = hitOf(c.type, props);
    // A frame takes presses on its own edge and title (see frame.ts), not a box.
    const box = c.type !== 'frame';
    g.innerHTML =
      (box ? thermoBox(hit) : '') +
      glow +
      symbolMarkup(c.type, props, c.broken) +
      (part.noLabel ? '' : `<text class="value"><tspan class="ref">${refText(c)}</tspan>${tag ? ` ${tag}` : ''}</text>`) +
      (box ? hitBox(hit) : '') +
      pinHits.join('') +
      (part.actuator ? actuatorMarkup(c) : '') +
      (part.gauge ? GAUGE : '') +
      (part.display ? displayMarkup(c) : '') +
      HAZE;
    if (c.type === 'module') mountPanel(c, g);
    place(c);
    const display = g.querySelector('.meter-display');
    if (display) layoutDisplay(display);
  }

  // --- A block's front panel -----------------------------------------------------
  // The parts inside a module block that are mounted on its face (see
  // blockLayout), drawn as they'd look on a panel door: a switch or button as
  // its on-board control, a lamp or LED as an indicator that lights with it.
  // Each is the block's own copy of the part, by its flattened id, so it shows
  // that copy's live state, and operating it operates that copy.
  const panelNodes = new Map<string, SVGGElement>(); // flattened id -> its control on the face

  function mountPanel(block: Part, g: SVGElement) {
    for (const id of panelNodes.keys()) if (id.startsWith(`${block.id}/`)) panelNodes.delete(id);
    const items = blockLayout(block.props as Part<'module'>['props']).panel.map(({ id, x, y, s = 1 }) => {
      const c = scope?.inner?.(`${block.id}/${id}`);
      if (!c || block.broken) return '';
      const part = PARTS[c.type];
      const look = part.onPanel?.(c.props);
      let body: string;
      if (part.actuator) body = actuatorMarkup(c);
      else if (look) {
        // A display (or RGB / bi-colour LED) as it looks on a panel, at its size.
        const color = part.glow ? ` style="--glow-color: ${LIGHT_COLORS[part.glow.color(c.props)]}"` : '';
        body = `<g transform="scale(${s})"${color}>${look.markup}</g>`;
      } else {
        const key = part.glow?.color(c.props) ?? 'red';
        body = `<g style="--glow-color: ${LIGHT_COLORS[key]}">
          <circle class="glow" r="16" fill="url(#glow-${key})" />
          <circle class="bulb tinted" r="6" /><circle class="panel-lamp" r="6" />
        </g>`;
      }
      return `<g class="panel-item" data-panel="${c.id}" transform="translate(${x} ${y})"><g class="upright">${body}</g></g>`;
    });
    g.insertAdjacentHTML('beforeend', items.join(''));
    for (const item of g.querySelectorAll<SVGGElement>('.panel-item')) panelNodes.set(item.dataset.panel!, item);
  }

  // Operate a front-panel control: as actuate(), on the block's copy of the
  // part, redrawing the block it's on.
  function actuatePanel(block: Part, c: Part) {
    const { prop, momentary } = PARTS[c.type].actuator!;
    const set = (value: boolean) => {
      (c.props as Record<string, PropValue>)[prop] = value;
      onPropChange(c.id, prop, value);
      if (!circuit.part(block.id)) return;
      renderPart(block);
      refreshNets();
    };
    if (!momentary) {
      set(!propOf(c, prop));
      return;
    }
    set(true);
    const release = () => {
      window.removeEventListener('pointerup', release);
      window.removeEventListener('pointercancel', release);
      set(false);
    };
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
  }

  function setProp(c: Part, key: string, value: PropValue) {
    (c.props as Record<string, PropValue>)[key] = value;
    // (Told first, with the value: a switch inside a block is remembered by its
    // block before the circuit is solved again.)
    onPropChange(c.id, key, value);
    refreshPart(c.id);
  }

  // Turn a part's selector to its next option (a meter: DC ↔ AC).
  function turnSelector(c: Part) {
    const key = PARTS[c.type].selector!;
    const { options } = PARTS[c.type].props[key] as ChoiceSpec;
    setProp(c, key, options[(options.indexOf(propOf(c, key) as string) + 1) % options.length]);
  }

  // Operate a part's actuator: flip a switch, or hold a push button closed
  // until the pointer is released anywhere.
  function actuate(c: Part) {
    const { prop, momentary } = PARTS[c.type].actuator!;
    if (!momentary) {
      setProp(c, prop, !propOf(c, prop));
      return;
    }
    setProp(c, prop, true);
    const release = () => {
      window.removeEventListener('pointerup', release);
      window.removeEventListener('pointercancel', release);
      if (circuit.part(c.id)) setProp(c, prop, false);
    };
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
  }

  // With `smooth`, light (glow, display segments, mixed colour) eases toward
  // the new levels in animate() the way the eye blends flicker, so PWM and
  // multiplexing show as the steady light you'd see; otherwise it jumps there.
  const glows = new Map<string, { target: Lit; shown: Lit }>();

  function showLive(live: Live, smooth = false) {
    for (const [id, { glow, heat, level: charge, reading, active, reverse, segments, light, temp, needle, shimmer = 0 }] of live) {
      const g = nodes.get(id) ?? panelNodes.get(id);
      if (!g) continue;
      if (charge !== undefined) paintGauge(g, charge);
      if (reading !== undefined) paintDisplay(g, reading);
      if (active !== undefined) g.classList.toggle('active', active);
      if (reverse !== undefined) g.classList.toggle('reverse', reverse);
      g.classList.toggle('touch-hot', shimmer > 0);
      if (shimmer > 0) g.style.setProperty('--shimmer', shimmer.toFixed(2));
      if (needle !== undefined) g.querySelector('.needle')?.setAttribute('transform', `rotate(${(-50 + 100 * needle).toFixed(2)} 0 6)`);
      const target: Lit = { glow: Math.min(1, Math.max(0, glow)), segments, light };
      const s = glows.get(id);
      if (s && smooth) s.target = target;
      else glows.set(id, { target, shown: copyLit(target) });
      paintLit(g, glows.get(id)!.shown);
      g.style.setProperty('--heat', heat.toFixed(3));
      if (temp === undefined) g.style.removeProperty('--thermo');
      else g.style.setProperty('--thermo', thermalColor(temp));
    }
    for (const id of glows.keys()) if (!nodes.has(id) && !panelNodes.has(id)) glows.delete(id);
  }

  // Thermal view colours: blue when cold, through green and yellow (around
  // the rating, which most parts reach at 1/1.5 of their limit) to red at
  // the point of failure.
  function thermalColor(t: number): string {
    const x = Math.min(1, Math.max(0, t));
    return `hsl(${Math.round(220 * (1 - x) ** 1.3)} 90% 55%)`;
  }

  const copyLit = (l: Lit): Lit => ({ glow: l.glow, segments: l.segments?.slice(), light: l.light?.slice() });

  // Move `shown` a fraction k of the way to `target`; false once it's there.
  function easeLit(shown: Lit, target: Lit, k: number): boolean {
    const step = (from: number, to: number) => (Math.abs(to - from) < 1e-3 ? to : from + (to - from) * k);
    const list = (from: number[] | undefined, to: number[] | undefined) =>
      !to || !from || from.length !== to.length ? to?.slice() : from.map((x, i) => step(x, to[i]));
    const moving = (from: number[] | undefined, to: number[] | undefined) =>
      from?.length !== to?.length || !!to?.some((x, i) => x !== from![i]);
    if (shown.glow === target.glow && !moving(shown.segments, target.segments) && !moving(shown.light, target.light)) return false;
    shown.glow = step(shown.glow, target.glow);
    shown.segments = list(shown.segments, target.segments);
    shown.light = list(shown.light, target.light);
    return true;
  }

  function paintLit(g: SVGElement, l: Lit) {
    paintGlow(g, l.glow);
    if (l.segments) paintSegments(g, l.segments);
    if (l.light) paintMix(g, l.light);
  }

  // The eye sees brightness roughly as a square root, so dim parts still show.
  function paintGlow(g: SVGElement, level: number) {
    g.style.setProperty('--glow', Math.sqrt(level).toFixed(3));
  }

  // Light mixed from several colours (RGB LEDs and matrix dots): each spot
  // (class "mix", data-mix) gets its colour, strength and how white-hot its
  // centre is from its three numbers in `light`.
  function paintMix(g: SVGElement, light: number[]) {
    for (const spot of g.querySelectorAll<SVGElement>('.mix')) {
      const i = 3 * Number(spot.dataset.mix);
      const { color, glow, hot } = mixedLight([light[i] ?? 0, light[i + 1] ?? 0, light[i + 2] ?? 0]);
      spot.style.setProperty('--mix', color);
      spot.style.setProperty('--mix-glow', glow.toFixed(3));
      spot.style.setProperty('--mix-hot', hot.toFixed(3));
    }
  }

  // Each lit segment of a display (drawn with class "seg-lit" or "bar-lit"
  // and data-seg).
  function paintSegments(g: SVGElement, levels: number[]) {
    for (const seg of g.querySelectorAll<SVGElement>('.seg-lit, .bar-lit')) {
      const level = Math.min(1, Math.max(0, levels[Number(seg.dataset.seg)] ?? 0));
      seg.style.opacity = Math.sqrt(level).toFixed(3);
    }
  }

  // Redraw a part that just failed, with a puff of smoke rising from it.
  function burn(id: string) {
    const c = circuit.part(id)!;
    refreshPart(id);
    const g = nodes.get(id)!;
    g.insertAdjacentHTML(
      'beforeend',
      `<g class="smoke" transform="rotate(${-c.rotation})">
        <circle r="7" /><circle r="5" cx="-7" /><circle r="6" cx="6" />
      </g>`,
    );
    const smoke = g.lastElementChild!;
    setTimeout(() => smoke.remove(), 1600);
  }

  // After a part's props were edited. Its pins may have changed (a relay
  // given fewer contacts, or make contacts instead of changeovers): wires
  // follow their pin by name, and go if it's gone.
  function refreshPart(id: string) {
    const c = circuit.part(id)!;
    const before = drawnPins.get(id) ?? pinNamesOf(c.type, c.props);
    renderPart(c);
    const after = drawnPins.get(id)!;
    const gone = new Set<string>();
    for (const w of circuit.wiresOf(id)) {
      for (const end of [w.from, w.to]) {
        if (end.part !== id) continue;
        const pin = after.indexOf(before[end.pin]);
        if (pin < 0) gone.add(w.id);
        else end.pin = pin;
      }
    }
    for (const wid of gone) removeNode(wid);
    circuit.wiresOf(id).forEach(drawWire);
    if (gone.size) tidyJoints();
    else refreshNets();
  }

  // Each segment gets its own wide invisible hit line, so the cursor can show
  // which way that segment drags.
  function drawWire(w: Wire) {
    const pts = wirePoints(circuit, w);
    const [hits, line, flow] = nodes.get(w.id)!.children;
    line.setAttribute('points', toPoints(pts));
    flow.setAttribute('points', toPoints(pts));
    hits.innerHTML = pts
      .slice(1)
      .map((b, k) => {
        const a = pts[k];
        if (samePoint(a, b)) return '';
        const dir = a.y === b.y ? 'h' : 'v';
        return `<line class="wire-hit ${dir}" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" />`;
      })
      .join('');
  }

  // `tell`: report it (the app opens the inspector); a finger's press waits
  // until it lifts, see inspectOnLift.
  function setSelected(ids: Iterable<string>, tell = true) {
    for (const id of selected) nodes.get(id)?.classList.remove('selected');
    selected.clear();
    for (const id of ids) {
      selected.add(id);
      nodes.get(id)!.classList.add('selected');
    }
    if (tell) onSelect([...selected]);
  }

  // A finger pressing a part or wire selects it at once but tells the app (so
  // the inspector opens) only when it lifts without having dragged: a tap
  // inspects, a drag just moves. (A mouse tells at once: its inspector sits
  // beside the board, not over it.)
  let inspectOnLift: { id: number; moved: boolean } | null = null;

  // Selected parts and joints: the things that have a position of their own.
  const selectedNodes = (): Placed[] =>
    [...selected].map((id) => circuit.get(id)).filter((x): x is Placed => !!x && !isWire(x));

  // What lies inside a frame: the parts and joints within its box (a frame
  // only whole). A frame carries these when it moves or turns.
  function contentsOf(f: Part<'frame'>): Placed[] {
    const box = frameBox(f);
    const inside = (p: Point) => p.x >= box.x1 && p.x <= box.x2 && p.y >= box.y1 && p.y <= box.y2;
    return [...circuit.components, ...circuit.joints].filter((n) => n !== f && (isFrame(n) ? within(box, frameBox(n)) : inside(n)));
  }

  // The given parts and joints with everything inside the frames among them,
  // and the loads docked on the motors among those.
  function withContents(list: Placed[]): Placed[] {
    const all = new Map(list.map((n) => [n.id, n]));
    for (const n of list) if (isFrame(n)) for (const m of contentsOf(n)) all.set(m.id, m);
    const docks = dockings(circuit.components);
    for (const n of [...all.values()]) {
      const load = docks.get(n.id);
      if (load) all.set(load, circuit.part(load)!);
    }
    return [...all.values()];
  }

  // Where a mechanical load put down near `p` docks onto a motor's shaft, if
  // it does (see src/shaft.ts); `self` is the load itself when it's moved.
  const dockFor = (type: PartType, p: Point, self?: string) =>
    isShaftLoad(type) ? dockSpot(circuit.components, p, self) : null;

  // Motors and loads show whether they're docked (a free coupling shows as
  // an open ring).
  function showDocks() {
    const docks = dockings(circuit.components);
    const docked = new Set([...docks.keys(), ...docks.values()]);
    for (const c of circuit.components) {
      if (hasShaft(c.type) || isShaftLoad(c.type)) nodes.get(c.id)?.classList.toggle('docked', docked.has(c.id));
    }
  }

  // Select what's inside the one selected frame, with the wires between it.
  function selectContents() {
    const [f, ...rest] = selectedNodes();
    if (!isFrame(f) || rest.length) return;
    const ids = new Set(contentsOf(f).map((n) => n.id));
    for (const w of circuit.wires) if (ids.has(endId(w.from)) && ids.has(endId(w.to))) ids.add(w.id);
    setSelected(ids);
  }

  // Make the selected frame's contents a module (see makeModule), its block
  // selected in their place. Returns what to tell the user: why it couldn't,
  // or the wires it had to cut; null when all went well.
  function makeModuleOfSelection(): { message: string; count?: number } | null {
    if (locked()) return null;
    const [f, ...rest] = selectedNodes();
    if (!isFrame(f) || rest.length) return null;
    const made = makeModule(circuit, f);
    if ('error' in made) return { message: made.error };
    reload();
    setSelected([made.block.id]);
    return made.cut ? { message: 'Made a module; {count} wires crossed the frame’s edge without a terminal and were cut.', count: made.cut } : null;
  }

  // Pins that touch are connected (nets join them by position), but only
  // until one of the parts moves. So before parts move, each of their pins
  // touching a pin or joint that stays put gets a real wire to it (of no
  // length yet): pulling them apart then stretches a wire instead of
  // breaking the connection.
  function bindTouchingPins(list: Placed[]) {
    const moving = new Set(list.map((n) => n.id));
    const stayPins = circuit.components
      .filter((c) => !moving.has(c.id))
      .flatMap((c) => pinsOf(c.type, c.props).map((_, pin): [End, Point] => [{ part: c.id, pin }, pinPos(c, pin)]));
    const stayJoints = circuit.joints.filter((j) => !moving.has(j.id)).map((j): [End, Point] => [{ joint: j.id }, j]);
    let added = false;
    for (const n of list) {
      if (!isPart(n)) continue;
      pinsOf(n.type, n.props).forEach((_, pin) => {
        const end: End = { part: n.id, pin };
        const at = pinPos(n, pin);
        for (const [other, p] of [...stayPins, ...stayJoints]) {
          if (!samePoint(p, at)) continue;
          const linked = circuit.wiresOf(n.id).some(
            (w) => (sameEnd(w.from, end) && sameEnd(w.to, other)) || (sameEnd(w.to, end) && sameEnd(w.from, other)),
          );
          if (linked) continue;
          addWire(circuit.connect(end, other));
          added = true;
        }
      });
    }
    if (added) refreshNets();
  }

  // Wires attached to the given parts/joints: `touching` need redrawing when
  // they move, `inside` (both ends among them) carry their bend points along.
  function wiresAround(list: Placed[]) {
    const ids = new Set(list.map((n) => n.id));
    const touching: Wire[] = [];
    const inside: Wire[] = [];
    for (const w of circuit.wires) {
      const a = ids.has(endId(w.from));
      const b = ids.has(endId(w.to));
      if (a || b) touching.push(w);
      if (a && b) inside.push(w);
    }
    return { touching, inside };
  }

  // A new part dropped onto a wire is embedded in it.
  // `props`: values it starts with instead of its defaults (a module block's).
  function add(type: PartType, x: number, y: number, rotation = 0, props?: Partial<Props>) {
    if (locked()) return;
    highlight(null);
    const spot = props ? null : findSpot(type, { x, y }, rotation);
    const dock = dockFor(type, { x, y });
    const c = spot
      ? circuit.add(type, spot.x, spot.y, spot.rotation)
      : dock
        ? circuit.add(type, dock.x, dock.y, dock.rotation)
        : circuit.add(type, snap(x), snap(y), rotation);
    if (props) Object.assign(c.props, props);
    mountPart(c);
    if (spot) embed(c, spot);
    else refreshNets();
    setSelected([c.id]);
  }

  // Create the drawing for a part that is already in the circuit.
  function mountPart(c: Part) {
    const g = svgEl('g', 'part', c.type === 'frame' ? framesLayer : partsLayer);
    g.dataset.id = c.id;
    nodes.set(c.id, g);
    renderPart(c);
  }

  // Where a two-pin part would go for the palette's drag preview: on a wire
  // when one is close, otherwise the nearest grid point.
  function preview(type: PartType, p: Point, rotation: number): Point & { rotation: number } {
    const spot = findSpot(type, p, rotation);
    highlight(spot?.wire);
    return spot ?? dockFor(type, p) ?? { x: snap(p.x), y: snap(p.y), rotation };
  }

  function addWire(w: Wire) {
    const g = svgEl('g', 'wire', wiresLayer);
    g.dataset.id = w.id;
    g.innerHTML = '<g class="wire-hits"></g><polyline class="wire-line" /><polyline class="wire-flow" />';
    nodes.set(w.id, g);
    drawWire(w);
  }

  function addJoint(x: number, y: number): Joint {
    const j = circuit.addJoint(x, y);
    const g = svgEl('g', 'joint', jointsLayer);
    g.dataset.id = j.id;
    g.innerHTML = `<circle class="joint-dot" r="4" /><circle class="joint-hit" r="${HIT_R}" />`;
    nodes.set(j.id, g);
    place(j);
    return j;
  }

  function removeNode(id: string) {
    nodes.get(id)!.remove();
    nodes.delete(id);
    drawnPins.delete(id);
    circuit.remove(id);
  }

  // --- Nets -----------------------------------------------------------------
  // Recomputed after every change. Pins that connect to anything are drawn
  // filled, open ones hollow; hovering a pin, joint or wire lights up its net.

  function refreshNets() {
    nets = buildNets(root());
    showNet(null);
    for (const c of circuit.components) {
      for (const el of nodes.get(c.id)!.querySelectorAll<SVGElement>('.pin')) {
        const n = nets.netOf.get(pinKey(c.id, el.dataset.pin!))!;
        el.classList.toggle('linked', nets.nets[n].length > 1);
      }
    }
    showDocks();
    onChange(nets);
  }

  function showNet(n: number | null | undefined) {
    for (const el of world.querySelectorAll('.net-hot')) el.classList.remove('net-hot');
    if (n === undefined || n === null) return;
    for (const key of nets.nets[n]) {
      const [part, pin] = key.split(':');
      const el = pin === undefined ? nodes.get(key) : nodes.get(part)?.querySelector(`.pin[data-pin="${pin}"]`);
      el?.classList.add('net-hot');
    }
    for (const w of circuit.wires) {
      if (nets.netOf.get(keyOf(w.from)) === n) nodes.get(w.id)!.classList.add('net-hot');
    }
  }

  svg.addEventListener('pointerover', (e) => {
    if (drag || segDrag || marquee) return;
    const end = endOf(e.target);
    const wire = closestIn(e.target, '.wire');
    const key = end ? keyOf(end) : wire ? keyOf(circuit.wire(wire.dataset.id!)!.from) : null;
    showNet(key === null ? null : nets.netOf.get(key));
  });

  // --- Joints ---------------------------------------------------------------

  // Cut wire `w` at grid point `at` on its path into two wires meeting at a new
  // joint, keeping its exact shape. Returns the end to attach to there.
  function splitWire(w: Wire, at: Point): End {
    const pts = wirePoints(circuit, w);
    if (samePoint(at, pts[0])) return w.from;
    if (samePoint(at, pts[pts.length - 1])) return w.to;
    const { i } = pointOnPath(pts, at, 0)!;
    const end: End = { joint: addJoint(at.x, at.y).id };
    const before = pts.slice(1, i + 1).filter((p) => !samePoint(p, at));
    const after = pts.slice(i + 1, -1).filter((p) => !samePoint(p, at));
    removeNode(w.id);
    addWire(circuit.connect(w.from, end, before));
    addWire(circuit.connect(end, w.to, after));
    return end;
  }

  // Turn a spot on a wire into a real end. The wire may already have been split
  // by the other end of the same new wire, so fall back to whichever piece now
  // runs through that spot.
  function resolve(end: Target): End {
    if (!isTap(end)) return end;
    const w =
      circuit.wire(end.wire) ??
      circuit.wires.find((x) => pointOnPath(wirePoints(circuit, x), end.at, 0))!;
    return splitWire(w, end.at);
  }

  // Join the two wires meeting at `j` back into one, keeping their shape.
  function mergeAt(j: Joint, [w1, w2]: Wire[]) {
    const p1 = wirePoints(circuit, w1);
    const p2 = wirePoints(circuit, w2);
    const into = w1.to.joint === j.id ? p1 : p1.reverse(); // ends at j
    const out = w2.from.joint === j.id ? p2 : p2.reverse(); // starts at j
    const from = w1.to.joint === j.id ? w1.from : w1.to;
    const to = w2.from.joint === j.id ? w2.to : w2.from;
    removeNode(w1.id);
    removeNode(w2.id);
    removeNode(j.id);
    addWire(circuit.connect(from, to, [...into.slice(1), ...out.slice(1, -1)]));
  }

  // Joints only exist where wires meet: drop orphans, fold a joint with just two
  // wires back into one wire, and show the junction dot where three or more meet.
  function tidyJoints() {
    for (const j of [...circuit.joints]) {
      const ws = circuit.wiresOf(j.id);
      if (ws.length === 0) removeNode(j.id);
      else if (ws.length === 2 && ws[0] !== ws[1]) mergeAt(j, ws);
      else nodes.get(j.id)!.classList.toggle('junction', ws.length >= 3);
    }
    refreshNets();
  }

  // --- Embedding parts in wires ---------------------------------------------

  // Where a two-pin part near `p` would sit inside a wire: centred on a straight
  // stretch long enough for both pins, turned to lie along it, within a grid
  // step of `p`. Pins may not land on the wire's own ends.
  function findSpot(type: PartType, p: Point, rotation: number): Spot | null {
    const pins = pinsOf(type, defaults(type));
    if (pins.length !== 2) return null; // only two-pin parts sit in a wire
    const half = Math.abs(pins[0].x);
    let best: Spot | null = null;
    let bestD = GRID;
    for (const w of circuit.wires) {
      const pts = wirePoints(circuit, w);
      const ends = [pts[0], pts[pts.length - 1]];
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i];
        const b = pts[i + 1];
        if (samePoint(a, b)) continue;
        const horiz = a.y === b.y;
        const lo = (horiz ? Math.min(a.x, b.x) : Math.min(a.y, b.y)) + half;
        const hi = (horiz ? Math.max(a.x, b.x) : Math.max(a.y, b.y)) - half;
        if (lo > hi) continue;
        const along = clamp(snap(horiz ? p.x : p.y), lo, hi);
        const at = horiz ? { x: along, y: a.y } : { x: a.x, y: along };
        const d = Math.hypot(at.x - p.x, at.y - p.y);
        if (d > bestD) continue;
        const pins = horiz
          ? [{ x: along - half, y: a.y }, { x: along + half, y: a.y }]
          : [{ x: a.x, y: along - half }, { x: a.x, y: along + half }];
        if (pins.some((q) => ends.some((e) => samePoint(q, e)))) continue;
        bestD = d;
        const lies = (rotation % 180 === 0) === horiz;
        best = { ...at, rotation: lies ? rotation : (rotation + 90) % 360, wire: w.id, i };
      }
    }
    return best;
  }

  // Put part `c`, already placed at `spot`, into that wire: the wire is cut at
  // both pins and the stretch the part covers is removed.
  function embed(c: Part, spot: Spot) {
    const w = circuit.wire(spot.wire)!;
    const pts = wirePoints(circuit, w);
    const start = pts[spot.i];
    const dist = (q: Point) => Math.abs(q.x - start.x) + Math.abs(q.y - start.y);
    const pins = [0, 1].map((pin) => ({ pin, at: pinPos(c, pin) }));
    const [near, far] = dist(pins[0].at) <= dist(pins[1].at) ? pins : [pins[1], pins[0]];
    removeNode(w.id);
    addWire(circuit.connect(w.from, { part: c.id, pin: near.pin },
      pts.slice(1, spot.i + 1).filter((p) => !samePoint(p, near.at))));
    addWire(circuit.connect({ part: c.id, pin: far.pin }, w.to,
      pts.slice(spot.i + 1, -1).filter((p) => !samePoint(p, far.at))));
    tidyJoints();
  }

  function highlight(id?: string | null) {
    if (lit === (id ?? null)) return;
    if (lit) nodes.get(lit)?.classList.remove('embed-target');
    lit = id ?? null;
    if (lit) nodes.get(lit)!.classList.add('embed-target');
  }

  // While a lone unwired part is dragged, let it snap into a nearby wire.
  // `drag.rot` is the rotation the user chose; on a wire the part is turned to
  // lie along it, so pressing R there flips it end for end.
  function snapIntoWire() {
    const d = drag!;
    const c = d.free!;
    const spot = findSpot(c.type, c, d.rot);
    // A load docks from where the pointer has it, not where it last docked.
    const base = d.base.get(c.id)!;
    const dock = dockFor(c.type, { x: base.x + d.dx, y: base.y + d.dy }, c.id);
    if (spot) Object.assign(c, { x: spot.x, y: spot.y, rotation: spot.rotation });
    else if (dock) Object.assign(c, dock);
    else c.rotation = d.rot;
    place(c);
    highlight(spot?.wire);
  }

  // --- Editing the selection ------------------------------------------------

  // Rotate the selection 90° clockwise about a grid point at its centre,
  // so a single part spins in place and every position stays on the grid.
  function rotateSelected() {
    if (locked()) return;
    const list = withContents(selectedNodes());
    if (!list.length) return;
    if (!drag) bindTouchingPins(list);
    const centre = (n: Placed): Point => (isFrame(n) ? { x: n.x + frameSize(n.props).w / 2, y: n.y + frameSize(n.props).h / 2 } : n);
    const cx = snap(list.reduce((s, n) => s + centre(n).x, 0) / list.length);
    const cy = snap(list.reduce((s, n) => s + centre(n).y, 0) / list.length);
    const spin = (p: Point): Point => ({ x: cx - (p.y - cy), y: cy + (p.x - cx) });
    const d = drag;
    for (const n of list) {
      if (isFrame(n)) {
        // A frame stays upright: its box turns, so its bottom-left corner
        // becomes its top-left and its sides swap.
        const { w, h } = frameSize(n.props);
        Object.assign(n, spin({ x: n.x, y: n.y + h }));
        n.props.width = h;
        n.props.height = w;
        renderPart(n);
      } else {
        Object.assign(n, spin(n));
        if (isPart(n)) n.rotation = (n.rotation + 90) % 360;
      }
      place(n);
      // Mid-drag, re-base so the rotated group keeps following the cursor.
      if (d) d.base.set(n.id, { x: n.x - d.dx, y: n.y - d.dy });
    }
    const { touching, inside } = wiresAround(list);
    for (const w of inside) {
      w.via = w.via.map(spin);
      if (d) d.viaBase.set(w.id, w.via.map((p) => ({ x: p.x - d.dx, y: p.y - d.dy })));
    }
    touching.forEach(drawWire);
    if (d?.free) {
      d.rot = d.free.rotation;
      snapIntoWire();
    }
    refreshNets();
  }

  // Deleting a part or joint also deletes the wires attached to it.
  function deleteSelected() {
    if (locked()) return;
    drag = null;
    segDrag = null;
    highlight(null);
    const doomed = new Set(selected);
    for (const n of selectedNodes()) {
      for (const w of circuit.wiresOf(n.id)) doomed.add(w.id);
    }
    setSelected([]);
    for (const id of doomed) removeNode(id);
    tidyJoints();
  }

  // Esc during a drag puts everything back as it was when the drag started.
  function cancelDrag() {
    const d = drag!;
    for (const n of d.list) {
      Object.assign(n, d.orig.get(n.id));
      place(n);
    }
    for (const w of d.inside) w.via = d.origVia.get(w.id)!;
    d.touching.forEach(drawWire);
    drag = null;
    highlight(null);
    refreshNets();
  }

  // Put a frame on box `b`, if it isn't there already.
  function setFrameBox(f: Part<'frame'>, b: Box) {
    const now = frameBox(f);
    if (now.x1 === b.x1 && now.y1 === b.y1 && now.x2 === b.x2 && now.y2 === b.y2) return;
    f.x = b.x1;
    f.y = b.y1;
    f.props.width = b.x2 - b.x1;
    f.props.height = b.y2 - b.y1;
    renderPart(f);
  }

  // A resize that changed the frame is an edit (for undo), and the panel
  // shows its new size.
  function endResize() {
    const { f, box } = resize!;
    resize = null;
    const now = frameBox(f);
    if (now.x1 === box.x1 && now.y1 === box.y1 && now.x2 === box.x2 && now.y2 === box.y2) return;
    onPropChange(f.id);
    refreshNets();
  }

  // Esc puts it back as it was.
  function cancelResize() {
    setFrameBox(resize!.f, resize!.box);
    resize = null;
  }

  function endMarquee() {
    marquee!.rect.remove();
    marquee = null;
  }

  // --- Wiring ---------------------------------------------------------------
  // Start on a pin or joint (press), or double-click a wire to branch from it.
  // Then either release on the target, or click empty grid points to add
  // bends and click the target. Targets are pins, joints or any spot on a wire,
  // which makes a junction there. Esc cancels, Backspace removes the last bend.

  // A spot on wire `w` nearest the pointer.
  function tapOn(w: Wire, e: MouseEvent): Tap {
    const p = board.screenToWorld(e.clientX, e.clientY);
    return { wire: w.id, at: pointOnPath(wirePoints(circuit, w), p, Infinity)!.at };
  }

  // What the pointer is over that a wire could attach to.
  function targetOf(e: MouseEvent): Target | null {
    const end = endOf(e.target);
    if (end) return end;
    const g = closestIn(e.target, '.wire');
    return g ? tapOn(circuit.wire(g.dataset.id!)!, e) : null;
  }

  const posOf = (end: Target): Point => (isTap(end) ? end.at : endPos(circuit, end));
  const hintOf = (end: Target) => (isTap(end) ? undefined : endHorizontal(circuit, end));

  // `pressed`: the pointer is still down, so releasing on a target finishes.
  function startWire(from: Target, e: MouseEvent, pressed = true) {
    setSelected([]);
    const line = svgEl('polyline', 'wire-draft', world);
    wiring = { from, via: [], line, end: null, pressed };
    aimWire(e);
  }

  // Follow the cursor, locking onto whatever it could attach to.
  function aimWire(e: MouseEvent) {
    const w = wiring!;
    const t = targetOf(e);
    if (t) {
      w.end = posOf(t);
    } else {
      const p = board.screenToWorld(e.clientX, e.clientY);
      w.end = { x: snap(p.x), y: snap(p.y) };
    }
    drawDraft();
  }

  function drawDraft() {
    const w = wiring!;
    const pts = route([posOf(w.from), ...w.via, w.end ?? posOf(w.from)], hintOf(w.from));
    w.line.setAttribute('points', toPoints(pts));
  }

  function finishWire(to: Target) {
    const { from, via } = wiring!;
    stopWire();
    const a = resolve(from);
    const b = resolve(to);
    if (!sameEnd(a, b)) addWire(circuit.connect(a, b, via));
    tidyJoints();
  }

  function stopWire() {
    wiring!.line.remove();
    wiring = null;
  }

  // Capture phase: presses on pins/joints and clicks mid-wire are handled here
  // before part dragging, the marquee or panning see them.
  svg.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || board.spaceHeld) return;
    if (!wiring) {
      if (locked()) return;
      const end = endOf(e.target);
      if (!end) return;
      e.stopPropagation();
      startWire(end, e);
      return;
    }
    e.stopPropagation();
    wiringClickAt = e.timeStamp;
    const t = targetOf(e);
    if (t) {
      if (!sameEnd(t, wiring.from)) finishWire(t);
      else if (!wiring.via.length) stopWire(); // clicking the start again cancels
      return;
    }
    const p = board.screenToWorld(e.clientX, e.clientY);
    const bend = { x: snap(p.x), y: snap(p.y) };
    const last = wiring.via.at(-1);
    if (!last || !samePoint(last, bend)) wiring.via.push(bend);
    drawDraft();
  }, true);

  // Releasing the first press over a different target completes a dragged wire.
  svg.addEventListener('pointerup', (e) => {
    if (!wiring?.pressed) return;
    wiring.pressed = false;
    const t = targetOf(e);
    if (t && !sameEnd(t, wiring.from)) finishWire(t);
  });

  svg.addEventListener('pointermove', (e) => {
    if (wiring) aimWire(e);
  });

  // Double-clicking a wire starts a branch from that spot, in click mode. Clicks
  // that just finished a wire don't count, or ending on a wire would branch again.
  svg.addEventListener('dblclick', (e) => {
    if (wiring || board.spaceHeld || e.timeStamp - wiringClickAt < DOUBLE_CLICK_MS) return;
    // Double-clicking a module block steps inside it.
    const part = closestIn(e.target, '.part');
    if (part && circuit.part(part.dataset.id!)?.type === 'module') {
      setSelected([]);
      onEnterModule(part.dataset.id!);
      return;
    }
    if (locked()) return;
    const g = closestIn(e.target, '.wire');
    if (!g) return;
    startWire(tapOn(circuit.wire(g.dataset.id!)!, e), e, false);
  });

  // --- Moving wire segments -------------------------------------------------
  // Dragging a wire slides the segment under the pointer sideways in grid steps:
  // horizontal ones up/down, vertical ones left/right. The wire's ends never
  // move; a step is added next to them instead.

  function startSegmentDrag(w: Wire, e: PointerEvent, g: SVGGElement) {
    const base = simplify(wirePoints(circuit, w));
    const start = board.screenToWorld(e.clientX, e.clientY);
    const { i } = pointOnPath(base, start, Infinity)!;
    const horiz = base[i].y === base[i + 1].y;
    segDrag = { id: e.pointerId, w, base, i, horiz, start, d: 0, orig: w.via };
    g.setPointerCapture(e.pointerId);
  }

  function cancelSegmentDrag() {
    const s = segDrag!;
    s.w.via = s.orig;
    drawWire(s.w);
    segDrag = null;
  }

  // --- Selecting and moving -------------------------------------------------
  // Dragging a part moves the whole selection in grid steps; shift-click toggles
  // a part or wire in or out of the selection. Stopping propagation keeps the
  // empty-board handlers below from starting a marquee.
  world.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || board.spaceHeld) return;
    // A part's actuator or selector operates it without selecting or moving it;
    // so does a control on a block's front panel.
    const item = closestIn(e.target, '.panel-item');
    const inner = item && scope?.inner?.(item.dataset.panel!);
    if (inner && PARTS[inner.type].actuator) {
      e.stopPropagation();
      actuatePanel(circuit.part(item.closest<SVGElement>('.part')!.dataset.id!)!, inner);
      return;
    }
    const sel = closestIn(e.target, '.selector');
    if (sel) {
      e.stopPropagation();
      turnSelector(circuit.part(sel.closest<SVGElement>('.part')!.dataset.id!)!);
      return;
    }
    const act = closestIn(e.target, '.actuator');
    if (act) {
      e.stopPropagation();
      actuate(circuit.part(act.closest<SVGElement>('.part')!.dataset.id!)!);
      return;
    }
    // A selected frame's corner handle resizes it, the opposite corner fixed.
    const handle = closestIn(e.target, '.frame-handle');
    if (handle) {
      e.stopPropagation();
      const g = handle.closest<SVGGElement>('.part')!;
      const f = circuit.part(g.dataset.id!) as Part<'frame'>;
      resize = { id: e.pointerId, f, corner: handle.dataset.corner as Corner, box: frameBox(f) };
      g.setPointerCapture(e.pointerId);
      return;
    }
    const g = closestIn(e.target, '.part, .wire');
    if (!g) return;
    e.stopPropagation();
    const id = g.dataset.id!;
    if (e.shiftKey) {
      const ids = new Set(selected);
      if (ids.has(id)) ids.delete(id);
      else ids.add(id);
      setSelected(ids);
      return;
    }
    const finger = e.pointerType === 'touch';
    if (!selected.has(id)) setSelected([id], !finger);
    inspectOnLift = finger ? { id: e.pointerId, moved: false } : null;
    if (locked()) return; // inside a module: look, don't move
    if (g.classList.contains('wire')) {
      startSegmentDrag(circuit.wire(id)!, e, g);
      return;
    }

    // A frame carries what's inside it.
    const list = withContents(selectedNodes());
    bindTouchingPins(list);
    const { touching, inside } = wiresAround(list);
    const first = list[0];
    drag = {
      id: e.pointerId,
      start: board.screenToWorld(e.clientX, e.clientY),
      dx: 0,
      dy: 0,
      list,
      touching,
      inside,
      base: new Map(list.map((n) => [n.id, { x: n.x, y: n.y }])),
      orig: new Map(list.map((n) => [n.id, isPart(n) ? { x: n.x, y: n.y, rotation: n.rotation } : { x: n.x, y: n.y }])),
      viaBase: new Map(inside.map((w) => [w.id, w.via])),
      origVia: new Map(inside.map((w) => [w.id, w.via])),
      // A single part with no wires yet can be dropped into a wire.
      free: list.length === 1 && isPart(first) && !touching.length ? first : null,
      rot: isPart(first) ? first.rotation : 0,
    };
    g.setPointerCapture(e.pointerId);
  });

  world.addEventListener('pointermove', (e) => {
    if (resize && e.pointerId === resize.id) {
      const { f, corner, box } = resize;
      const p = board.screenToWorld(e.clientX, e.clientY);
      const b = { ...box };
      if (corner[1] === 'w') b.x1 = Math.min(snap(p.x), box.x2 - FRAME_MIN);
      else b.x2 = Math.max(snap(p.x), box.x1 + FRAME_MIN);
      if (corner[0] === 'n') b.y1 = Math.min(snap(p.y), box.y2 - FRAME_MIN);
      else b.y2 = Math.max(snap(p.y), box.y1 + FRAME_MIN);
      setFrameBox(f, b);
      return;
    }
    if (segDrag && e.pointerId === segDrag.id) {
      const { w, base, i, horiz, start } = segDrag;
      const p = board.screenToWorld(e.clientX, e.clientY);
      const d = snap(horiz ? p.y - start.y : p.x - start.x);
      if (d === segDrag.d) return;
      segDrag.d = d;
      if (inspectOnLift) inspectOnLift.moved = true;
      w.via = simplify(moveSegment(base, i, horiz ? 0 : d, horiz ? d : 0)).slice(1, -1);
      drawWire(w);
      return;
    }
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag;
    const p = board.screenToWorld(e.clientX, e.clientY);
    const dx = snap(p.x - d.start.x);
    const dy = snap(p.y - d.start.y);
    if (dx === d.dx && dy === d.dy) return;
    d.dx = dx;
    d.dy = dy;
    if (inspectOnLift) inspectOnLift.moved = true;
    for (const n of d.list) {
      const b = d.base.get(n.id)!;
      n.x = b.x + dx;
      n.y = b.y + dy;
      place(n);
    }
    for (const w of d.inside) {
      w.via = d.viaBase.get(w.id)!.map((v) => ({ x: v.x + dx, y: v.y + dy }));
    }
    d.touching.forEach(drawWire);
    if (d.free) snapIntoWire();
    refreshNets();
  });

  const endDrag = (e: PointerEvent) => {
    if (inspectOnLift?.id === e.pointerId) {
      if (e.type === 'pointerup' && !inspectOnLift.moved) onSelect([...selected]);
      inspectOnLift = null;
    }
    if (segDrag && e.pointerId === segDrag.id) segDrag = null;
    if (resize && e.pointerId === resize.id) endResize();
    if (!drag || e.pointerId !== drag.id) return;
    const c = drag.free;
    drag = null;
    highlight(null);
    const spot = c && findSpot(c.type, c, c.rotation);
    if (c && spot) embed(c, spot);
  };
  world.addEventListener('pointerup', endDrag);
  world.addEventListener('pointercancel', endDrag);

  // Dragging on empty board draws a selection box; parts and joints it touches
  // are selected, along with wires between them. Shift adds to the selection.
  // A finger pans the board instead (two fingers pinch, see board.ts).
  svg.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || board.spaceHeld) return;
    if (e.pointerType === 'touch') {
      setSelected([]);
      board.startPan(e);
      return;
    }
    const keep = e.shiftKey ? new Set(selected) : new Set<string>();
    setSelected(keep);
    const rect = svgEl('rect', 'marquee', world);
    marquee = { id: e.pointerId, start: board.screenToWorld(e.clientX, e.clientY), rect, keep };
    svg.setPointerCapture(e.pointerId);
  });

  svg.addEventListener('pointermove', (e) => {
    if (!marquee || e.pointerId !== marquee.id) return;
    const p = board.screenToWorld(e.clientX, e.clientY);
    const { start, rect, keep } = marquee;
    const box = {
      x1: Math.min(start.x, p.x),
      y1: Math.min(start.y, p.y),
      x2: Math.max(start.x, p.x),
      y2: Math.max(start.y, p.y),
    };
    rect.setAttribute('x', String(box.x1));
    rect.setAttribute('y', String(box.y1));
    rect.setAttribute('width', String(box.x2 - box.x1));
    rect.setAttribute('height', String(box.y2 - box.y1));
    const ids = new Set(keep);
    for (const n of [...circuit.components, ...circuit.joints]) if (touches(box, n)) ids.add(n.id);
    for (const w of circuit.wires) if (ids.has(endId(w.from)) && ids.has(endId(w.to))) ids.add(w.id);
    setSelected(ids);
  });

  const endBox = (e: PointerEvent) => {
    if (marquee && e.pointerId === marquee.id) endMarquee();
  };
  svg.addEventListener('pointerup', endBox);
  svg.addEventListener('pointercancel', endBox);

  window.addEventListener('keydown', (e) => {
    if (fromControl(e)) return;
    if (e.metaKey || e.ctrlKey) {
      const key = e.key.toLowerCase();
      if (wiring) return;
      if (key === 'c' && copySelected()) e.preventDefault();
      else if (key === 'x' && cutSelected()) e.preventDefault();
      else if (key === 'd') {
        e.preventDefault(); // also keeps the browser from bookmarking
        duplicateSelected();
      } else if (key === 'v' && clipboard) {
        e.preventDefault();
        paste(pointerAt ?? nextTo(clipboard));
      } else if ((key === 'backspace' || key === 'delete') && selected.size) {
        // ⌘⌫, the Mac's own delete (Ctrl+Backspace / Ctrl+Del elsewhere).
        e.preventDefault();
        deleteSelected();
      }
      return;
    }
    // An Esc that cancels a gesture is marked as used (defaultPrevented), so
    // it doesn't also close the tray; clearing the selection leaves it free.
    if (wiring) {
      if (e.key === 'Escape' || e.key === 'Delete') {
        e.preventDefault();
        stopWire();
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        wiring.via.pop();
        drawDraft();
      }
      return;
    }
    if (e.key === 'r' || e.key === 'R') {
      rotateSelected();
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      deleteSelected();
    } else if (e.key === 'Escape') {
      if (drag || segDrag || marquee || resize) e.preventDefault();
      if (resize) {
        cancelResize();
      } else if (drag) {
        cancelDrag();
      } else if (segDrag) {
        cancelSegmentDrag();
      } else if (marquee) {
        setSelected(marquee.keep);
        endMarquee();
      } else if (selected.size || !locked()) {
        setSelected([]);
      } else {
        e.preventDefault();
        onLeaveModule();
      }
    }
  });

  // --- Current flow -----------------------------------------------------------
  // Dots travel along each wire in the direction of conventional current
  // (+ to −), or of the electrons (− to +) when `electron`. Speed grows with the logarithm of the current, so microamps and
  // amps are both visible without either looking frozen or a blur.

  // wire id -> speed (units/s along from → to) easing toward target, dash offset
  const flows = new Map<string, { target: number; speed: number; offset: number }>();

  // `smooth` as for showLive: on AC the dots ease between directions instead
  // of jittering at the frame rate.
  function setFlow(currents: Map<string, number>, smooth = false, electron = false) {
    for (const w of circuit.wires) {
      const i = (electron ? -1 : 1) * (currents.get(w.id) ?? 0);
      const f = flows.get(w.id) ?? { target: 0, speed: 0, offset: 0 };
      f.target = Math.abs(i) < FLOW_MIN ? 0 : Math.sign(i) * FLOW_SPEED * Math.log10(1 + Math.abs(i) / FLOW_REF);
      if (!smooth) f.speed = f.target;
      flows.set(w.id, f);
      nodes.get(w.id)!.classList.toggle('flowing', f.target !== 0 || Math.abs(f.speed) > 0.5);
    }
    for (const id of flows.keys()) if (!nodes.has(id)) flows.delete(id);
  }

  // Advance light and current-flow dots by `dt` seconds of real time.
  function animate(dt: number) {
    const k = 1 - Math.exp(-dt / PERSISTENCE);
    for (const [id, s] of glows) {
      const g = nodes.get(id) ?? panelNodes.get(id);
      if (g && easeLit(s.shown, s.target, k)) paintLit(g, s.shown);
    }
    for (const [id, f] of flows) {
      f.speed += (f.target - f.speed) * k;
      if (Math.abs(f.speed) < 1e-3) continue;
      f.offset = (f.offset - f.speed * dt) % DOT_SPACING;
      (nodes.get(id)!.lastElementChild as SVGElement).style.strokeDashoffset = String(f.offset);
    }
  }

  // --- Copy, cut, paste, duplicate -----------------------------------------
  // Copying takes the selected parts and joints, joints at the ends of selected
  // wires, and every wire running between them. Wires with an end outside that
  // set can't come along. Pasted parts are new parts: fresh reference numbers,
  // the same settings, undamaged. Duplicate copies and pastes in one go, just
  // beside the original, without touching the clipboard.

  let clipboard: Copy | null = null;
  let pointerAt: Point | null = null; // world point under the pointer while it's over the board

  svg.addEventListener('pointermove', (e) => {
    pointerAt = board.screenToWorld(e.clientX, e.clientY);
  });
  svg.addEventListener('pointerleave', () => {
    pointerAt = null;
  });

  // A self-contained copy of the selection, or null if nothing can be copied.
  function snapshot(): Copy | null {
    const ids = new Set(selectedNodes().map((n) => n.id));
    for (const id of selected) {
      const w = circuit.wire(id);
      if (w) for (const end of [w.from, w.to]) if (end.joint !== undefined) ids.add(end.joint);
    }
    const parts = circuit.components.filter((c) => ids.has(c.id));
    const joints = circuit.joints.filter((j) => ids.has(j.id));
    if (!parts.length && !joints.length) return null;
    const wires = circuit.wires.filter((w) => ids.has(endId(w.from)) && ids.has(endId(w.to)));
    const partIndex = new Map(parts.map((c, i) => [c.id, i]));
    const jointIndex = new Map(joints.map((j, i) => [j.id, i]));
    const ref = (end: End): CopyEnd =>
      end.joint !== undefined ? { joint: jointIndex.get(end.joint)! } : { part: partIndex.get(end.part)!, pin: end.pin };
    const all: Placed[] = [...parts, ...joints];
    return {
      parts: parts.map((c) => ({ type: c.type, x: c.x, y: c.y, rotation: c.rotation, props: structuredClone(c.props) })),
      joints: joints.map((j) => ({ x: j.x, y: j.y })),
      wires: wires.map((w) => ({ from: ref(w.from), to: ref(w.to), via: w.via.map((p) => ({ ...p })) })),
      center: {
        x: snap(all.reduce((s, n) => s + n.x, 0) / all.length),
        y: snap(all.reduce((s, n) => s + n.y, 0) / all.length),
      },
    };
  }

  function copySelected(): boolean {
    const copy = snapshot();
    if (copy) clipboard = copy;
    return !!copy;
  }

  function cutSelected(): boolean {
    if (locked()) return false;
    if (!copySelected()) return false;
    deleteSelected();
    return true;
  }

  function duplicateSelected() {
    if (locked()) return;
    const copy = snapshot();
    if (copy) placeCopy(copy, nextTo(copy));
  }

  // Two grid steps down and right of where a copy was taken from.
  const nextTo = (copy: Copy): Point => ({ x: copy.center.x + 2 * GRID, y: copy.center.y + 2 * GRID });

  function paste(at: Point) {
    if (locked()) return;
    if (clipboard) placeCopy(clipboard, at);
  }

  // Add a copy to the circuit centred on world point `at`, and select it.
  // Copies are fresh parts: settings come along, but state the part manages
  // itself (a battery's charge, a pressed button) starts over.
  function placeCopy(copy: Copy, at: Point) {
    const dx = snap(at.x) - copy.center.x;
    const dy = snap(at.y) - copy.center.y;
    const parts = copy.parts.map((p) => {
      const c = circuit.add(p.type, p.x + dx, p.y + dy, p.rotation);
      const specs = PARTS[p.type].props;
      for (const [key, value] of Object.entries(structuredClone(p.props))) {
        if (!specs[key].hidden || specs[key].kept) (c.props as Record<string, PropValue>)[key] = value;
      }
      mountPart(c);
      return c;
    });
    const joints = copy.joints.map((j) => addJoint(j.x + dx, j.y + dy));
    const end = (e: CopyEnd): End => ('joint' in e ? { joint: joints[e.joint].id } : { part: parts[e.part].id, pin: e.pin });
    for (const w of copy.wires) {
      addWire(circuit.connect(end(w.from), end(w.to), w.via.map((p) => ({ x: p.x + dx, y: p.y + dy }))));
    }
    tidyJoints();
    const ids = new Set([...parts, ...joints].map((n) => n.id).filter((id) => circuit.get(id)));
    for (const w of circuit.wires) if (ids.has(endId(w.from)) && ids.has(endId(w.to))) ids.add(w.id);
    setSelected(ids);
  }

  // Redraw everything from the circuit data, e.g. after a file was loaded.
  function reload() {
    drag = null;
    resize = null;
    segDrag = null;
    if (wiring) stopWire();
    if (marquee) endMarquee();
    lit = null;
    setSelected([]);
    for (const g of nodes.values()) g.remove();
    nodes.clear();
    glows.clear();
    flows.clear();
    for (const c of circuit.components) mountPart(c);
    for (const j of circuit.joints) {
      const g = svgEl('g', 'joint', jointsLayer);
      g.dataset.id = j.id;
      g.innerHTML = `<circle class="joint-dot" r="4" /><circle class="joint-hit" r="${HIT_R}" />`;
      nodes.set(j.id, g);
      place(j);
    }
    for (const w of circuit.wires) addWire(w);
    tidyJoints();
  }

  // A touch gesture (a second finger, a long press) takes over: whatever the
  // first finger started is undone, as Esc would.
  board.onGesture(() => {
    inspectOnLift = null;
    if (resize) cancelResize();
    if (drag) cancelDrag();
    if (segDrag) cancelSegmentDrag();
    if (marquee) {
      setSelected(marquee.keep);
      endMarquee();
    }
    if (wiring) stopWire();
  });

  // Right-click: act on what's under the pointer (keeping the selection if it's
  // already part of it), or on nothing when on empty board.
  svg.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (wiring) stopWire();
    const g = closestIn(e.target, '.part, .wire, .joint');
    if (!g) setSelected([]);
    else if (!selected.has(g.dataset.id!)) setSelected([g.dataset.id!]);
    onContextMenu(e.clientX, e.clientY, board.screenToWorld(e.clientX, e.clientY));
  });

  return {
    add,
    preview,
    clearPreview: () => highlight(null),
    refreshPart,
    showLive,
    burn,
    setFlow,
    animate,
    copy: copySelected,
    cut: cutSelected,
    paste,
    duplicate: duplicateSelected,
    deleteSelected,
    rotate: rotateSelected,
    canCopy: () => !!snapshot(),
    canPaste: () => !!clipboard,
    hasSelection: () => selected.size > 0,
    selectContents,
    makeModule: makeModuleOfSelection,
    canSelectContents: () => {
      const [f, ...rest] = selectedNodes();
      return isFrame(f) && !rest.length;
    },
    deselect: () => setSelected([]),
    reload,
  };
}
