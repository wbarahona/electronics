import { fromControl } from './keys.ts';
import type { Point } from './types.ts';

// Grid spacing in world units; must match the #grid-minor pattern in index.html.
export const GRID = 20;

export const snap = (v: number): number => Math.round(v / GRID) * GRID;

const MIN_SCALE = 0.25;
const MAX_SCALE = 4;
// The zoom buttons step through these (fractions of 100 %).
const ZOOM_STEPS = [0.25, 0.33, 0.5, 0.67, 0.8, 1, 1.25, 1.5, 2, 3, 4];
const FIT_MARGIN = 40; // world units around a fitted circuit
const FIT_MAX = 2; // fitting never zooms in past 200 %

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export type Board = ReturnType<typeof createBoard>;

export function createBoard(svg: SVGSVGElement) {
  const grid = svg.querySelector<SVGRectElement>('#grid')!;
  const world = svg.querySelector<SVGGElement>('#world')!;

  // x, y: world coordinates shown at the board's top-left corner.
  // scale: screen pixels per world unit.
  const view = { x: 0, y: 0, scale: 1 };
  const viewListeners: (() => void)[] = [];

  function render() {
    const w = svg.clientWidth / view.scale;
    const h = svg.clientHeight / view.scale;
    svg.setAttribute('viewBox', `${view.x} ${view.y} ${w} ${h}`);
    grid.setAttribute('x', String(view.x));
    grid.setAttribute('y', String(view.y));
    grid.setAttribute('width', String(w));
    grid.setAttribute('height', String(h));
    svg.style.setProperty('--px', String(1 / view.scale));
    for (const listener of viewListeners) listener();
  }

  function screenToWorld(clientX: number, clientY: number): Point {
    const r = svg.getBoundingClientRect();
    return {
      x: view.x + (clientX - r.left) / view.scale,
      y: view.y + (clientY - r.top) / view.scale,
    };
  }

  // Zoom keeping the world point under the cursor fixed.
  function zoomAt(clientX: number, clientY: number, factor: number) {
    const anchor = screenToWorld(clientX, clientY);
    const r = svg.getBoundingClientRect();
    view.scale = clamp(view.scale * factor, MIN_SCALE, MAX_SCALE);
    view.x = anchor.x - (clientX - r.left) / view.scale;
    view.y = anchor.y - (clientY - r.top) / view.scale;
    render();
  }

  // Scroll pans; pinch (reported as ctrl+wheel) or ctrl/cmd+wheel zooms.
  svg.addEventListener('wheel', (e) => {
    e.preventDefault();
    const unit = e.deltaMode === 1 ? 16 : 1; // Firefox reports lines for mouse wheels
    const dx = e.deltaX * unit;
    const dy = e.deltaY * unit;
    if (e.ctrlKey || e.metaKey) {
      zoomAt(e.clientX, e.clientY, Math.exp(-clamp(dy, -50, 50) * 0.005));
    } else {
      view.x += dx / view.scale;
      view.y += dy / view.scale;
      render();
    }
  }, { passive: false });

  // Hold space and drag, or middle-drag, to pan. Plain left-drag is left to the editor.
  // A tap of space (released without pressing on the board) is reported to
  // onSpaceTap listeners instead: it runs or pauses the simulation.
  let spaceHeld = false;
  let spacePanned = false; // the board was pressed while space was held
  const spaceTaps: (() => void)[] = [];
  let drag: { id: number; x: number; y: number } | null = null;

  const setSpace = (held: boolean) => {
    spaceHeld = held;
    svg.classList.toggle('space-pan', held);
  };

  window.addEventListener('keydown', (e) => {
    if (e.code !== 'Space' || fromControl(e)) return;
    e.preventDefault(); // no page scroll, no clicking a focused button
    if (spaceHeld) return;
    spacePanned = false;
    setSpace(true);
  });

  window.addEventListener('keyup', (e) => {
    if (e.code !== 'Space' || !spaceHeld) return;
    e.preventDefault();
    setSpace(false);
    if (!spacePanned) for (const tap of spaceTaps) tap();
  });

  window.addEventListener('blur', () => setSpace(false));

  svg.addEventListener('pointerdown', (e) => {
    if (e.button !== 1 && !(e.button === 0 && spaceHeld)) return;
    if (spaceHeld) spacePanned = true;
    e.preventDefault();
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
    svg.setPointerCapture(e.pointerId);
    svg.classList.add('panning');
  });

  svg.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    view.x -= (e.clientX - drag.x) / view.scale;
    view.y -= (e.clientY - drag.y) / view.scale;
    drag.x = e.clientX;
    drag.y = e.clientY;
    render();
  });

  const endDrag = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.id) return;
    drag = null;
    svg.classList.remove('panning');
  };
  svg.addEventListener('pointerup', endDrag);
  svg.addEventListener('pointercancel', endDrag);

  // When the board's top or left edge moves (the parts tray sliding open or
  // shut above it), shift the view by the same amount so the circuit stays
  // where it is on screen instead of jumping with the edge.
  let edge = svg.getBoundingClientRect();
  new ResizeObserver(() => {
    const r = svg.getBoundingClientRect();
    view.x += (r.left - edge.left) / view.scale;
    view.y += (r.top - edge.top) / view.scale;
    edge = r;
    render();
  }).observe(svg);
  render();

  // Zoom about the middle of the board to `scale`.
  function zoomTo(scale: number) {
    const r = svg.getBoundingClientRect();
    zoomAt(r.left + r.width / 2, r.top + r.height / 2, scale / view.scale);
  }

  // One zoom step in (+1) or out (−1) from the current scale.
  function zoomStep(dir: 1 | -1) {
    const next = dir > 0
      ? ZOOM_STEPS.find((s) => s > view.scale * 1.001) ?? MAX_SCALE
      : [...ZOOM_STEPS].reverse().find((s) => s < view.scale / 1.001) ?? MIN_SCALE;
    zoomTo(next);
  }

  // Show `box` (world units) whole and centred, zooming no closer than FIT_MAX.
  function fit(box: { x: number; y: number; width: number; height: number }) {
    const w = svg.clientWidth;
    const h = svg.clientHeight;
    if (!w || !h) return;
    view.scale = clamp(
      Math.min(w / (box.width + 2 * FIT_MARGIN), h / (box.height + 2 * FIT_MARGIN)),
      MIN_SCALE,
      FIT_MAX,
    );
    view.x = box.x + box.width / 2 - w / view.scale / 2;
    view.y = box.y + box.height / 2 - h / view.scale / 2;
    render();
  }

  // Pan and zoom to a saved view.
  function setView(v: { x: number; y: number; scale: number }) {
    view.x = v.x;
    view.y = v.y;
    view.scale = clamp(v.scale, MIN_SCALE, MAX_SCALE);
    render();
  }

  return {
    svg,
    world,
    view,
    setView,
    screenToWorld,
    zoomTo,
    zoomStep,
    fit,
    // Called after every pan or zoom.
    onView(listener: () => void) {
      viewListeners.push(listener);
    },
    get spaceHeld() {
      return spaceHeld;
    },
    onSpaceTap(listener: () => void) {
      spaceTaps.push(listener);
    },
  };
}
