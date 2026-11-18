import type { MdDialog } from '@material/web/dialog/dialog.js';
import type { Board } from './board.ts';
import { idb } from './idb.ts';
import './slider.ts';

const KEY = 'ampage:backdrop';
const IMAGE = 'image'; // its key in the database's backdrop store
const SVG_NS = 'http://www.w3.org/2000/svg';

// Where the image sits, in world units: its top-left corner, its size as a
// percentage of its own pixels, and how strongly it shows.
interface Backdrop {
  src: string; // an object URL for the image
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
// remembered in this browser: the image itself in IndexedDB (where its
// megabytes don't crowd the autosave out of localStorage), where it sits in
// localStorage. One kept the old way, as a data URL in localStorage, moves over.
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

  let current: Backdrop | null = null;
  void restore();

  // The image as last left: where it sits, then the picture itself.
  async function restore() {
    let saved: (Omit<Backdrop, 'src'> & { src?: string }) | null = null;
    try {
      saved = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    } catch {
      return;
    }
    if (!saved) return;
    try {
      if (saved.src) {
        const { src, ...where } = saved;
        await storeImage(await (await fetch(src)).blob());
        saved = where;
        localStorage.setItem(KEY, JSON.stringify(where));
      }
      const blob = await idb<Blob | undefined>('backdrop', 'readonly', (s) => s.get(IMAGE));
      if (!blob || current) return; // (none kept, or one picked meanwhile)
      current = { ...saved, src: URL.createObjectURL(blob) };
      show();
    } catch {
      // no storage here: no image to bring back
    }
  }

  // Where it sits (the image is kept apart, by storeImage).
  function store() {
    try {
      if (current) {
        const { src: _, ...where } = current;
        localStorage.setItem(KEY, JSON.stringify(where));
      } else localStorage.removeItem(KEY);
    } catch {
      // no storage here: it lasts until the page closes
    }
  }

  async function storeImage(image: Blob | null) {
    try {
      if (image) await idb('backdrop', 'readwrite', (s) => s.put(image, IMAGE));
      else await idb('backdrop', 'readwrite', (s) => s.delete(IMAGE));
    } catch {
      // no room or no storage: it lasts until the page closes
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
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) return;
      const src = URL.createObjectURL(file);
      const img = new Image();
      img.src = src;
      try {
        await img.decode();
      } catch {
        URL.revokeObjectURL(src);
        return;
      }
      if (current) URL.revokeObjectURL(current.src);
      current = { src, width: img.naturalWidth, height: img.naturalHeight, x: 0, y: 0, size: current?.size ?? 100, opacity: current?.opacity ?? 40 };
      centre();
      update();
      void storeImage(file);
    });
    input.click();
  });
  q('.backdrop-centre').addEventListener('click', () => {
    centre();
    update();
  });
  q('.backdrop-remove').addEventListener('click', () => {
    if (current) URL.revokeObjectURL(current.src);
    current = null;
    update();
    void storeImage(null);
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
