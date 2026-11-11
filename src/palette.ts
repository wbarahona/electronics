import type { MdMenu } from '@material/web/menu/menu.js';
import type { Board } from './board.ts';
import { CATEGORIES, PARTS, defaults, keepUpright, symbolMarkup, type CategoryId } from './components.ts';
import type { Editor } from './editor.ts';
import type { PartType } from './types.ts';

const SVG_NS = 'http://www.w3.org/2000/svg';
const DRAG_THRESHOLD = 4; // px before a press counts as a drag rather than a click

const ICON_HEIGHT = 26; // px for an ordinary two-pin symbol
const ICON_MAX_HEIGHT = 40; // px; taller symbols (chips, flip-flops) get more room
const ICON_MAX_WIDTH = 48; // px

// The icon's view of a symbol: the box around everything it draws (measured
// once per part type in a hidden SVG, plus room for stroke widths), at least
// the usual 88×48 so small symbols keep a common scale. Taller symbols get a
// taller icon, up to ICON_MAX_HEIGHT, so chips stay legible; the width follows
// so the symbol keeps its proportions.
const iconCache = new Map<PartType, { box: string; width: number; height: number }>();

function icon(type: PartType): { box: string; width: number; height: number } {
  const cached = iconCache.get(type);
  if (cached) return cached;
  const probe = document.createElementNS(SVG_NS, 'svg');
  probe.setAttribute('class', 'part');
  probe.style.cssText = 'position: absolute; visibility: hidden; width: 0; height: 0';
  probe.innerHTML = `<g>${symbolMarkup(type, defaults(type))}</g>`;
  document.body.append(probe);
  const b = (probe.firstElementChild as SVGGElement).getBBox();
  probe.remove();
  const pad = 4;
  const left = Math.min(-44, b.x - pad);
  const right = Math.max(44, b.x + b.width + pad);
  const top = Math.min(-24, b.y - pad);
  const bottom = Math.max(24, b.y + b.height + pad);
  const [width, height] = [right - left, bottom - top];
  const px = Math.min(ICON_MAX_HEIGHT, (ICON_HEIGHT * height) / 48);
  const scale = Math.min(px / height, ICON_MAX_WIDTH / width);
  const result = { box: `${left} ${top} ${width} ${height}`, width: width * scale, height: height * scale };
  iconCache.set(type, result);
  return result;
}

// A category's parts by group, groups in the order their first part is listed.
function groupsOf(category: CategoryId): [string, PartType[]][] {
  const groups = new Map<string, PartType[]>();
  for (const type of Object.keys(PARTS) as PartType[]) {
    const part = PARTS[type];
    if (part.category !== category) continue;
    const name = part.group ?? '';
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name)!.push(type);
  }
  return [...groups];
}

// The parts bar: one button per category in the top bar. Choosing one slides
// open the tray under the bar with that category's parts in a single row,
// in labelled groups (subcategories), that scrolls sideways when they don't fit (a mouse wheel scrolls it too); it
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
      <svg class="part" viewBox="${icon(type).box}" style="width: ${icon(type).width}px; height: ${icon(type).height}px" aria-hidden="true">${symbolMarkup(type, defaults(type))}</svg>
      <span>${part.name}</span>`;
    btn.addEventListener('pointerdown', (e) => startDrag(e, type, btn));
    return btn;
  }

  // Categories that don't fit the top bar go into a "More" menu.
  const buttons: HTMLButtonElement[] = [];
  const more = document.createElement('button');
  const moreMenu = document.createElement('md-menu') as MdMenu;
  let overflow: typeof CATEGORIES = [];

  function openTray(button: HTMLButtonElement, category: { id: CategoryId }) {
    openCategory?.classList.remove('open');
    openCategory?.setAttribute('aria-expanded', 'false');
    openCategory = button;
    button.classList.add('open');
    button.setAttribute('aria-expanded', 'true');
    trayParts.replaceChildren(...groupsOf(category.id).map(([name, types], _, all) => {
      const group = document.createElement('div');
      group.className = 'tray-group';
      // Captions only help when there's more than one group.
      if (all.length > 1) {
        const caption = document.createElement('div');
        caption.className = 'tray-group-label';
        caption.textContent = name;
        group.append(caption);
      }
      const row = document.createElement('div');
      row.className = 'tray-group-items';
      row.append(...types.map(partButton));
      group.append(row);
      return group;
    }));
    trayParts.scrollLeft = 0;
    tray.classList.add('open');
    tray.inert = false;
    syncMore();
  }

  // The parts stay in place while the tray slides shut.
  function closeTray() {
    if (!openCategory) return;
    openCategory.classList.remove('open');
    openCategory.setAttribute('aria-expanded', 'false');
    openCategory = null;
    tray.classList.remove('open');
    tray.inert = true;
    syncMore();
  }

  // "More" is highlighted while the open category is one of its own.
  function syncMore() {
    more.classList.toggle('open', !!openCategory && openCategory.hidden);
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
    buttons.push(button);
  }
  tray.inert = true;

  more.type = 'button';
  more.id = 'more-categories';
  more.className = 'palette-category palette-more';
  more.title = 'More categories';
  more.innerHTML = `
    <md-focus-ring></md-focus-ring>
    <md-ripple></md-ripple>
    <md-icon>more_horiz</md-icon>
    <span>More</span>
    <md-icon class="arrow">arrow_drop_down</md-icon>`;
  container.append(more);
  moreMenu.anchor = more.id;
  moreMenu.positioning = 'fixed';
  document.body.append(moreMenu);
  more.addEventListener('click', () => {
    moreMenu.replaceChildren(
      ...overflow.map((category) => {
        const item = document.createElement('md-menu-item');
        item.innerHTML = `<md-icon slot="start">${category.icon}</md-icon><div slot="headline">${category.label}</div>`;
        const button = buttons[CATEGORIES.indexOf(category)];
        item.addEventListener('click', () => {
          if (openCategory !== button) openTray(button, category);
        });
        return item;
      }),
    );
    moreMenu.open = !moreMenu.open;
  });

  // Show as many categories as fit, in order; the rest go under "More".
  function layout() {
    for (const b of buttons) b.hidden = false;
    more.hidden = true;
    const available = container.clientWidth;
    if (container.scrollWidth <= available) {
      overflow = [];
      syncMore();
      return;
    }
    more.hidden = false;
    const gap = parseFloat(getComputedStyle(container).columnGap) || 0;
    let used = more.offsetWidth;
    let fits = 0;
    for (const b of buttons) {
      if (used + gap + b.offsetWidth > available) break;
      used += gap + b.offsetWidth;
      fits++;
    }
    buttons.forEach((b, k) => (b.hidden = k >= fits));
    overflow = CATEGORIES.slice(fits);
    syncMore();
  }
  new ResizeObserver(layout).observe(container);

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
      keepUpright(ghost, at.rotation);
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
