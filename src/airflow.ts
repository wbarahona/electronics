import type { Engine } from './sim/engine.ts';
import { FAN_LENGTH, FAN_REACH, INTAKE_LENGTH, type Fan } from './sim/engine.ts';

// The air the fans move, drawn in the Thermal view: streamlines along each
// running fan's jet and into its intake, their dashes running the way the air
// goes, faster with more air. Each is coloured by the air's temperature along
// it on one absolute scale (blue ≤ 20 °C, red ≥ 60 °C), so cool air coming in
// and air warming as it passes hot parts both show.
//
// It draws what the simulator works with, not a fluid simulation: air goes
// in straight cones, doesn't flow round parts, and stops at the walls of the
// enclosure it's in (a fan on a wall blows through that one wall).

const SVG_NS = 'http://www.w3.org/2000/svg';
const JET_ANGLES = [-0.35, 0, 0.35]; // rad off the axis
const INTAKE_ANGLES = [Math.PI - 0.8, Math.PI, Math.PI + 0.8];
const START = 24; // px from the fan's centre, clear of its symbol
const STEP = 10; // px between the points sampled along a line
const STOPS = 5; // colour stops per line
const COLD = 20; // °C: blue
const HOT = 60; // °C: red

// An air temperature's colour: blue through green and yellow to red.
const airColor = (celsius: number) => {
  const x = Math.min(1, Math.max(0, (celsius - COLD) / (HOT - COLD)));
  return `hsl(${Math.round(220 * (1 - x))} 85% 50%)`;
};

interface Line {
  points: { x: number; y: number }[];
  jet: boolean; // from the fan (else into its intake)
  stops: SVGStopElement[];
  path: SVGPathElement;
}

export function createAirflow(world: SVGGElement) {
  const layer = document.createElementNS(SVG_NS, 'g');
  layer.setAttribute('class', 'airflow-lines');
  // Per fan: where it was when its lines were laid out, and its lines.
  const drawn = new Map<string, { key: string; g: SVGGElement; lines: Line[] }>();

  // Lay out a fan's lines: each runs from `from` px out to `to` along an
  // angle off its axis, cut short where it would leave its enclosure.
  function layout(engine: Engine, f: Fan): { g: SVGGElement; lines: Line[] } {
    const g = document.createElementNS(SVG_NS, 'g');
    const defs = document.createElementNS(SVG_NS, 'defs');
    g.append(defs);
    const along = (angle: number, r: number) => {
      const [c, s] = [Math.cos(angle), Math.sin(angle)];
      return { x: f.x + r * (f.dx * c - f.dy * s), y: f.y + r * (f.dy * c + f.dx * s) };
    };
    const lines: Line[] = [];
    const add = (angle: number, length: number, jet: boolean) => {
      const points = [];
      let box: string | null | undefined;
      for (let r = START; r <= length; r += STEP) {
        const p = along(angle, r);
        const here = engine.air.box(p);
        if (box === undefined) box = here;
        else if (here !== box) break;
        points.push(p);
      }
      if (points.length < 3) return;
      // The air flows out along a jet line and in along an intake line.
      if (!jet) points.reverse();
      const id = `air-${f.id}-${lines.length}`;
      const gradient = document.createElementNS(SVG_NS, 'linearGradient');
      gradient.id = id;
      gradient.setAttribute('gradientUnits', 'userSpaceOnUse');
      const [a, b] = [points[0], points.at(-1)!];
      Object.entries({ x1: a.x, y1: a.y, x2: b.x, y2: b.y }).forEach(([k, v]) => gradient.setAttribute(k, String(v)));
      const stops = Array.from({ length: STOPS }, (_, k) => {
        const stop = document.createElementNS(SVG_NS, 'stop');
        stop.setAttribute('offset', String(k / (STOPS - 1)));
        gradient.append(stop);
        return stop;
      });
      defs.append(gradient);
      const path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('class', 'airflow-line');
      path.setAttribute('d', `M ${points.map((p) => `${p.x} ${p.y}`).join(' L ')}`);
      path.setAttribute('stroke', `url(#${id})`);
      g.append(path);
      lines.push({ points, jet, stops, path });
    };
    for (const a of JET_ANGLES) add(a, FAN_LENGTH * f.scale * 0.9, true);
    for (const a of INTAKE_ANGLES) add(a, INTAKE_LENGTH * f.scale, false);
    layer.append(g);
    return { g, lines };
  }

  // Colour a fan's lines. The air it blows starts at the temperature of the
  // air it draws in and mixes with the air it passes over the length of its
  // reach; the air it draws in is the air where it comes from.
  function paint(engine: Engine, f: Fan, lines: Line[]) {
    const back = { x: f.x - f.dx * START * 1.5, y: f.y - f.dy * START * 1.5 };
    const inlet = engine.air.at(back, f.id);
    const duration = `${Math.min(3, Math.max(0.25, 0.8 / f.strength)).toFixed(2)}s`;
    for (const line of lines) {
      line.path.style.setProperty('--air-time', duration);
      line.stops.forEach((stop, k) => {
        const i = Math.round((k / (STOPS - 1)) * (line.points.length - 1));
        const local = engine.air.at(line.points[i], f.id);
        const mix = line.jet ? Math.exp(-(i * STEP) / (FAN_REACH * f.scale)) : 0;
        stop.setAttribute('stop-color', airColor(local + (inlet - local) * mix));
      });
    }
  }

  // Redraw from the simulation's latest air (only worth doing while the
  // Thermal view shows it).
  function update(engine: Engine) {
    // Over everything else on the board, so added once the board's own layers are.
    if (!layer.isConnected) world.append(layer);
    const fans = engine.air.fans();
    const seen = new Set<string>();
    for (const f of fans) {
      seen.add(f.id);
      const key = [f.x, f.y, f.dx, f.dy, f.scale].map((v) => v.toFixed(2)).join();
      let d = drawn.get(f.id);
      if (d?.key !== key) {
        d?.g.remove();
        d = { key, ...layout(engine, f) };
        drawn.set(f.id, d);
      }
      paint(engine, f, d.lines);
    }
    for (const [id, d] of drawn) {
      if (seen.has(id)) continue;
      d.g.remove();
      drawn.delete(id);
    }
  }

  // Enclosure walls may have moved: lay every fan's lines out again.
  function reset() {
    for (const d of drawn.values()) d.g.remove();
    drawn.clear();
  }

  return { update, reset };
}
