import type { MdDialog } from '@material/web/dialog/dialog.js';
import { EXAMPLES, type Example } from './examples/index.ts';
import { track } from './analytics.ts';
import { onLanguage, t } from './i18n/index.ts';

// The example gallery: an M3 dialog of cards, one per example circuit;
// picking one closes the dialog and opens the circuit (`open` asks first if
// that would replace unsaved work).
export function createGallery(dialog: MdDialog, open: (text: string, name: string) => void) {
  const list = dialog.querySelector<HTMLElement>('.gallery-list')!;
  dialog.querySelector('.gallery-close')!.addEventListener('click', () => dialog.close());

  // Open an example (as picking its card does).
  async function openExample(example: Example) {
    track(`example/${example.id}`);
    open(await example.load(), `${t(example.title)}.ampage`);
  }

  function card(example: Example) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'gallery-card';
    button.innerHTML = `
      <md-ripple></md-ripple>
      <md-focus-ring></md-focus-ring>
      <span class="gallery-icon"><md-icon>${example.icon}</md-icon></span>
      <span class="gallery-text">
        <span class="gallery-title"></span>
        <span class="gallery-description"></span>
      </span>`;
    button.querySelector('.gallery-title')!.textContent = t(example.title);
    button.querySelector('.gallery-description')!.textContent = t(example.description);
    button.addEventListener('click', () => {
      dialog.close();
      void openExample(example);
    });
    return button;
  }

  const render = () => list.replaceChildren(...EXAMPLES.map(card));
  render();
  onLanguage(render);

  return {
    open: () => dialog.show(),
    // (From a part's About this part.)
    openExample: (id: string) => {
      const example = EXAMPLES.find((e) => e.id === id);
      if (example) void openExample(example);
    },
  };
}
