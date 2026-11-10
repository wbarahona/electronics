import { fromControl } from './keys.js';

// Grid spacing in world units; must match the #grid-minor pattern in index.html.
export const GRID = 20;

export const snap = (v) => Math.round(v / GRID) * GRID;

const MIN_SCALE = 0.25;
const MAX_SCALE = 4;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function createBoard(svg) {
  const grid = svg.querySelector('#grid');
  const world = svg.querySelector('#world');

  // x, y: world coordinates shown at the board's top-left corner.
  // scale: screen pixels per world unit.
  const view = { x: 0, y: 0, scale: 1 };

  function render() {
    const w = svg.clientWidth / view.scale;
    const h = svg.clientHeight / view.scale;
    svg.setAttribute('viewBox', `${view.x} ${view.y} ${w} ${h}`);
    grid.setAttribute('x', view.x);
    grid.setAttribute('y', view.y);
    grid.setAttribute('width', w);
    grid.setAttribute('height', h);
    svg.style.setProperty('--px', 1 / view.scale);
  }

  function screenToWorld(clientX, clientY) {
    const r = svg.getBoundingClientRect();
    return {
      x: view.x + (clientX - r.left) / view.scale,
      y: view.y + (clientY - r.top) / view.scale,
    };
  }

  // Zoom keeping the world point under the cursor fixed.
  function zoomAt(clientX, clientY, factor) {
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
  let spaceHeld = false;
  let drag = null;

  const setSpace = (held) => {
    spaceHeld = held;
    svg.classList.toggle('space-pan', held);
  };

  window.addEventListener('keydown', (e) => {
    if (e.code !== 'Space' || fromControl(e)) return;
    e.preventDefault(); // no page scroll, no clicking a focused button
    if (!spaceHeld) setSpace(true);
  });

  window.addEventListener('keyup', (e) => {
    if (e.code !== 'Space') return;
    e.preventDefault();
    setSpace(false);
  });

  window.addEventListener('blur', () => setSpace(false));

  svg.addEventListener('pointerdown', (e) => {
    if (e.button !== 1 && !(e.button === 0 && spaceHeld)) return;
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

  const endDrag = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    drag = null;
    svg.classList.remove('panning');
  };
  svg.addEventListener('pointerup', endDrag);
  svg.addEventListener('pointercancel', endDrag);

  new ResizeObserver(render).observe(svg);
  render();

  return {
    svg,
    world,
    view,
    screenToWorld,
    get spaceHeld() {
      return spaceHeld;
    },
  };
}
