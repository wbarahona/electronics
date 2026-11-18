import type { MdDialog } from '@material/web/dialog/dialog.js';
import { symbolMarkup } from './components.ts';
import { confirmDialog, promptDialog } from './confirm.ts';
import { t } from './i18n/index.ts';
import { library, storageUse, type LibModule } from './library.ts';
import { blockValues } from './modules.ts';
import { icon } from './palette.ts';
import { isApp } from './platform.ts';

// Manage modules (from the Modules tray): every module in one list, to keep
// the library in order as it grows. My modules can be renamed, exported or
// deleted one at a time, or ticked to export or delete together; Import adds
// more. Built-in ones are listed for reference, and stay. A line at the top
// says where they're kept and how much room they take.
export function createModuleManager(o: {
  builtins: () => Promise<LibModule[]>;
  exportModules: (list: LibModule[], name: string) => Promise<void>;
  importModules: () => Promise<void>;
  changed: () => void; // the library changed: refresh what shows it
  report: (message: string) => void;
}) {
  const dialog = document.createElement('md-dialog') as MdDialog;
  dialog.className = 'module-manager';
  dialog.innerHTML = `
    <div slot="headline" class="module-manager-head">
      <span class="module-manager-title"></span>
      <span class="module-manager-storage"></span>
    </div>
    <div slot="content" class="module-manager-body"></div>
    <div slot="actions" class="dialog-actions module-manager-actions">
      <md-text-button class="mm-import"><md-icon slot="icon">folder_open</md-icon></md-text-button>
      <span class="mm-spacer"></span>
      <md-text-button class="mm-export"><md-icon slot="icon">save</md-icon></md-text-button>
      <md-text-button class="mm-delete"><md-icon slot="icon">delete</md-icon></md-text-button>
      <md-filled-button class="mm-close"></md-filled-button>
    </div>`;
  document.body.append(dialog);
  const q = <T extends Element>(sel: string) => dialog.querySelector<T>(sel)!;
  type Button = HTMLElement & { disabled: boolean };
  const body = q<HTMLElement>('.module-manager-body');
  const exportButton = q<Button>('.mm-export');
  const deleteButton = q<Button>('.mm-delete');

  let mine: LibModule[] = [];
  const ticked = new Set<string>();

  // A button's label after its icon (the icon slot stays).
  const label = (b: Element, text: string) => {
    for (const n of [...b.childNodes]) if (n.nodeType === Node.TEXT_NODE) n.remove();
    b.append(text);
  };

  const sizeOf = (list: LibModule[]) => list.reduce((sum, m) => sum + JSON.stringify(m).length, 0);
  const bytes = (n: number) =>
    n < 1024 ? `${n} B` : n < 1024 ** 2 ? `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} KB` : n < 1024 ** 3 ? `${(n / 1024 ** 2).toFixed(1)} MB` : `${(n / 1024 ** 3).toFixed(1)} GB`;
  const dateOf = (iso: string) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  };

  async function storageLine() {
    const where = isApp ? t('Kept in the app’s data folder') : t('Kept in this browser');
    const count = t('{count} modules, {size}', { count: String(mine.length), size: bytes(sizeOf(mine)) });
    const use = await storageUse();
    const room = use && use.quota ? ` · ${t('{free} free for this site', { free: bytes(Math.max(0, use.quota - use.used)) })}` : '';
    q('.module-manager-storage').textContent = `${where} · ${count}${room}`;
  }

  // One module: its block, its name and what it is, and (mine) a tick box and
  // its actions.
  function row(m: LibModule, own: boolean): HTMLElement {
    const el = document.createElement('div');
    el.className = 'mm-row';
    const main = m.modules.find((d) => d.id === m.main)!;
    const props = blockValues(main);
    const look = icon('module', props);
    const inside = m.modules.length - 1;
    const facts = [
      t('Version {n}', { n: String(m.version) }),
      ...(own && dateOf(m.saved) ? [t('saved {date}', { date: dateOf(m.saved) })] : []),
      t('{count} parts', { count: String(main.parts.filter((c) => c.type !== 'terminal').length) }),
      ...(inside ? [t('{count} modules inside', { count: String(inside) })] : []),
    ];
    el.innerHTML = `
      ${own ? '<md-checkbox touch-target="wrapper"></md-checkbox>' : '<span class="mm-tick-space"></span>'}
      <svg class="part mm-look" viewBox="${look.box}" style="width: ${look.width}px; height: ${look.height}px" aria-hidden="true">${symbolMarkup('module', props)}</svg>
      <div class="mm-text"><div class="mm-name"></div><div class="mm-facts"></div></div>
      ${
        own
          ? `<md-icon-button class="mm-rename"><md-icon>edit</md-icon></md-icon-button>
             <md-icon-button class="mm-export-one"><md-icon>save</md-icon></md-icon-button>
             <md-icon-button class="mm-delete-one"><md-icon>delete</md-icon></md-icon-button>`
          : ''
      }`;
    el.querySelector('.mm-name')!.textContent = own ? m.name : t(m.name);
    el.querySelector('.mm-facts')!.textContent = facts.join(' · ');
    if (!own) return el;
    const box = el.querySelector<HTMLElement & { checked: boolean }>('md-checkbox')!;
    box.checked = ticked.has(m.id);
    box.setAttribute('aria-label', m.name);
    box.addEventListener('change', () => {
      if (box.checked) ticked.add(m.id);
      else ticked.delete(m.id);
      showSelection();
    });
    const tip = (sel: string, text: string) => el.querySelector(sel)!.setAttribute('title', text);
    tip('.mm-rename', t('Rename'));
    tip('.mm-export-one', t('Export…'));
    tip('.mm-delete-one', t('Delete'));
    el.querySelector('.mm-rename')!.addEventListener('click', () => void rename(m));
    el.querySelector('.mm-export-one')!.addEventListener('click', () => void o.exportModules([m], m.name));
    el.querySelector('.mm-delete-one')!.addEventListener('click', () => void remove([m]));
    return el;
  }

  function section(title: string, rows: HTMLElement[], empty: string, head?: HTMLElement): HTMLElement {
    const el = document.createElement('section');
    el.className = 'mm-section';
    const caption = document.createElement('div');
    caption.className = 'mm-caption';
    if (head) caption.append(head);
    caption.append(title);
    el.append(caption);
    if (rows.length) el.append(...rows);
    else {
      const hint = document.createElement('div');
      hint.className = 'mm-empty';
      hint.textContent = empty;
      el.append(hint);
    }
    return el;
  }

  async function render() {
    try {
      mine = await library.list();
    } catch (e) {
      o.report(t('Couldn’t read your modules: {error}', { error: String(e) }));
      mine = [];
    }
    for (const id of [...ticked]) if (!mine.some((m) => m.id === id)) ticked.delete(id);
    // Tick or untick them all.
    const all = document.createElement('md-checkbox') as HTMLElement & { checked: boolean; indeterminate: boolean; disabled: boolean };
    all.setAttribute('touch-target', 'wrapper');
    all.setAttribute('aria-label', t('Select all'));
    all.disabled = !mine.length;
    all.checked = !!mine.length && ticked.size === mine.length;
    all.indeterminate = ticked.size > 0 && ticked.size < mine.length;
    all.addEventListener('change', () => {
      if (all.checked) for (const m of mine) ticked.add(m.id);
      else ticked.clear();
      void render();
    });
    const builtins = await o.builtins();
    body.replaceChildren(
      section(t('My modules'), mine.map((m) => row(m, true)), t('None yet: save a module from its block’s menu, or import some.'), all),
      section(t('Built-in'), builtins.map((m) => row(m, false)), ''),
    );
    showSelection();
    void storageLine();
  }

  // The bulk actions name how many they act on.
  function showSelection() {
    const n = ticked.size;
    label(exportButton, n ? t('Export {count}…', { count: String(n) }) : t('Export…'));
    label(deleteButton, n ? t('Delete {count}…', { count: String(n) }) : t('Delete…'));
    exportButton.disabled = deleteButton.disabled = !n;
  }

  async function rename(m: LibModule) {
    const name = await promptDialog({ headline: t('Rename module'), label: t('Name'), value: m.name, action: t('Rename') });
    if (!name || name === m.name) return;
    await library.save({ ...m, name, saved: new Date().toISOString() });
    o.changed();
    await render();
  }

  async function remove(list: LibModule[]) {
    const one = list.length === 1;
    const ok = await confirmDialog({
      headline: one ? t('Delete {name}?', { name: list[0].name }) : t('Delete {count} modules?', { count: String(list.length) }),
      message: one
        ? t('It’s removed from my modules. Circuits that use it keep their copy.')
        : t('They’re removed from my modules. Circuits that use them keep their copies.'),
      action: t('Delete'),
    });
    if (!ok) return;
    try {
      for (const m of list) {
        await library.remove(m.id);
        ticked.delete(m.id);
      }
    } catch (e) {
      o.report(t('Couldn’t delete: {error}', { error: String(e) }));
    }
    o.changed();
    await render();
  }

  const selected = () => mine.filter((m) => ticked.has(m.id));
  q('.module-manager-title').textContent = t('Modules');
  label(q('.mm-import'), t('Import…'));
  q('.mm-close').textContent = t('Close');
  q('.mm-import').addEventListener('click', async () => {
    await o.importModules();
    await render();
  });
  exportButton.addEventListener('click', () => void o.exportModules(selected(), t('My modules')));
  deleteButton.addEventListener('click', () => void remove(selected()));
  q('.mm-close').addEventListener('click', () => dialog.close());

  async function open() {
    ticked.clear();
    await render();
    dialog.show();
  }

  return { open };
}
