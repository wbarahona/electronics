import type { Board } from './board.ts';
import { CATEGORIES, PARTS, defaults, symbolMarkup, type CategoryId } from './components.ts';
import type { Editor } from './editor.ts';
import type { PartType } from './types.ts';

const SVG_NS = 'http://www.w3.org/2000/svg';
const DRAG_THRESHOLD = 4; // px before a press counts as a drag rather than a click

// The parts bar: one button per category, each opening a small flyout of its
// parts. Drag a part from the flyout onto the board, or click it to drop it in
// the middle of the view. The flyout gets out of the way as soon as a drag
// starts. While one flyout is open, hovering another category switches to it.
export function createPalette(container: HTMLElement, board: Board, editor: Editor) {
  const { svg, world } = board;
  const ghost = document.createElementNS(SVG_NS, 'g');
  ghost.classList.add('part', 'ghost');

  const flyout = document.createElement('div');
  flyout.className = 'palette-flyout';
  flyout.hidden = true;
  document.body.append(flyout);
  let openCategory: HTMLButtonElement | null = null; // its button while a flyout is open

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
      <svg class="part" viewBox="-44 -24 88 48" aria-hidden="true">${symbolMarkup(type, defaults(type))}</svg>
      <span>${part.name}</span>`;
    btn.addEventListener('pointerdown', (e) => startDrag(e, type, btn));
    return btn;
  }

  function openFlyout(button: HTMLButtonElement, category: { id: CategoryId }) {
    openCategory?.classList.remove('open');
    openCategory = button;
    button.classList.add('open');
    button.setAttribute('aria-expanded', 'true');
    flyout.replaceChildren(
      ...(Object.keys(PARTS) as PartType[])
        .filter((type) => PARTS[type].category === category.id)
        .map(partButton),
    );
    flyout.classList.remove('leaving');
    flyout.hidden = false;
    const r = button.getBoundingClientRect();
    flyout.style.left = `${Math.max(8, Math.min(r.left, innerWidth - flyout.offsetWidth - 8))}px`;
    flyout.style.top = `${r.bottom + 4}px`;
  }

  function closeFlyout() {
    if (!openCategory) return;
    openCategory.classList.remove('open');
    openCategory.setAttribute('aria-expanded', 'false');
    openCategory = null;
    flyout.hidden = true;
  }

  for (const category of CATEGORIES) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'palette-category';
    button.setAttribute('aria-haspopup', 'true');
    button.setAttribute('aria-expanded', 'false');
    button.innerHTML = `
      <md-focus-ring></md-focus-ring>
      <md-ripple></md-ripple>
      <md-icon>${category.icon}</md-icon>
      <span>${category.label}</span>
      <md-icon class="arrow">arrow_drop_down</md-icon>`;
    button.addEventListener('click', () => {
      if (openCategory === button) closeFlyout();
      else openFlyout(button, category);
    });
    button.addEventListener('pointerenter', () => {
      if (openCategory && openCategory !== button) openFlyout(button, category);
    });
    container.append(button);
  }

  // Close on a press outside the bar and flyout, or Esc.
  window.addEventListener(
    'pointerdown',
    (e) => {
      const target = e.target as Node;
      if (openCategory && !flyout.contains(target) && !container.contains(target)) closeFlyout();
    },
    true,
  );
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeFlyout();
  });
  window.addEventListener('resize', closeFlyout);

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
      if (!moved) {
        document.body.classList.add('dragging');
        // Fade the flyout out of the way; it stays in the page so the pointer
        // capture on this button keeps working, and closes when the drag ends.
        flyout.classList.add('leaving');
      }
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
      closeFlyout();
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
