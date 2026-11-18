// The app's IndexedDB database, for what's too big for localStorage: the
// module library (in the browser) and the background image. One object store
// each; opening the database adds any store it doesn't have yet.

const DB = 'ampage';
const VERSION = 2; // 1: modules; 2: backdrop
const STORES = ['modules', 'backdrop'] as const;

export type Store = (typeof STORES)[number];

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, VERSION);
    req.onupgradeneeded = () => {
      for (const name of STORES) {
        if (name === 'modules' && !req.result.objectStoreNames.contains(name)) req.result.createObjectStore(name, { keyPath: 'id' });
        else if (!req.result.objectStoreNames.contains(name)) req.result.createObjectStore(name);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// Run one request in its own transaction, and give its result once that's done.
export function idb<T>(store: Store, mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(store, mode);
        const req = run(tx.objectStore(store));
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
