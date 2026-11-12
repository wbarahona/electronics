import { t } from './i18n/index.ts';
import { fromControl } from './keys.ts';
import { parse, serialize, type SavedCircuit, type View } from './persist.ts';
import { ask, isApp, openCircuitFile, saveCircuitFile, saveFile } from './platform.ts';
import { circuitInLink, clearLink, linkFor } from './share.ts';
import type { Circuit } from './model.ts';

const AUTOSAVE_KEY = 'electronics:autosave';
const AUTOSAVE_EVERY_MS = 5000;
const FILE_TYPES = [{ description: 'Circuit', accept: { 'application/json': ['.json'] } }];

// The File System Access API (Chrome, Edge) gives a real "Save as" dialog and
// lets later saves go straight back to the same file. Elsewhere, saving
// downloads a file and opening uses a plain file input. The desktop app uses
// native dialogs and keeps the file's path the same way (see platform.ts).
interface PickerWindow {
  showSaveFilePicker?: (options: object) => Promise<FileSystemFileHandle>;
  showOpenFilePicker?: (options: object) => Promise<FileSystemFileHandle[]>;
}
const picker = window as unknown as PickerWindow;
const cancelled = (e: unknown) => e instanceof DOMException && e.name === 'AbortError';

export interface FileActionsOptions {
  circuit: Circuit;
  getView: () => View;
  // Replace the circuit on screen with a loaded one (or an empty one);
  // `opened` when it comes from a file, an example or a link rather than
  // this browser's autosave.
  load: (data: SavedCircuit, opened?: boolean) => void;
  // Tell the user something (went wrong, or was done).
  report: (message: string) => void;
}

