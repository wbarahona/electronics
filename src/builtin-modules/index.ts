import type { LibModule } from '../library.ts';

// The modules that come with the app: the Modules tray's Built-in group, each
// a library module saved as JSON (made with Make module, so they're laid out
// and pinned like one you'd make). Read when the tray first opens.
const FILES = [() => import('./5v-supply.json?raw'), () => import('./555-astable.json?raw')];

let loaded: Promise<LibModule[]> | null = null;

export function builtinModules(): Promise<LibModule[]> {
  loaded ??= Promise.all(FILES.map((load) => load().then((m) => JSON.parse(m.default) as LibModule)));
  return loaded;
}
