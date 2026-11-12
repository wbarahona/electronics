// Where Ampage is running: a browser tab, or the desktop app (Tauri, see
// src-tauri). The desktop app's web view has no File System Access API and no
// downloads, so there these go through native dialogs and file access
// instead. The Tauri modules load only in the app.

export const isApp = '__TAURI_INTERNALS__' in window;

// The macOS app's web view ignores window.print(): it prints natively instead.
export const nativePrint = isApp && /Mac/.test(navigator.userAgent);

// Circuits are saved as .ampage (JSON inside); .json files from before still open.
const OPEN_FILTERS = [{ name: 'Ampage circuit', extensions: ['ampage', 'json'] }];
const SAVE_FILTERS = [{ name: 'Ampage circuit', extensions: ['ampage'] }];

const baseName = (path: string) => path.split(/[\\/]/).pop() ?? path;

// A circuit file picked in an open dialog, or null if cancelled.
export async function openCircuitFile(): Promise<{ path: string; name: string; text: string } | null> {
  const [{ open }, { readTextFile }] = await Promise.all([import('@tauri-apps/plugin-dialog'), import('@tauri-apps/plugin-fs')]);
  const path = await open({ multiple: false, directory: false, filters: OPEN_FILTERS });
  if (typeof path !== 'string') return null;
  return { path, name: baseName(path), text: await readTextFile(path) };
}

// Write a circuit to `path`, or to a file picked in a save dialog when there
// is none yet. Its path and name, or null if cancelled.
export async function saveCircuitFile(text: string, path: string | null, suggestedName: string): Promise<{ path: string; name: string } | null> {
  const [{ save }, { writeTextFile }] = await Promise.all([import('@tauri-apps/plugin-dialog'), import('@tauri-apps/plugin-fs')]);
  path ??= await save({ defaultPath: suggestedName, filters: SAVE_FILTERS });
  if (!path) return null;
  await writeTextFile(path, text);
  return { path, name: baseName(path) };
}

export interface CircuitFile {
  path: string;
  name: string;
  text: string;
}

// Circuit files the system asked the app to open (double-clicked in Finder or
// Explorer, or dropped on its icon; see open_files in src-tauri/src/lib.rs):
// `handle` gets those waiting now and any that come later, a batch at a time.
export async function onOpenedFiles(handle: (files: Promise<CircuitFile[]>) => void): Promise<void> {
  const [{ invoke }, { listen }, { readTextFile }] = await Promise.all([
    import('@tauri-apps/api/core'),
    import('@tauri-apps/api/event'),
    import('@tauri-apps/plugin-fs'),
  ]);
  const take = async () => {
    const paths = await invoke<string[]>('opened_files');
    return Promise.all(paths.map(async (path) => ({ path, name: baseName(path), text: await readTextFile(path) })));
  };
  await listen('files-opened', () => handle(take()));
  handle(take());
}

// Hand a file to the user: a download in the browser, a save dialog in the app.
export async function saveFile(blob: Blob, fileName: string): Promise<void> {
  if (!isApp) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = fileName;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    return;
  }
  const [{ save }, { writeFile }] = await Promise.all([import('@tauri-apps/plugin-dialog'), import('@tauri-apps/plugin-fs')]);
  const extension = fileName.split('.').pop() ?? '';
  const path = await save({ defaultPath: fileName, filters: [{ name: extension.toUpperCase(), extensions: [extension] }] });
  if (path) await writeFile(path, new Uint8Array(await blob.arrayBuffer()));
}

// Open the system print panel on paper `widthMm` × `heightMm` (macOS app,
// see print_sheet in src-tauri/src/lib.rs). It returns at once, while the
// panel is still open.
export async function printNatively(widthMm: number, heightMm: number): Promise<void> {
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('print_sheet', { widthMm, heightMm });
}