// New / Open / Save (the File menu on the navigation rail, ⌘O / ⌘S, dropping a .json file
// on the window), plus autosave to this browser so a reload loses nothing.
export function createFileActions(root: HTMLElement, { circuit, getView, load, report }: FileActionsOptions) {
  let handle: FileSystemFileHandle | null = null; // file the last save or open used
  let path: string | null = null; // the same, in the desktop app
  let name = 'circuit.json';

  const empty = () => !circuit.components.length && !circuit.wires.length && !circuit.joints.length;
  const replaceOk = async () => empty() || ask(t('Replace the circuit on the board? Anything not saved to a file will be lost.'));
  // A circuit now on the board that no file stands behind yet.
  const detach = () => {
    handle = null;
    path = null;
  };
  const text = () => JSON.stringify(serialize(circuit, getView()), null, 2);

  async function newCircuit() {
    if (!(await replaceOk())) return;
    detach();
    name = 'circuit.json';
    load({ format: 'electronics-circuit', version: 1, parts: [], joints: [], wires: [] });
  }

  function open(text: string, fileName: string) {
    let data: SavedCircuit;
    try {
      data = parse(text);
    } catch (e) {
      report(t('Couldn’t open {file}: {error}', { file: fileName, error: (e as Error).message }));
      return false;
    }
    load(data, true);
    name = fileName;
    return true;
  }

  async function openFile() {
    if (!(await replaceOk())) return;
    if (isApp) {
      try {
        const file = await openCircuitFile();
        if (file && open(file.text, file.name)) {
          detach();
          path = file.path;
        }
      } catch (e) {
        report(t('Couldn’t open the file: {error}', { error: String(e) }));
      }
      return;
    }
    if (picker.showOpenFilePicker) {
      try {
        const [h] = await picker.showOpenFilePicker({ types: FILE_TYPES });
        const file = await h.getFile();
        if (open(await file.text(), file.name)) handle = h;
      } catch (e) {
        if (!cancelled(e)) report(t('Couldn’t open the file: {error}', { error: (e as Error).message }));
      }
      return;
    }
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (file && open(await file.text(), file.name)) handle = null;
    });
    input.click();
  }

  async function save() {
    if (isApp) {
      try {
        const file = await saveCircuitFile(text(), path, name);
        if (file) ({ path, name } = file);
      } catch (e) {
        report(t('Couldn’t save: {error}', { error: String(e) }));
      }
      return;
    }
    if (picker.showSaveFilePicker) {
      try {
        handle ??= await picker.showSaveFilePicker({ suggestedName: name, types: FILE_TYPES });
        const writable = await handle.createWritable();
        await writable.write(text());
        await writable.close();
        name = handle.name;
      } catch (e) {
        if (!cancelled(e)) report(t('Couldn’t save: {error}', { error: (e as Error).message }));
      }
      return;
    }
    saveFile(new Blob([text()], { type: 'application/json' }), name);
  }

  root.querySelector('#file-new')!.addEventListener('click', newCircuit);
  root.querySelector('#file-open')!.addEventListener('click', openFile);
  root.querySelector('#file-save')!.addEventListener('click', save);

  window.addEventListener('keydown', (e) => {
    if (!(e.metaKey || e.ctrlKey) || fromControl(e)) return;
    const key = e.key.toLowerCase();
    if (key === 's') {
      e.preventDefault();
      save();
    } else if (key === 'o') {
      e.preventDefault();
      openFile();
    }
  });

  // Drop a circuit file anywhere on the window to open it.
  window.addEventListener('dragover', (e) => {
    if (e.dataTransfer?.types.includes('Files')) e.preventDefault();
  });
  window.addEventListener('drop', async (e) => {
    const file = e.dataTransfer?.files[0];
    if (!file) return;
    e.preventDefault();
    if ((await replaceOk()) && open(await file.text(), file.name)) detach();
  });

  // --- Autosave ---------------------------------------------------------------
  // Kept in this browser only (localStorage): a reload picks up where you
  // left off. Storage can be unavailable (private windows), so failures are
  // ignored rather than shown.

  function autosave() {
    try {
      localStorage.setItem(AUTOSAVE_KEY, text());
    } catch {
      // no storage here; nothing to do
    }
  }

  let pending = 0;
  // Call after edits; saves shortly after things settle.
  function changed() {
    clearTimeout(pending);
    pending = window.setTimeout(autosave, 500);
  }

  // Values that change while the simulation runs (battery charge, damage)
  // are picked up every few seconds, and when the page is left.
  setInterval(autosave, AUTOSAVE_EVERY_MS);
  window.addEventListener('pagehide', autosave);

  // The autosaved circuit, if there is a usable one.
  function restore(): SavedCircuit | null {
    try {
      const saved = localStorage.getItem(AUTOSAVE_KEY);
      return saved ? parse(saved) : null;
    } catch {
      return null;
    }
  }

  // --- Share by link ------------------------------------------------------------
  // Copy a link that opens this circuit (see share.ts); opening the page from
  // such a link offers to open its circuit, as does pasting one into this tab.

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(await linkFor(JSON.stringify(serialize(circuit, getView()))));
      report(t('Link copied: anyone with it can open this circuit.'));
    } catch (e) {
      report(t('Couldn’t make a link: {error}', { error: (e as Error).message }));
    }
  }

  async function openLink() {
    let text: string | null;
    try {
      text = await circuitInLink();
    } catch {
      report(t('This link’s circuit is damaged (was the link cut short?).'));
      clearLink();
      return;
    }
    if (text === null) return;
    clearLink();
    if ((await replaceOk()) && open(text, 'shared-circuit.json')) detach();
  }

  // A link from the desktop app would point into the app itself: none there.
  if (isApp) root.querySelector<HTMLElement>('#file-share')!.hidden = true;
  else root.querySelector('#file-share')!.addEventListener('click', copyLink);
  window.addEventListener('hashchange', openLink);

  // A circuit from elsewhere (an example), opened as an unsaved new file.
  async function openText(text: string, fileName: string) {
    if ((await replaceOk()) && open(text, fileName)) detach();
  }

  // The circuit's file name without its extension (for print titles).
  const title = () => name.replace(/\.json$/i, '');

  return { changed, restore, title, openText, openLink };
}
