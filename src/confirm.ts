import type { MdDialog } from '@material/web/dialog/dialog.js';
import { t } from './i18n/index.ts';

let count = 0;

// Ask before doing something that can't be undone: an M3 dialog with a
// headline, a sentence of explanation, Cancel and the action. Ours rather
// than confirm(), so it looks the same in the browser and the desktop app
// (whose web view shows no confirm()). True if the action was chosen; Esc,
// Cancel or a click outside are a no.
export function confirmDialog({ headline, message, action }: { headline: string; message: string; action: string }): Promise<boolean> {
  const id = `confirm-form-${++count}`;
  const dialog = document.createElement('md-dialog') as MdDialog;
  dialog.className = 'confirm-dialog';
  dialog.innerHTML = `
    <div slot="headline" class="padded-title"></div>
    <form slot="content" id="${id}" method="dialog" class="confirm-body"><p class="confirm-text"></p></form>
    <div slot="actions" class="dialog-actions">
      <md-text-button form="${id}" value="cancel" autofocus></md-text-button>
      <md-text-button form="${id}" value="ok"></md-text-button>
    </div>`;
  dialog.querySelector('[slot="headline"]')!.textContent = headline;
  dialog.querySelector('.confirm-text')!.textContent = message;
  const [cancel, ok] = dialog.querySelectorAll('md-text-button');
  cancel.textContent = t('Cancel');
  ok.textContent = action;
  document.body.append(dialog);
  return new Promise((resolve) => {
    dialog.addEventListener('closed', () => {
      resolve(dialog.returnValue === 'ok');
      dialog.remove();
    });
    dialog.show();
  });
}
