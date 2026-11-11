import type { MdDialog } from '@material/web/dialog/dialog.js';
import type { Board } from './board.ts';
import './slider.ts';

const KEY = 'ampage:backdrop';
const SVG_NS = 'http://www.w3.org/2000/svg';

// Where the image sits, in world units: its top-left corner, its size as a
// percentage of its own pixels, and how strongly it shows.
interface Backdrop {
  src: string; // a data: URL
  width: number; // natural size, px
  height: number;
  x: number;
  y: number;
  size: number; // %
  opacity: number; // %
}

// A background image (File › Background image): a photo or drawing laid
// under the grid to trace or follow, panning and zooming with the board. It
// stays out of the circuit (not in files, links, prints or exports) and is
// remembered in this browser when it fits in storage.
export function createBackdrop(dialog: MdDialog, board: Board) {
  const image = document.createElementNS(SVG_NS, 'image');
  image.id = 'backdrop';
  image.setAttribute('preserveAspectRatio', 'none');
  image.style.pointerEvents = 'none';
  board.svg.querySelector('#grid')!.before(image);

  const q = <T extends Element>(sel: string) => dialog.querySelector<T>(sel)!;
  const opacity = q<HTMLElement & { min: number; max: number; step: number; value: number; valueLabel: string; label: string }>('.backdrop-opacity');
  const size = q<typeof opacity>('.backdrop-size');
  const opacityValue = q<HTMLElement>('.backdrop-opacity-value');
  const sizeValue = q<HTMLElement>('.backdrop-size-value');
  const controls = q<HTMLElement>('.backdrop-controls');
  Object.assign(opacity, { min: 10, max: 100, step: 5 });
  Object.assign(size, { min: 10, max: 400, step: 5 });

  let current: Backdrop | null = load();

  function load(): Backdrop | null {
    try {
      return JSON.parse(localStorage.getItem(KEY) ?? 'null');
    } catch {
      return null;
    }
  }

  function store() {
    try {
      if (current) localStorage.setItem(KEY, JSON.stringify(current));
      else localStorage.removeItem(KEY);
    } catch {
      // too big for storage (or none here): it lasts until the page closes
    }
  }

  function show() {
    image.style.display = current ? '' : 'none';
    controls.hidden = !current;
    if (!current) return;
    image.setAttribute('href', current.src);
    image.setAttribute('x', String(current.x));
    image.setAttribute('y', String(current.y));
    image.setAttribute('width', String((current.width * current.size) / 100));
    image.setAttribute('height', String((current.height * current.size) / 100));
    image.setAttribute('opacity', String(current.opacity / 100));
    opacity.value = current.opacity;
    size.value = current.size;
    opacityValue.textContent = opacity.valueLabel = `${current.opacity} %`;
    sizeValue.textContent = size.valueLabel = `${current.size} %`;
  }

  // Centre it on what's in view.
  function centre() {
    if (!current) return;
    const { x, y, scale } = board.view;
    current.x = x + board.svg.clientWidth / scale / 2 - (current.width * current.size) / 200;
    current.y = y + board.svg.clientHeight / scale / 2 - (current.height * current.size) / 200;
  }

  function update() {
    show();
    store();
  }

  q('.backdrop-pick').addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.addEventListener('load', async () => {
        const src = reader.result as string;
        const img = new Image();
        img.src = src;
        await img.decode();
        current = { src, width: img.naturalWidth, height: img.naturalHeight, x: 0, y: 0, size: current?.size ?? 100, opacity: current?.opacity ?? 40 };
        centre();
        update();
      });
      reader.readAsDataURL(file);
    });
    input.click();
  });
  q('.backdrop-centre').addEventListener('click', () => {
    centre();
    update();
  });
  q('.backdrop-remove').addEventListener('click', () => {
    current = null;
    update();
  });
  q('.backdrop-done').addEventListener('click', () => dialog.close());
  opacity.addEventListener('input', () => {
    if (current) current.opacity = opacity.value;
    update();
  });
  // Resizing keeps the image's centre where it is.
  size.addEventListener('input', () => {
    if (!current) return;
    const [cx, cy] = [current.x + (current.width * current.size) / 200, current.y + (current.height * current.size) / 200];
    current.size = size.value;
    current.x = cx - (current.width * current.size) / 200;
    current.y = cy - (current.height * current.size) / 200;
    update();
  });

  show();
  return { open: () => dialog.show() };
}
