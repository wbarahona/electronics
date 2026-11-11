import type { Board } from './board.ts';
import { fromControl } from './keys.ts';

// Zoom controls floating at the board's bottom-left corner (an M3 surface
// with icon buttons): zoom in and out a step at a time, the zoom level (click
// it for 100 %), and fit the whole circuit in view. Keyboard: ⌘= / ⌘− / ⌘0
// (in place of the browser's page zoom) and ⇧1 to fit. ⌘-scroll zooms too;
// the level shown follows any zoom.
export function createZoom(root: HTMLElement, board: Board) {
  const level = root.querySelector<HTMLElement>('#zoom-level')!;
  const fit = () => {
    const box = board.world.getBBox();
    if (box.width || box.height) board.fit(box);
  };

  root.querySelector('#zoom-in')!.addEventListener('click', () => board.zoomStep(1));
  root.querySelector('#zoom-out')!.addEventListener('click', () => board.zoomStep(-1));
  root.querySelector('#zoom-fit')!.addEventListener('click', fit);
  level.addEventListener('click', () => board.zoomTo(1));

  const show = () => (level.textContent = `${Math.round(board.view.scale * 100)} %`);
  board.onView(show);
  show();

  window.addEventListener('keydown', (e) => {
    if (fromControl(e) || e.altKey) return;
    if (e.metaKey || e.ctrlKey) {
      if (e.key === '=' || e.key === '+') board.zoomStep(1);
      else if (e.key === '-') board.zoomStep(-1);
      else if (e.key === '0') board.zoomTo(1);
      else return;
    } else if (e.shiftKey && e.code === 'Digit1') {
      fit();
    } else {
      return;
    }
    e.preventDefault();
  });

  return { fit };
}
