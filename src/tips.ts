import type { MdDialog } from '@material/web/dialog/dialog.js';
import { t } from './i18n/index.ts';

const KEY = 'ampage:tip'; // index of the next tip to show

const MOD = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl+';

// The tips, in the order a newcomer meets them: the basics first, then the
// views, settings and files. `{mod}` is ⌘ or Ctrl+.
export const TIPS = [
  'Press Space to run or pause the simulation.',
  'Press {mod}K to search every part by name.',
  'Press R to rotate the selected part. It works while dragging, too.',
  'Drop a part onto a wire to splice it in.',
  'Double-click a wire to branch a new wire from it.',
  'Press Backspace while wiring to undo the last bend.',
  'Hover a part to read its live values. Press I to hide them when they’re in the way.',
  'Press ← or → to slow down or speed up the simulation in 10× steps.',
  'Hold Space and drag to pan the board.',
  'Press Shift+1 to fit the whole circuit in view, and {mod}0 to go back to 100 %.',
  'Drag across an empty part of the board to select several parts at once.',
  'Right-click the board to cut, copy, paste or duplicate.',
  'Open Examples in the rail for working circuits you can change.',
  'Turn on Thermal in the rail to see which parts run hot before they burn out.',
  'Place a scope probe and open Scope to watch its voltage over time.',
  'Give a part a fault in its properties, hidden, to practise fault finding with meters.',
  'Set Component values to Real spread in Settings to simulate parts within their tolerance, as built.',
  'Copy share link in the File menu puts the whole circuit in a link. Nothing is uploaded.',
  'Background image in the File menu puts a picture under the grid to trace a circuit from.',
  'Your circuit is saved in this browser as you work. Save it to a file to keep a copy elsewhere.',
];

// Tip of the day: an M3 dialog with one tip, Next tip and Close, and a
// checkbox to stop showing tips at startup. Each showing moves on to the next
// tip, remembered in this browser, so the list is seen in order. `enabled`
// is the Settings option the checkbox mirrors.
export function createTips(dialog: MdDialog, enabled: { tips: boolean }) {
  const text = dialog.querySelector<HTMLElement>('.tip-text')!;
  const count = dialog.querySelector<HTMLElement>('.tip-count')!;
  const never = dialog.querySelector<HTMLInputElement>('md-checkbox')!;

  let index = 0;
  try {
    index = Number(localStorage.getItem(KEY)) || 0;
  } catch {
    // no storage: start from the first tip
  }

  function next() {
    index %= TIPS.length;
    text.textContent = t(TIPS[index], { mod: MOD });
    count.textContent = t('Tip {n} of {total}', { n: index + 1, total: TIPS.length });
    index = (index + 1) % TIPS.length;
    try {
      localStorage.setItem(KEY, String(index));
    } catch {
      // no storage: the same tips come round again next time
    }
  }

  dialog.querySelector('.tip-next')!.addEventListener('click', next);
  never.addEventListener('change', () => (enabled.tips = !never.checked));

  return {
    show() {
      never.checked = !enabled.tips;
      next();
      dialog.show();
    },
    // Settings changed the option: the checkbox follows.
    sync: () => (never.checked = !enabled.tips),
  };
}
