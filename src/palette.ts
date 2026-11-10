import type { Board } from './board.ts';
import { CATEGORIES, PARTS, defaults, symbolMarkup, type CategoryId } from './components.ts';
import type { Editor } from './editor.ts';
import type { PartType } from './types.ts';

const SVG_NS = 'http://www.w3.org/2000/svg';
const DRAG_THRESHOLD = 4; // px before a press counts as a drag rather than a click

const ICON_HEIGHT = 26; // px, as .palette-item svg
const ICON_MAX_WIDTH = 48; // px

// The icon's view of a symbol: the usual 88×48 box around the pins, made
// taller for a part with pins above or below, and its on-screen width to
// match so the symbol keeps its proportions.
function icon(type: PartType): { box: string; width: number } {
  const ys = PARTS[type].pins.map((p) => p.y);
  const top = Math.min(-24, Math.min(...ys) - 4);
  const bottom = Math.max(24, Math.max(...ys) + 4);
  const height = bottom - top;
  return { box: `-44 ${top} 88 ${height}`, width: Math.min(ICON_MAX_WIDTH, (ICON_HEIGHT * 88) / height) };
}

// The parts bar: one button per category in the top bar. Choosing one slides
// open the tray under the bar with that category's parts in a single row that
// scrolls sideways when they don't fit (a mouse wheel scrolls it too); it
// stays open while you work, until its close button (always in view at the
// right) or the same category is clicked again.
// Drag a part from the tray onto the board, or click it to drop it in the
// middle of the view.
export function createPalette(container: HTMLElement, tray: HTMLElement, board: Board, editor: Editor) {
  const { svg, world } = board;
  const ghost = document.createElementNS(SVG_NS, 'g');
  ghost.classList.add('part', 'ghost');

  const trayParts = tray.querySelector<HTMLElement>('.tray-parts')!;
  tray.querySelector('.tray-close')!.addEventListener('click', () => closeTray());
  // A plain mouse wheel scrolls the row sideways; trackpads already can.
  trayParts.addEventListener(
    'wheel',
    (e) => {
      if (e.deltaX !== 0 || trayParts.scrollWidth <= trayParts.clientWidth) return;
      e.preventDefault();
      trayParts.scrollLeft += e.deltaY;
    },
    { passive: false },
  );
  let openCategory: HTMLButtonElement | null = null; // its button while the tray is open

  const overBoard = (e: { clientX: number; clientY: number }) => {
    const r = svg.getBoundingClientRect();
    return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
  };

  function partButton(type: PartType) {
    const part = PARTS[type];
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'palette-item';
    btn.title = `Drag ${part.name} onto the board`;
    btn.innerHTML = `
      <md-focus-ring></md-focus-ring>
      <md-ripple></md-ripple>
      <svg class="part" viewBox="${icon(type).box}" style="width: ${icon(type).width}px" aria-hidden="true">${symbolMarkup(type, defaults(type))}</svg>
      <span>${part.name}</span>`;
    btn.addEventListener('pointerdown', (e) => startDrag(e, type, btn));
    return btn;
  }

  function openTray(button: HTMLButtonElement, category: { id: CategoryId }) {
    openCategory?.classList.remove('open');
    openCategory?.setAttribute('aria-expanded', 'false');
    openCategory = button;
    button.classList.add('open');
    button.setAttribute('aria-expanded', 'true');
    trayParts.replaceChildren(
      ...(Object.keys(PARTS) as PartType[])
        .filter((type) => PARTS[type].category === category.id)
        .map(partButton),
    );
    trayParts.scrollLeft = 0;
    tray.classList.add('open');
    tray.inert = false;
  }

  // The parts stay in place while the tray slides shut.
  function closeTray() {
    if (!openCategory) return;
    openCategory.classList.remove('open');
    openCategory.setAttribute('aria-expanded', 'false');
    openCategory = null;
    tray.classList.remove('open');
    tray.inert = true;
  }

  for (const category of CATEGORIES) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'palette-category';
    button.title = category.label;
    button.setAttribute('aria-controls', tray.id);
    button.setAttribute('aria-expanded', 'false');
    button.innerHTML = `
      <md-focus-ring></md-focus-ring>
      <md-ripple></md-ripple>
      <md-icon>${category.icon}</md-icon>
      <span>${category.label}</span>
      <md-icon class="arrow">arrow_drop_down</md-icon>`;
    button.addEventListener('click', () => {
      if (openCategory === button) closeTray();
      else openTray(button, category);
    });
    container.append(button);
  }
  tray.inert = true;

  function startDrag(e: PointerEvent, type: PartType, btn: HTMLButtonElement) {
    if (e.button !== 0) return;
    e.preventDefault();
    btn.setPointerCapture(e.pointerId);
    ghost.innerHTML = symbolMarkup(type, defaults(type));
    const start = { clientX: e.clientX, clientY: e.clientY };
    let last = start;
    let moved = false;
    let rotation = 0;

    const showGhost = () => {
      if (!overBoard(last)) {
        ghost.remove();
        editor.clearPreview();
        return;
      }
      const at = editor.preview(type, board.screenToWorld(last.clientX, last.clientY), rotation);
      ghost.setAttribute('transform', `translate(${at.x} ${at.y}) rotate(${at.rotation})`);
      if (!ghost.isConnected) world.append(ghost);
    };

    const move = (ev: PointerEvent) => {
      if (!moved && Math.hypot(ev.clientX - start.clientX, ev.clientY - start.clientY) < DRAG_THRESHOLD) return;
      if (!moved) document.body.classList.add('dragging');
      moved = true;
      last = ev;
      showGhost();
    };

    const stop = () => {
      btn.removeEventListener('pointermove', move);
      btn.removeEventListener('pointerup', end);
      btn.removeEventListener('pointercancel', stop);
      window.removeEventListener('keydown', key, true);
      if (btn.hasPointerCapture(e.pointerId)) btn.releasePointerCapture(e.pointerId);
      document.body.classList.remove('dragging');
      ghost.remove();
      editor.clearPreview();
    };

    const end = (ev: PointerEvent) => {
      stop();
      if (!moved) {
        const r = svg.getBoundingClientRect();
        const p = board.screenToWorld(r.left + r.width / 2, r.top + r.height / 2);
        editor.add(type, p.x, p.y, rotation);
      } else if (overBoard(ev)) {
        const p = board.screenToWorld(ev.clientX, ev.clientY);
        editor.add(type, p.x, p.y, rotation);
      }
    };

    // Captured ahead of the editor's shortcuts so they act on the part being placed:
    // R rotates it, Esc or Delete cancels the placement.
    const key = (ev: KeyboardEvent) => {
      if (ev.metaKey || ev.ctrlKey) return;
      if (ev.key === 'r' || ev.key === 'R') {
        rotation = (rotation + 90) % 360;
        if (moved) showGhost();
      } else if (ev.key === 'Escape' || ev.key === 'Delete' || ev.key === 'Backspace') {
        ev.preventDefault();
        stop();
      } else {
        return;
      }
      ev.stopImmediatePropagation();
    };

    btn.addEventListener('pointermove', move);
    btn.addEventListener('pointerup', end);
    btn.addEventListener('pointercancel', stop);
    window.addEventListener('keydown', key, true);
  }
}
