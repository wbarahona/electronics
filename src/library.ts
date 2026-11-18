import type { ModuleDef } from './modules.ts';
import { isApp } from './platform.ts';

// The module library: modules saved to be placed in any circuit, kept apart
// from circuits. In the browser they're kept in IndexedDB (a record each;
// localStorage's few megabytes are the autosave's); in the desktop app as
// one file each in the app's data folder (modules/<id>.json), easy to back up.
// Either way behind the same list / save / remove.

export interface LibModule {
  id: string; // "lib-…", unique across libraries
  name: string;
  main: string; // the id, among `modules`, of the module itself
  modules: ModuleDef[]; // it and the modules placed inside it
  version: number; // goes up each time it's saved again
  saved: string; // when, ISO 8601
}

export interface Library {
  list(): Promise<LibModule[]>;
  save(m: LibModule): Promise<void>;
  remove(id: string): Promise<void>;
}

export const newLibraryId = () => `lib-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

// A stored module, checked loosely: anything else is skipped, not trusted.
function isLibModule(v: unknown): v is LibModule {
  const m = v as LibModule;
  return !!m && typeof m.id === 'string' && typeof m.name === 'string' && typeof m.main === 'string' && Array.isArray(m.modules) && m.modules.some((d) => d?.id === m.main);
}

const byName = (a: LibModule, b: LibModule) => a.name.localeCompare(b.name);

// --- Browser: IndexedDB ------------------------------------------------------------

const DB = 'ampage';
const STORE = 'modules';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function request<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const req = run(tx.objectStore(STORE));
        tx.oncomplete = () => {
          db.close();
          resolve(req.result);
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error);
        };
      }),
  );
}

const browserLibrary: Library = {
  async list() {
    const all = await request('readonly', (s) => s.getAll());
    return (all as unknown[]).filter(isLibModule).sort(byName);
  },
  async save(m) {
    // Ask the browser to keep the library rather than clear it when space
    // runs low (Chrome and Firefox honour this; it can't stop "clear site data").
    void navigator.storage?.persist?.();
    await request('readwrite', (s) => s.put(m));
  },
  async remove(id) {
    await request('readwrite', (s) => s.delete(id));
  },
};

// --- Desktop app: a file per module ----------------------------------------------------

const FOLDER = 'modules';

const appLibrary: Library = {
  async list() {
    const { BaseDirectory, exists, readDir, readTextFile } = await import('@tauri-apps/plugin-fs');
    const baseDir = BaseDirectory.AppData;
    if (!(await exists(FOLDER, { baseDir }))) return [];
    const out: LibModule[] = [];
    for (const entry of await readDir(FOLDER, { baseDir })) {
      if (!entry.isFile || !entry.name.endsWith('.json')) continue;
      try {
        const v: unknown = JSON.parse(await readTextFile(`${FOLDER}/${entry.name}`, { baseDir }));
        if (isLibModule(v)) out.push(v);
      } catch {
        // not one of ours, or damaged: left alone
      }
    }
    return out.sort(byName);
  },
  async save(m) {
    const { BaseDirectory, mkdir, writeTextFile } = await import('@tauri-apps/plugin-fs');
    const baseDir = BaseDirectory.AppData;
    await mkdir(FOLDER, { baseDir, recursive: true });
    await writeTextFile(`${FOLDER}/${m.id}.json`, JSON.stringify(m, null, 2), { baseDir });
  },
  async remove(id) {
    const { BaseDirectory, remove } = await import('@tauri-apps/plugin-fs');
    await remove(`${FOLDER}/${id}.json`, { baseDir: BaseDirectory.AppData });
  },
};

export const library: Library = isApp ? appLibrary : browserLibrary;

// How much the browser lets this site keep and has used, for showing it (null
// in the desktop app, or where the browser won't say).
export async function storageUse(): Promise<{ used: number; quota: number } | null> {
  if (isApp || !navigator.storage?.estimate) return null;
  const { usage = 0, quota = 0 } = await navigator.storage.estimate();
  return { used: usage, quota };
}
