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

// Ask for a name: an M3 dialog with a headline, an outlined text field
// (filled with `value`, selected so typing replaces it), Cancel and the
// action. The name typed (trimmed), or null if cancelled or left empty.
export function promptDialog({ headline, label, value, action }: { headline: string; label: string; value: string; action: string }): Promise<string | null> {
  const id = `prompt-form-${++count}`;
  const dialog = document.createElement('md-dialog') as MdDialog;
  dialog.className = 'confirm-dialog';
  dialog.innerHTML = `
    <div slot="headline" class="padded-title"></div>
    <form slot="content" id="${id}" method="dialog" class="confirm-body">
      <md-outlined-text-field class="prompt-field" maxlength="80"></md-outlined-text-field>
    </form>
    <div slot="actions" class="dialog-actions">
      <md-text-button form="${id}" value="cancel"></md-text-button>
      <md-filled-button form="${id}" value="ok"></md-filled-button>
    </div>`;
  dialog.querySelector('[slot="headline"]')!.textContent = headline;
  const field = dialog.querySelector<HTMLElement & { label: string; value: string; select(): void; focus(): void }>('.prompt-field')!;
  field.label = label;
  field.value = value;
  const cancel = dialog.querySelector('md-text-button')!;
  const ok = dialog.querySelector<HTMLElement & { disabled: boolean }>('md-filled-button')!;
  cancel.textContent = t('Cancel');
  ok.textContent = action;
  // Nothing typed, nothing to save under.
  const check = () => (ok.disabled = !field.value.trim());
  field.addEventListener('input', check);
  check();
  // Enter in the field is the action.
  field.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || !field.value.trim()) return;
    e.preventDefault();
    dialog.close('ok');
  });
  document.body.append(dialog);
  return new Promise((resolve) => {
    dialog.addEventListener('opened', () => {
      field.focus();
      field.select();
    });
    dialog.addEventListener('closed', () => {
      resolve(dialog.returnValue === 'ok' && field.value.trim() ? field.value.trim() : null);
      dialog.remove();
    });
    dialog.show();
  });
}
