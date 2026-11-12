// Where Ampage is running: a browser tab, or the desktop app (Tauri, see
// src-tauri). The desktop app's web view has no File System Access API, no
// downloads and no reliable confirm(), so there these go through native
// dialogs and file access instead. The Tauri modules load only in the app.

export const isApp = '__TAURI_INTERNALS__' in window;

const CIRCUIT_FILTERS = [{ name: 'Circuit', extensions: ['json'] }];

const baseName = (path: string) => path.split(/[\\/]/).pop() ?? path;

// Ask a yes/no question.
export async function ask(message: string): Promise<boolean> {
  if (!isApp) return confirm(message);
  const { ask } = await import('@tauri-apps/plugin-dialog');
  return ask(message, { title: 'Ampage', kind: 'warning' });
}

// A circuit file picked in an open dialog, or null if cancelled.
export async function openCircuitFile(): Promise<{ path: string; name: string; text: string } | null> {
  const [{ open }, { readTextFile }] = await Promise.all([import('@tauri-apps/plugin-dialog'), import('@tauri-apps/plugin-fs')]);
  const path = await open({ multiple: false, directory: false, filters: CIRCUIT_FILTERS });
  if (typeof path !== 'string') return null;
  return { path, name: baseName(path), text: await readTextFile(path) };
}

// Write a circuit to `path`, or to a file picked in a save dialog when there
// is none yet. Its path and name, or null if cancelled.
export async function saveCircuitFile(text: string, path: string | null, suggestedName: string): Promise<{ path: string; name: string } | null> {
  const [{ save }, { writeTextFile }] = await Promise.all([import('@tauri-apps/plugin-dialog'), import('@tauri-apps/plugin-fs')]);
  path ??= await save({ defaultPath: suggestedName, filters: CIRCUIT_FILTERS });
  if (!path) return null;
  await writeTextFile(path, text);
  return { path, name: baseName(path) };
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
