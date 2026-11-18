import type { MdDialog } from '@material/web/dialog/dialog.js';
import type { MdMenu } from '@material/web/menu/menu.js';
import './material.ts';
import { createBoard } from './board.ts';
import { createAudio } from './audio.ts';
import { createControls } from './controls.ts';
import { AMBIENT, createCircuit, type Circuit } from './model.ts';
import { createEditor, type Live } from './editor.ts';
import { createBackdrop } from './backdrop.ts';
import { createFileActions } from './files.ts';
import { createGallery } from './gallery.ts';
import { createHistory } from './history.ts';
import { createMenu } from './menu.ts';
import type { Nets } from './nets.ts';
import { createPalette } from './palette.ts';
import { createPanel } from './panel.ts';
import { createReadout } from './readout.ts';
import { createPrint } from './print.ts';
import { createScope } from './scope.ts';
import { createSearch } from './search.ts';
import { createSettings } from './settings.ts';
import { createTips } from './tips.ts';
import { createTour, toured } from './tour.ts';
import { createShortcuts } from './shortcuts.ts';
import { registerCommands } from './commands.ts';
import { createTooltips } from './tooltip.ts';
import { showVersion } from './version.ts';
import { createZoom } from './zoom.ts';
import { fromControl } from './keys.ts';
import { language, onLanguage, t } from './i18n/index.ts';
import { onNorm, refText } from './norm.ts';
import { fromShown, onDecimalMark, shownUnit, toShown } from './units.ts';
import { createEngine } from './sim/engine.ts';
import { wireCurrents } from './sim/flow.ts';
import { createAirflow } from './airflow.ts';
import { MODELS, type Result, type Sound, type Thermal } from './sim/models.ts';
import { MODULES_EXTENSION, parse, parseModules, serialize, serializeModules, type SavedCircuit, type View } from './persist.ts';
import { PANEL_SCALES, adoptVersion, blockAt, blockValues, canMount, editCopy, editedBlock, flatPart, flatten, fromLibrary, insideOf, newerIn, rememberSetting, toLibrary, updateModule, type Face, type ModuleDef } from './modules.ts';
import { library, newLibraryId, type LibModule } from './library.ts';
import { builtinModules } from './builtin-modules/index.ts';
import { createModuleManager } from './module-manager.ts';
import { analyticsAvailable, setAnalytics, track } from './analytics.ts';
import { confirmDialog, promptDialog } from './confirm.ts';
import type { TrayGroup } from './palette.ts';
import { isApp, openTextFile, saveFile } from './platform.ts';
import { PARTS } from './components.ts';
import { createFaceEditor } from './face-editor.ts';
import { blockLayout, type TitleSpot } from './parts/modules/block.ts';
import type { Part } from './types.ts';

const MOD = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl+';

// An element index.html must have.
function byId<T extends Element = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`index.html is missing #${id}`);
  return el as unknown as T;
}

// Someone new here: nothing saved in this browser yet (checked before
// anything is), so the tour takes the tip of the day's place at startup.
const newcomer = (() => {
  try {
    return !localStorage.getItem('ampage:settings') && !localStorage.getItem('electronics:autosave') && !toured();
  } catch {
    return false;
  }
})();

createTooltips();
showVersion();

// Settings first: the theme colours everything else, and the language
// translates index.html before anything is added to it.
const settings = createSettings(byId('settings-dialog'));

const board = createBoard(byId<SVGSVGElement>('board'));
const circuit = createCircuit();
// What the board shows: the circuit, or the inside of a module block stepped
// into (see enterModule). The editor, the hover readout and the panel look
// through this; the simulation, files and undo always use the whole circuit.
let shownCircuit: Circuit = circuit;
const shown = new Proxy(circuit, {
  get(_target, key) {
    const v: unknown = Reflect.get(shownCircuit, key);
    return typeof v === 'function' ? v.bind(shownCircuit) : v;
  },
  set: (_target, key, value) => Reflect.set(shownCircuit, key, value),
});
// The blocks stepped into, outermost first (ids as flatten gives them), each
// with the view of the level above, to come back to.
const path: { id: string; view: View }[] = [];
// A module's definition being edited (see editModule): a copy laid out as a
// circuit of its own, shown instead (`mode` inside), or its block's face laid
// out by hand (`face`: left out while untouched, null for automatic again),
// with the view and run state to go back to.
let editing: {
  def: ModuleDef;
  circuit: Circuit;
  frame: string;
  block: string;
  view: View;
  running: boolean;
  mode: 'inside' | 'face';
  face?: Face | null;
  panel?: string[]; // its front-panel parts as changed (left out while untouched)
} | null = null;
const blank = createCircuit(); // what the board shows under the Face view
// The parts shown can only be looked at and operated: inside a block, not editing.
const viewOnly = () => path.length > 0 && !editing;
let selection: string[] = []; // the selected ids, for the context menu
const engine = createEngine(circuit);
const airflow = createAirflow(board.world);

// The ambient temperature, on the Thermal view's panel: the circuit's own
// (saved with it, undoable), −20 to 60 °C, shown in °F under the US standard.
// It applies at once, paused or running; undo takes it when the slider is let go.
const ambientSlider = byId<HTMLElement & { min: number; max: number; step: number; value: number; valueLabel: string }>('thermal-legend').querySelector<
  HTMLElement & { min: number; max: number; step: number; value: number; valueLabel: string }
>('.thermal-ambient-slider')!;
const ambientValue = byId('thermal-legend').querySelector<HTMLElement>('.thermal-ambient-value')!;
const ambientText = (celsius: number) => `${Math.round(toShown(celsius, '°C'))} ${shownUnit('°C')}`;
function showAmbient() {
  Object.assign(ambientSlider, { min: Math.round(toShown(-20, '°C')), max: Math.round(toShown(60, '°C')), step: 1 });
  ambientSlider.value = Math.round(toShown(circuit.ambient, '°C'));
  ambientValue.textContent = ambientSlider.valueLabel = ambientText(circuit.ambient);
}
ambientSlider.addEventListener('input', () => {
  circuit.ambient = fromShown(ambientSlider.value, '°C');
  ambientValue.textContent = ambientSlider.valueLabel = ambientText(circuit.ambient);
  if (!nets) return;
  engine.rebuild(nets);
  showResults();
});
ambientSlider.addEventListener('change', () => {
  files.changed();
  history.changed();
});
let nets: Nets | null = null;
// Ideal values or the real spread (Settings): solve again when it changes.
engine.tolerances = settings.tolerances;
settings.onChange(() => {
  if (engine.tolerances === settings.tolerances) return;
  engine.tolerances = settings.tolerances;
  if (!nets) return;
  engine.rebuild(nets);
  showResults();
});
let currents = new Map<string, number>(); // wire id -> amps
let sounds = new Map<string, Sound>(); // part id -> the tone it's making
const audio = createAudio();
const scope = createScope(byId('scope'));
let probes: (string | undefined)[] = []; // part id of each scope channel's probe

// The first working probe on each channel; their voltages are recorded after
// every simulation step, so the scope misses nothing between frames.
function findProbes() {
  probes = scope.CHANNELS.map(
    (ch) => circuit.components.find((c) => c.type === 'scopeProbe' && !c.broken && (c.props as { channel: string }).channel === ch)?.id,
  );
}
engine.onStep = (t) => {
  if (probes.some(Boolean)) scope.record(t, probes.map((id) => (id ? (engine.results.get(id)?.pinV[0] ?? NaN) : NaN)));
};
const readout = createReadout(
  byId('readout'),
  board.svg,
  shown,
  engine,
  (id) => currents.get(id),
);
// Values on hover (Settings), also toggled with I when the tooltip is in the way.
readout.enabled = settings.readout;
settings.onChange(() => (readout.enabled = settings.readout));
window.addEventListener('keydown', (e) => {
  if (e.key.toLowerCase() !== 'i' || e.metaKey || e.ctrlKey || e.altKey || e.repeat || fromControl(e)) return;
  settings.readout = !settings.readout;
});

// How close a part runs to failing on the scale of its heat (1 = at its
// rating, its limit = failing): its heat, plus what warmer or cooler
// surroundings add (see thermalState in src/sim/engine.ts).
const stressOf = (r: Result, thermal: Thermal<never>) =>
  r.celsius !== undefined && thermal.rise ? (r.celsius - AMBIENT) / thermal.rise : r.heat;

// The parts mounted on the faces of the blocks shown (their copies, by
// flattened id), so their controls and lamps show live values too.
let panelCache: { at: unknown; parts: Part[] } = { at: null, parts: [] };
function panelParts(): Part[] {
  if (panelCache.at === nets) return panelCache.parts;
  const ids = shown.components
    .filter((c) => c.type === 'module')
    .flatMap((c) => blockLayout(c.props as Part<'module'>['props']).panel.map((q) => `${c.id}/${q.id}`));
  const flat = ids.length ? new Map(flatten(circuit).parts.map((f) => [f.part.id, f.part])) : new Map<string, Part>();
  panelCache = { at: nets, parts: ids.map((id) => flat.get(id)).filter((c): c is Part => !!c) };
  return panelCache.parts;
}

// Push the latest simulation results to the screen: how brightly each part
// shines, how close each is to failing (0 at its rating, 1 at its limit), and
// the current along every wire. While running, light and flow ease toward the
// new values (see editor.animate); when paused they jump straight there.
// How hot to touch something is, for its shimmer: 0 up to TOUCH_HOT, rising
// to 1 at TOUCH_SCORCHING. Around 60 °C a surface starts to burn (touch limits
// in safety standards run about 48–70 °C, by material).
const TOUCH_HOT = 60;
const TOUCH_SCORCHING = 120;
const hotToTouch = (celsius: number | undefined) =>
  celsius === undefined ? 0 : Math.min(1, Math.max(0, (celsius - TOUCH_HOT) / (TOUCH_SCORCHING - TOUCH_HOT)));

function showResults() {
  const smooth = controls.running;
  const live: Live = new Map();
  sounds = new Map();
  for (const c of [...shown.components, ...panelParts()]) {
    const { brightness, thermal, reading, failure, active, reverse, tint, segments, light, sound, needle } = MODELS[c.type];
    const r = engine.results.get(c.id);
    const tone = r && sound && !c.broken ? sound(r, c.props) : null;
    if (tone) sounds.set(c.id, tone);
    live.set(c.id, {
      reading: reading && (c.broken ? (failure?.display ?? '–') : r ? reading(r, c.props) : '–'),
      glow: r && brightness ? brightness(r, c.props) : 0,
      heat: r && thermal && !c.broken ? Math.min(1, Math.max(0, (stressOf(r, thermal) - 1) / (thermal.limit - 1))) : 0,
      temp: thermal ? (c.broken ? 1 : r ? Math.max(0, stressOf(r, thermal) / thermal.limit) : 0) : r && tint ? tint(r, c.props) : undefined,
      shimmer: r && !c.broken ? hotToTouch(r.celsius ?? r.state.air) : 0,
      needle: r && needle && !c.broken ? needle(r, c.props) : undefined,
      level: r?.level,
      active: r && active ? !c.broken && active(r) : undefined,
      reverse: r && reverse ? reverse(r, c.props) : undefined,
      segments: r && segments ? (c.broken ? [] : segments(r, c.props)) : undefined,
      light: r && light ? light(r, c.props).map((x) => (c.broken ? 0 : x)) : undefined,
    });
  }
  editor.showLive(live, smooth);
  // (The board's class, not the legend: a circuit can load before that's set up.)
  if (board.svg.classList.contains('thermal')) airflow.update(engine);
  panel.showLive(live);
  currents = nets ? wireCurrents(shown, nets, engine.results) : new Map();
  editor.setFlow(currents, smooth, settings.flow === 'electron');
  readout.refresh();
}

// Undo / redo: the circuit captured whole after each edit, restored in place
// (the simulation carries on; only a new or opened circuit resets it).
const history = createHistory(byId('history-actions'), {
  // (While a module is edited, its own steps: see editModule.)
  // ("keep": the face untouched so far.)
  capture: () =>
    editing
      ? JSON.stringify({ edit: serialize(editing.circuit), face: editing.face === undefined ? 'keep' : editing.face, panel: editing.panel ?? 'keep' })
      : JSON.stringify(serialize(circuit)),
  restore(snapshot) {
    if (editing) {
      const { edit, face, panel: mounted } = JSON.parse(snapshot) as { edit: unknown; face: Face | null | 'keep'; panel: string[] | 'keep' };
      const data = parse(JSON.stringify(edit));
      editing.circuit.load(data.parts, data.joints, data.wires, data.ambient, data.modules);
      editing.face = face === 'keep' ? undefined : face;
      editing.panel = mounted === 'keep' ? undefined : mounted;
      if (editing.mode === 'face') showFace();
      else editor.reload();
      return;
    }
    const data = parse(snapshot);
    leaveModules();
    circuit.load(data.parts, data.joints, data.wires, data.ambient, data.modules);
    editor.reload();
    showAmbient();
  },
});

const editor = createEditor(board, shown, {
  // (Inside a module the parts are looked at, not set: no panel.)
  onSelect: (ids) => {
    selection = ids;
    panel.show(ids.length === 1 && !viewOnly() ? ids[0] : null);
  },
  onChange: (next) => {
    // A module being edited: its own undo steps; the simulation waits.
    if (editing) {
      history.changed();
      return;
    }
    nets = next;
    airflow.reset();
    findProbes();
    engine.rebuild(nets);
    showResults();
    files.changed();
    history.changed();
  },
  // A switch inside a block (flipped inside it, or on its front panel) is
  // remembered by that block's copy. (The value comes with the change: looking
  // the part up again would apply the block's old setting to it first.)
  onPropChange: (id, key, value) => {
    if (id.includes('/') && !editing && key !== undefined && value !== undefined) {
      const c = flatPart(circuit, id);
      const act = c && PARTS[c.type].actuator;
      if (act && !act.momentary && act.prop === key) rememberSetting(circuit, id, key, value);
    }
    panel.refresh();
  },
  onEnterModule: enterModule,
  onLeaveModule: () => leaveModule(),
  onContextMenu: (x, y, at) =>
    menu.open(x, y, [
      { label: t('Cut'), icon: 'content_cut', shortcut: `${MOD}X`, enabled: editor.canCopy() && !viewOnly(), action: editor.cut },
      { label: t('Copy'), icon: 'content_copy', shortcut: `${MOD}C`, enabled: editor.canCopy(), action: editor.copy },
      { label: t('Paste'), icon: 'content_paste', shortcut: `${MOD}V`, enabled: editor.canPaste() && !viewOnly(), action: () => editor.paste(at) },
      { label: t('Duplicate'), icon: 'library_add', shortcut: `${MOD}D`, enabled: editor.canCopy() && !viewOnly(), action: editor.duplicate },
      { label: t('Rotate'), icon: 'rotate_right', shortcut: 'R', enabled: editor.hasSelection() && !viewOnly(), action: editor.rotate },
      ...(editor.canSelectContents() && !viewOnly()
        ? [
            { label: t('Select contents'), icon: 'select_all', enabled: true, action: editor.selectContents },
            { label: t('Make module'), icon: 'category', enabled: true, action: makeModule },
          ]
        : []),
      ...(editing?.mode === 'inside' && selection.length === 1 && canMount(shown.part(selection[0])?.type ?? 'note')
        ? [onPanelItem(selection[0])]
        : []),
      ...(selection.length === 1 && shown.part(selection[0])?.type === 'module' && !editing
        ? [
            { label: t('Edit module'), icon: 'edit', enabled: true, action: () => editModule(selection[0]) },
            { label: t('Save to my modules'), icon: 'library_add', enabled: true, action: () => void saveToLibrary(selection[0]) },
            ...(newerFor(selection[0])
              ? [{ label: t('Update to version {n}', { n: String(newerFor(selection[0])!.version) }), icon: 'autorenew', enabled: true, action: () => updateFromLibrary(selection[0]) }]
              : []),
          ]
        : []),
      'separator',
      { label: t('Delete'), icon: 'delete', shortcut: MOD === '⌘' ? '⌘⌫' : t('Del'), enabled: editor.hasSelection() && !viewOnly(), danger: true, action: editor.deleteSelected },
    ]),
}, { root: () => editing?.circuit ?? circuit, locked: viewOnly, inner: (id) => flatPart(circuit, id) });
const menu = createMenu(byId('menu'), byId('menu-anchor'));
const panel = createPanel(byId('props'), shown, editor, {
  makeModule,
  editModule: (id) => editModule(id),
  saveModule: (id) => void saveToLibrary(id),
  newer: (id) => newerFor(id)?.version ?? null,
  updateModule: (id) => updateFromLibrary(id),
});

// Make the selected frame a module, saying why not or what had to give.
function makeModule() {
  track('module/make');
  const said = editor.makeModule();
  if (said) showToast(t(said.message, { count: String(said.count ?? 0) }));
}
const palette = createPalette(byId('palette'), byId('palette-tray'), board, editor, moduleTray);

// --- The module library -------------------------------------------------------------
// Modules saved to be placed in any circuit (see src/library.ts): the Modules
// tray lists them; dragged or clicked from there, a module joins the circuit
// (or the module being edited) and a block of it is placed.

async function moduleTray(): Promise<TrayGroup[]> {
  const item = (m: LibModule, mine: boolean) => ({
    key: m.id,
    name: t(m.name),
    props: blockValues(m.modules.find((d) => d.id === m.main)!),
    place: (x: number, y: number, rotation: number) => placeFromLibrary(m, x, y, rotation),
    ...(mine ? { menu: (cx: number, cy: number) => libraryMenu(m, cx, cy) } : {}),
  });
  let mine: LibModule[] = [];
  try {
    mine = await library.list();
  } catch (e) {
    showToast(t('Couldn’t read your modules: {error}', { error: String(e) }));
  }
  const builtins = await builtinModules();
  known = [...builtins, ...mine];
  return [
    { label: t('Built-in'), items: builtins.map((m) => item(m, false)), empty: '' },
    {
      // (In the browser, they're this browser's: say so.)
      label: isApp ? t('My modules') : t('My modules (in this browser)'),
      items: mine.map((m) => item(m, true)),
      empty: t('Save a module from its block’s menu to keep it here.'),
      actions: [{ label: t('Manage…'), icon: 'tune', run: () => void moduleManager.open() }],
    },
  ];
}

// The library as last read (built-in and mine), to tell when a module in the
// circuit has a newer version there.
let known: LibModule[] = [];
async function readKnown() {
  try {
    known = [...(await builtinModules()), ...(await library.list())];
  } catch {
    // the tray says so when opened
  }
}
void readKnown();

// The newer version of the module a block is a copy of, if the library has one.
function newerFor(id: string): LibModule | undefined {
  const block = blockAt(circuit, id);
  const def = block && circuit.modules.find((m) => m.id === (block.props as { module: string }).module);
  return def && newerIn(def, known);
}

// Bring a block's module up to the library's newer version: every copy of it
// follows (one undo step).
function updateFromLibrary(id: string) {
  const lib = newerFor(id);
  const block = blockAt(circuit, id);
  const def = block && circuit.modules.find((m) => m.id === (block.props as { module: string }).module);
  if (!lib || !def) return;
  const cut = adoptVersion(circuit, def, lib);
  showLevel();
  panel.show(null);
  showToast(
    cut
      ? t('Updated {name} to version {n}; {count} wires went to pins that are gone and were cut.', { name: def.name, n: String(lib.version), count: String(cut) })
      : t('Updated {name} to version {n}.', { name: def.name, n: String(lib.version) }),
  );
}

// Manage modules: the whole library in one list (see src/module-manager.ts).
const moduleManager = createModuleManager({
  builtins: builtinModules,
  exportModules,
  importModules,
  changed: () => {
    palette.refreshModules();
    void readKnown();
  },
  report: showToast,
});

// A file name from a module's name.
const fileNameOf = (name: string) => `${name.trim().replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, '-') || 'modules'}.${MODULES_EXTENSION}`;

async function exportModules(list: LibModule[], name: string) {
  try {
    await saveFile(new Blob([serializeModules(list)], { type: 'application/json' }), fileNameOf(name));
  } catch (e) {
    showToast(t('Couldn’t export: {error}', { error: String(e) }));
  }
}

// Add the modules in a file to mine: new ones, and newer versions of ones I
// have; older or the same versions are left as they are.
async function importModules() {
  let file: { name: string; text: string } | null;
  try {
    file = await openTextFile(t('Ampage modules'), [MODULES_EXTENSION, 'json']);
  } catch (e) {
    showToast(t('Couldn’t open the file: {error}', { error: String(e) }));
    return;
  }
  if (!file) return;
  try {
    const incoming = parseModules(file.text);
    const have = await library.list();
    let added = 0;
    for (const m of incoming) {
      const old = have.find((h) => h.id === m.id);
      if (old && old.version >= m.version) continue;
      await library.save(m);
      added++;
    }
    palette.refreshModules();
    void readKnown();
    const skipped = incoming.length - added;
    showToast(
      skipped
        ? t('Imported {count} modules; {skipped} you already had.', { count: String(added), skipped: String(skipped) })
        : t('Imported {count} modules.', { count: String(added) }),
    );
  } catch (e) {
    showToast(t('Couldn’t open {file}: {error}', { file: file.name, error: t((e as Error).message) }));
  }
}

function placeFromLibrary(m: LibModule, x: number, y: number, rotation: number) {
  if (viewOnly()) {
    showToast(t('Step out of the module to place another.'));
    return;
  }
  const target = editing?.circuit ?? circuit;
  // (A built-in one by name; mine only as mine: their names are the user's.)
  track(`module/place/${m.id.startsWith('builtin-') ? m.id.slice(8) : 'mine'}`);
  const id = fromLibrary(target, m);
  editor.add('module', x, y, rotation, blockValues(target.modules.find((d) => d.id === id)!));
}

// Save the module a block is a copy of to my modules: as a new one, or as the
// next version of the one it was saved as or placed from.
async function saveToLibrary(id: string) {
  const block = blockAt(circuit, id);
  const def = block && circuit.modules.find((m) => m.id === (block.props as { module: string }).module);
  if (!def) return;
  try {
    const [libId, mainId] = def.source?.id.split('#') ?? [];
    const had = (await library.list()).find((m) => m.id === libId && m.main === mainId);
    await library.save(toLibrary(circuit, def, had?.id ?? newLibraryId(), (had?.version ?? 0) + 1));
    files.changed();
    palette.refreshModules();
    void readKnown();
    showToast(t(had ? 'Updated {name} in my modules.' : 'Saved {name} to my modules.', { name: def.name }));
  } catch (e) {
    showToast(t('Couldn’t save to my modules: {error}', { error: String(e) }));
  }
}

function libraryMenu(m: LibModule, x: number, y: number) {
  menu.open(x, y, [
    { label: t('Export…'), icon: 'save', enabled: true, action: () => void exportModules([m], m.name) },
    {
      label: t('Rename'),
      icon: 'edit',
      enabled: true,
      action: async () => {
        const name = await promptDialog({ headline: t('Rename module'), label: t('Name'), value: m.name, action: t('Rename') });
        if (!name || name === m.name) return;
        await library.save({ ...m, name, saved: new Date().toISOString() });
        palette.refreshModules();
      },
    },
    'separator',
    {
      label: t('Delete'),
      icon: 'delete',
      enabled: true,
      danger: true,
      action: async () => {
        const ok = await confirmDialog({
          headline: t('Delete {name}?', { name: m.name }),
          message: t('It’s removed from my modules. Circuits that use it keep their copy.'),
          action: t('Delete'),
        });
        if (!ok) return;
        await library.remove(m.id);
        palette.refreshModules();
      },
    },
  ]);
}
createSearch(byId('search'), palette);
const controls = createControls(byId('sim-controls'));
board.onSpaceTap(controls.toggle);

// A short message at the bottom of the screen (an M3 snackbar).
const toast = byId('toast');
let toastTimer = 0;
function showToast(message: string) {
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toast.hidden = true;
  }, 6000);
}

// --- Inside modules -------------------------------------------------------------
// Double-clicking a module block steps inside it: the board shows its own
// parts, live (their readouts are the simulation's, and its buttons and
// switches work), with a path bar along the top to step back out, as does Esc.
// The simulation carries on throughout; stepping out returns to the same pan
// and zoom.
const pathBar = byId('module-path');

// Show the level the path ends at (dropping levels whose block is gone).
function showLevel() {
  while (path.length && !insideOf(circuit, path.at(-1)!.id)) path.pop();
  const id = path.at(-1)?.id;
  shownCircuit = editing ? (editing.mode === 'face' ? blank : editing.circuit) : (id && insideOf(circuit, id)) || circuit;
  files.quietly(() => editor.reload());
  renderPath();
}

function enterModule(id: string) {
  if (editing) return;
  if (!insideOf(circuit, id)) {
    showToast(t('This module’s definition isn’t in this circuit.'));
    return;
  }
  path.push({ id, view: { x: board.view.x, y: board.view.y, scale: board.view.scale } });
  panel.show(null);
  showLevel();
  board.fitAll();
}

function leaveModule(levels = 1) {
  if (!path.length || editing) return;
  let view: View | undefined;
  for (let k = 0; k < levels && path.length; k++) view = path.pop()!.view;
  showLevel();
  if (view) board.setView(view);
}

// Back to the whole circuit at once, as it's about to be replaced (a file
// opened); an edit in progress is dropped. The caller redraws.
function leaveModules() {
  if (editing) {
    board.setView(editing.view);
    editing = null;
    faceEditor.hide();
    history.end();
  }
  if (path.length) board.setView(path[0].view);
  path.length = 0;
  shownCircuit = circuit;
  renderPath();
}

// --- Editing a module ------------------------------------------------------------
// Edit module (a block's menu or panel, or the path bar inside one) opens its
// definition as a circuit of its own, inside its frame: everything can be
// moved, wired, added and set as on the board, with undo steps of its own,
// while the simulation waits. Done puts it back as the definition and every
// copy follows (one undo step on the circuit); Cancel leaves it as it was.

function editModule(id: string) {
  if (editing) return;
  const block = blockAt(circuit, id);
  const def = block && circuit.modules.find((m) => m.id === (block.props as { module: string }).module);
  if (!block || !def) {
    showToast(t('This module’s definition isn’t in this circuit.'));
    return;
  }
  const { edit, frame } = editCopy(def, circuit);
  editing = { def, circuit: edit, frame, block: id, view: { x: board.view.x, y: board.view.y, scale: board.view.scale }, running: controls.running, mode: 'inside' };
  controls.pause();
  panel.show(null);
  history.begin();
  showLevel();
  board.fitAll();
}

function finishEdit(save: boolean) {
  const e = editing;
  if (!e) return;
  let cut = 0;
  if (save) {
    const done = updateModule(circuit, e.def, e.circuit, e.frame, e.face, e.panel);
    if ('error' in done) {
      showToast(t(done.error));
      return;
    }
    cut = done.cut;
  }
  editing = null;
  faceEditor.hide();
  history.end();
  panel.show(null);
  showLevel();
  board.setView(e.view);
  if (save) {
    files.changed();
    if (cut) showToast(t('{count} wires went to pins that are gone and were cut.', { count: String(cut) }));
  }
  if (e.running && !controls.running) controls.toggle();
}

// The Face view: the block the edit would make, laid out by hand. Each change
// is an undo step of the edit.
let faceDisplay: { id: string; s: number } | null = null; // the display selected on the Face view
const faceEditor = createFaceEditor(
  board,
  (face) => {
    if (!editing) return;
    editing.face = face;
    history.changed();
  },
  (display) => {
    const was = faceDisplay?.id;
    faceDisplay = display;
    if (display?.id !== was) renderPath();
  },
);

// While editing, the context menu of a part that can go on the front panel
// puts it there or takes it off.
function onPanelItem(id: string) {
  const e = editing!;
  const now = e.panel ?? e.def.panel ?? [];
  const on = now.includes(id);
  return {
    label: t('On the front panel'),
    icon: on ? 'check' : 'check_box_outline_blank',
    enabled: true,
    action: () => {
      e.panel = on ? now.filter((x) => x !== id) : [...now, id];
      history.changed();
    },
  };
}

// The face to show: as changed in this edit, else as the module has it.
const faceNow = (e: NonNullable<typeof editing>) => (e.face === undefined ? e.def.face : (e.face ?? undefined));

// Show the Face view (again: after an undo, or automatic layout).
function showFace() {
  const e = editing;
  if (!e) return;
  const block = editedBlock(e.def, e.circuit, e.frame, faceNow(e), e.panel ?? e.def.panel);
  if (!block) {
    showToast(t('Keep the module’s frame: the Terminals on its edge are its pins.'));
    e.mode = 'inside';
    showLevel();
    return;
  }
  e.mode = 'face';
  panel.show(null);
  showLevel();
  faceEditor.show(block.props, block.ids, (id) => {
    const c = e.circuit.part(id);
    return c ? refText(c) : id;
  });
}

function setEditMode(mode: 'inside' | 'face') {
  const e = editing;
  if (!e || e.mode === mode) return;
  if (mode === 'face') showFace();
  else {
    faceEditor.hide();
    e.mode = 'inside';
    showLevel();
  }
  board.fitAll();
}

// The path bar: back, then the circuit and each block stepped into, the
// levels above clickable, and Edit module; while editing, what's being edited,
// its Inside | Face views (with the face's title spot and automatic layout),
// Cancel and Done.
function renderPath() {
  pathBar.hidden = !path.length && !editing;
  if (editing) {
    const block = blockAt(circuit, editing.block);
    const what = document.createElement('span');
    what.className = 'module-crumb';
    what.textContent = t('Editing {name}', { name: block ? `${refText(block)} ${editing.def.name}` : editing.def.name });
    const cancel = document.createElement('md-text-button');
    cancel.textContent = t('Cancel');
    cancel.addEventListener('click', () => finishEdit(false));
    const done = document.createElement('md-filled-button');
    done.innerHTML = `<md-icon slot="icon">check</md-icon>${t('Done')}`;
    done.addEventListener('click', () => finishEdit(true));
    const segments = (options: [string, string][], value: string, pick: (v: string) => void) => {
      const set = document.createElement('md-outlined-segmented-button-set');
      for (const [v, label] of options) {
        const b = document.createElement('md-outlined-segmented-button') as HTMLElement & { selected: boolean; label: string };
        b.dataset.value = v;
        b.label = t(label);
        b.selected = v === value;
        set.append(b);
      }
      set.addEventListener('segmented-button-set-selection', (ev) => {
        const { button, selected } = (ev as CustomEvent<{ button: HTMLElement; selected: boolean }>).detail;
        if (selected) pick(button.dataset.value!);
      });
      return set;
    };
    const views = segments([['inside', 'Inside'], ['face', 'Face']], editing.mode, (v) => setEditMode(v as 'inside' | 'face'));
    const extra: HTMLElement[] = [];
    if (editing.mode === 'face') {
      const title = segments([['top', 'Title on top'], ['centre', 'Title centred'], ['hidden', 'No title']], faceNow(editing)?.title ?? 'top', (v) => faceEditor.setTitle(v as TitleSpot));
      const auto = document.createElement('md-text-button');
      auto.textContent = t('Automatic layout');
      auto.addEventListener('click', () => {
        if (!editing) return;
        editing.face = null;
        showFace();
        history.changed();
      });
      extra.push(title, auto);
      // A selected display: the size it's mounted at.
      if (faceDisplay) {
        const sizes = segments(
          PANEL_SCALES.map((k): [string, string] => [String(k), `${Math.round(k * 100)} %`]),
          String(faceDisplay.s),
          (v) => faceEditor.setScale(Number(v)),
        );
        sizes.title = t('Size on the face');
        extra.push(sizes);
      }
    }
    pathBar.replaceChildren(what, views, ...extra, cancel, done);
    return;
  }
  if (!path.length) {
    pathBar.replaceChildren();
    return;
  }
  const back = document.createElement('md-icon-button');
  back.innerHTML = '<md-icon>arrow_back</md-icon>';
  back.title = t('Back (Esc)');
  back.addEventListener('click', () => leaveModule());
  const crumb = (text: string, levels: number) => {
    const el = document.createElement(levels ? 'button' : 'span');
    el.className = 'module-crumb';
    el.textContent = text;
    if (levels) el.addEventListener('click', () => leaveModule(levels));
    return el;
  };
  const items: HTMLElement[] = [crumb(t('Circuit'), path.length)];
  path.forEach(({ id }, k) => {
    const block = blockAt(circuit, id);
    const sep = document.createElement('span');
    sep.className = 'module-crumb-sep';
    sep.textContent = '›';
    const name = block ? `${refText(block)} ${(block.props as { title: string }).title}` : id;
    items.push(sep, crumb(name, path.length - 1 - k));
  });
  const edit = document.createElement('md-text-button');
  edit.innerHTML = `<md-icon slot="icon">edit</md-icon>${t('Edit module')}`;
  edit.addEventListener('click', () => editModule(path.at(-1)!.id));
  pathBar.replaceChildren(back, ...items, edit);
}

// Put a loaded (or empty) circuit on the board, with fresh simulation state.
// An opened one (file, example, link) is fitted in view unless Settings ask
// for the view saved with it; the autosave always comes back as it was left.
function loadCircuit(data: SavedCircuit, opened = false) {
  // Another circuit (new, opened, an example): the simulation stops first.
  controls.pause();
  leaveModules();
  circuit.load(data.parts, data.joints, data.wires, data.ambient, data.modules);
  engine.reset();
  scope.clear();
  const fit = opened && settings.openView === 'fit' && circuit.components.length > 0;
  if (data.view && !fit) board.setView(data.view);
  editor.reload();
  if (fit) board.fitAll();
  controls.showTime(engine.time);
  showAmbient();
  history.reset();
  // Settings may ask for an opened circuit to start running at once.
  if (opened && settings.autoRun && !controls.running) controls.toggle();
}

const files = createFileActions(byId('file-menu'), {
  circuit,
  getView: () => ({ x: board.view.x, y: board.view.y, scale: board.view.scale }),
  load: loadCircuit,
  report: showToast,
});

// Pick up where the last session left off.
const restored = files.restore();
if (restored) files.quietly(() => loadCircuit(restored));
else history.reset();
// In the desktop app, a circuit file it was started to open (asking first if
// that replaces one); otherwise the tour for newcomers or a tip of the day,
// unless turned off (here or in Settings).
const fromFile = files.openSystemFiles();
const tips = createTips(byId('tip-dialog'), settings);
settings.onChange(tips.sync);
const tour = createTour();
fromFile.then((opened) => {
  if (opened) return;
  if (newcomer) tour.start();
  else if (settings.tips) tips.show();
});
// Help in the rail: the keyboard shortcuts, the tour, a tip, About.
const about = byId<MdDialog>('about-dialog');
byId('help-about').addEventListener('click', () => about.show());
const shortcuts = createShortcuts(byId('shortcuts-dialog'));
const helpMenu = byId<MdMenu>('help-menu');
byId('rail-help').addEventListener('click', () => (helpMenu.open = !helpMenu.open));
byId('help-shortcuts').addEventListener('click', () => shortcuts.open());
byId('help-tour').addEventListener('click', () => tour.start());
byId('help-tip').addEventListener('click', () => tips.show());
byId('settings-tour').addEventListener('click', async () => {
  await byId<MdDialog>('settings-dialog').close();
  tour.start();
});
byId('settings-show-tip').addEventListener('click', async () => {
  await byId<MdDialog>('settings-dialog').close(); // one dialog at a time, as M3 asks
  tips.show();
});

// While running, simulated time advances at `speed` times real time. Edits are
// solved immediately even when paused, so readouts stay right, but nothing
// moves on: no heating, no AC, no current-flow animation. The flow dots move at
// a real-time pace whatever the speed, showing the current at that instant, so
// in slow motion AC can be watched swinging back and forth.
// The logo shows the state too: a shining wave while running, burnt brown
// while any part is burnt out. The wave takes 1.6 s at 1×, twice as fast for
// each 10× faster (0.2 s at 1000×) and twice as slow for each 10× slower.
// While burnt it's a button that replaces every burnt-out part; the
// simulation stays paused until run again.
const logo = byId<HTMLButtonElement>('logo');
logo.title = t('Replace burnt-out parts');
onLanguage(() => (logo.title = t('Replace burnt-out parts')));
logo.addEventListener('click', () => {
  const burnt = circuit.components.filter((c) => c.broken);
  for (const c of burnt) c.broken = false;
  for (const c of burnt) editor.refreshPart(c.id);
  panel.refresh();
  if (burnt.length) showToast(t('Replaced {parts}.', { parts: burnt.map(refText).join(', ') }));
});
let waveSpeed = 0;
let last = performance.now();
requestAnimationFrame(function frame(now) {
  scope.draw(engine.time, controls.speed);
  // Sounders are heard only while the simulation runs (pausing silences them
  // without a door chime's closing dong).
  audio.play(controls.running && settings.sound ? sounds : new Map(), !controls.running || !settings.sound);
  logo.classList.toggle('running', controls.running);
  const burnt = circuit.components.some((c) => c.broken);
  logo.classList.toggle('burnt', burnt);
  if (logo.disabled === burnt) {
    logo.disabled = !burnt;
    if (burnt) logo.removeAttribute('aria-hidden');
    else logo.setAttribute('aria-hidden', 'true');
  }
  if (controls.speed !== waveSpeed) {
    waveSpeed = controls.speed;
    logo.style.setProperty('--wave-duration', `${1.6 * 2 ** -Math.log10(waveSpeed)}s`);
  }
  const dt = Math.min(now - last, 100) / 1000;
  if (controls.running) {
    const failed = engine.advance(dt * controls.speed);
    // Mark every casualty before redrawing, since redrawing re-solves.
    for (const id of failed) circuit.part(id)!.broken = true;
    for (const id of failed) editor.burn(id);
    if (failed.length) {
      panel.refresh();
      // Stop at the failure, so it can be looked at before anything else goes.
      controls.pause();
      const parts = failed.map((id) => circuit.part(id)!);
      const what = t(parts.length === 1 ? (MODELS[parts[0].type].failure?.label ?? 'failed') : 'failed');
      showToast(t('{parts} {what}. Simulation paused.', { parts: parts.map(refText).join(', '), what }));
    }
    if (engine.dynamic || engine.heating || engine.draining || failed.length) showResults();
    editor.animate(dt);
    controls.showTime(engine.time);
  }
  last = now;
  requestAnimationFrame(frame);
});

// The navigation rail (M3) down the left edge: the menu button, then File (a
// menu of New / Open / Save / Print), Scope and Thermal. Scope and Thermal
// show their active indicator while their view is on; on phones the rail is
// a navigation bar along the bottom (CSS).
const scopeSection = byId('scope');
const thermalLegend = byId('thermal-legend');
const railScope = byId('rail-scope');
const railThermal = byId('rail-thermal');

function toggleScope() {
  scope.toggle();
  syncViews();
}

// The thermal view colours every part that heats up by how close it runs to
// failing, with a legend on the board.
function toggleThermal() {
  thermalLegend.hidden = !thermalLegend.hidden;
  board.svg.classList.toggle('thermal', !thermalLegend.hidden);
  if (!thermalLegend.hidden) airflow.update(engine);
  syncViews();
}

// The rail's indicators follow what's showing (the scope can also be closed
// from its own bar).
function syncViews() {
  for (const [item, on] of [
    [railScope, !scopeSection.hidden],
    [railThermal, !thermalLegend.hidden],
  ] as const) {
    item.setAttribute('aria-pressed', String(on));
    item.classList.toggle('selected', on);
  }
}

// The rail collapses to icons (80px) or expands to icons and labels side by
// side (220px), from the menu button at its top; the choice is remembered.
const rail = byId('rail');
const railToggle = byId('rail-toggle');
const RAIL_KEY = 'ampage:rail-expanded';

function setRail(expanded: boolean) {
  rail.classList.toggle('expanded', expanded);
  railToggle.setAttribute('aria-expanded', String(expanded));
  railToggle.querySelector('md-icon')!.textContent = expanded ? 'menu_open' : 'menu';
  railToggle.title = railToggle.ariaLabel = t(expanded ? 'Collapse navigation' : 'Expand navigation');
  try {
    localStorage.setItem(RAIL_KEY, String(expanded));
  } catch {
    // no storage here; it just won't be remembered
  }
}

railToggle.addEventListener('click', () => setRail(!rail.classList.contains('expanded')));

railScope.addEventListener('click', toggleScope);
byId('rail-settings').addEventListener('click', () => settings.open());
const gallery = createGallery(byId('gallery-dialog'), files.openText);
byId('rail-examples').addEventListener('click', () => gallery.open());
railThermal.addEventListener('click', toggleThermal);
scopeSection.querySelector('.scope-close')!.addEventListener('click', syncViews);
const fileMenu = byId<MdMenu>('file-menu');
byId('rail-file').addEventListener('click', () => (fileMenu.open = !fileMenu.open));

let railExpanded = false;
try {
  railExpanded = localStorage.getItem(RAIL_KEY) === 'true';
} catch {
  // no storage: start collapsed
}
setRail(railExpanded);
onLanguage(() => setRail(rail.classList.contains('expanded')));

// Printing (⌘P, or the Print button): our own dialog with a preview.
const printer = createPrint(byId('print-dialog'), {
  circuit,
  board: board.svg,
  scope: byId('scope'),
  scopeSnapshot: scope.snapshot,
  title: files.title,
  scopeShowing: () => !byId('scope').hidden,
  thermalShowing: () => !thermalLegend.hidden,
});
byId('file-print').addEventListener('click', () => printer.open());
byId('file-export-png').addEventListener('click', () => printer.exportImage('png'));
byId('file-export-svg').addEventListener('click', () => printer.exportImage('svg'));
const backdrop = createBackdrop(byId('backdrop-dialog'), board);
byId('file-backdrop').addEventListener('click', () => backdrop.open());

// The drawing standard or the decimal mark changed (Settings): every symbol,
// reference and value again.
onNorm(() => {
  editor.reload();
  showResults();
  showAmbient();
});
onDecimalMark(() => {
  editor.reload();
  showResults();
});

// Settings the board and simulation follow as they change: the grid, the
// current-flow dots, heat haze, whether parts burn out, temperature effects (which also
// show or hide the Thermal panel's ambient slider, and re-solve when they
// change). (Flow direction and sound are read as results are shown.)
function applyBoardSettings() {
  board.svg.dataset.grid = settings.grid;
  board.svg.classList.toggle('no-flow', !settings.flowDots);
  board.svg.classList.toggle('heat-haze', settings.heatHaze);
  engine.burnOut = settings.burnOut;
  ambientSlider.closest<HTMLElement>('.thermal-ambient')!.hidden = !settings.temperatures;
  if (engine.temperatures === settings.temperatures) return;
  engine.temperatures = settings.temperatures;
  if (nets) engine.rebuild(nets);
}
applyBoardSettings();
settings.onChange(() => {
  applyBoardSettings();
  showResults();
});

// Zoom buttons and shortcuts at the board's bottom-left corner.
const zoom = createZoom(byId('zoom'), board);

// The actions the search finds and runs (the command palette: ⌘K with the
// parts, ⌘⇧P on their own). See src/commands.ts.
const press = (id: string) => () => byId(id).click();
// The middle of the board in view, in world units (where a pasted copy goes).
const viewCentre = () => {
  const r = board.svg.getBoundingClientRect();
  return board.screenToWorld(r.left + r.width / 2, r.top + r.height / 2);
};
const enabled = (id: string) => () => !byId<HTMLElement & { disabled: boolean }>(id).disabled;
registerCommands([
  { label: 'Run or pause the simulation', icon: 'play_arrow', keys: ['Space'], words: 'start stop', run: () => controls.toggle() },
  { label: 'Slower', icon: 'fast_rewind', keys: ['←'], words: 'speed', run: press('slower') },
  { label: 'Faster', icon: 'fast_forward', keys: ['→'], words: 'speed', run: press('faster') },
  { label: 'Undo', icon: 'undo', keys: ['Mod', 'Z'], available: enabled('undo'), run: press('undo') },
  { label: 'Redo', icon: 'redo', keys: ['Mod', 'Shift', 'Z'], available: enabled('redo'), run: press('redo') },
  { label: 'Rotate the selection', icon: 'autorenew', keys: ['R'], words: 'turn', available: editor.hasSelection, run: () => editor.rotate() },
  { label: 'Copy', icon: 'content_copy', keys: ['Mod', 'C'], available: editor.canCopy, run: () => editor.copy() },
  { label: 'Cut', icon: 'content_cut', keys: ['Mod', 'X'], available: editor.canCopy, run: () => editor.cut() },
  { label: 'Paste', icon: 'content_paste', keys: ['Mod', 'V'], available: editor.canPaste, run: () => editor.paste(viewCentre()) },
  { label: 'Duplicate', icon: 'library_add', keys: ['Mod', 'D'], available: editor.canCopy, run: () => editor.duplicate() },
  { label: 'Delete the selection', icon: 'delete', keys: ['Del'], words: 'remove', available: editor.hasSelection, run: () => editor.deleteSelected() },
  { label: 'Fit the circuit in view', icon: 'fit_screen', keys: ['F'], words: 'zoom', run: () => zoom.fit() },
  { label: 'Zoom in', icon: 'zoom_in', keys: ['Mod', '='], run: () => board.zoomStep(1) },
  { label: 'Zoom out', icon: 'zoom_out', keys: ['Mod', '−'], run: () => board.zoomStep(-1) },
  { label: 'Zoom to 100 %', icon: 'zoom_in', keys: ['Mod', '0'], run: () => board.zoomTo(1) },
  { label: 'Thermal view', icon: 'thermostat', words: 'heat temperature ambient', run: toggleThermal },
  { label: 'Oscilloscope', icon: 'monitoring', words: 'scope probe', run: toggleScope },
  { label: 'Show or hide values on hover', icon: 'arrow_selector_tool', keys: ['I'], words: 'readout tooltip', run: () => (settings.readout = !settings.readout) },
  { label: 'New circuit', icon: 'note_add', run: press('file-new') },
  { label: 'Open…', icon: 'folder_open', keys: ['Mod', 'O'], run: press('file-open') },
  { label: 'Save', icon: 'save', keys: ['Mod', 'S'], run: press('file-save') },
  { label: 'Print…', icon: 'print', keys: ['Mod', 'P'], run: () => printer.open() },
  { label: 'Export as PNG', icon: 'image', words: 'picture', run: () => printer.exportImage('png') },
  { label: 'Export as SVG', icon: 'draw', words: 'vector', run: () => printer.exportImage('svg') },
  { label: 'Background image…', icon: 'wallpaper', words: 'trace', run: () => backdrop.open() },
  { label: 'Examples', icon: 'school', words: 'gallery', run: () => gallery.open() },
  { label: 'Settings', icon: 'settings', words: 'preferences options', run: () => settings.open() },
  { label: 'Keyboard shortcuts', icon: 'keyboard', keys: ['?'], words: 'keys help', run: () => shortcuts.open() },
  { label: 'Take the tour', icon: 'tour', words: 'help', run: () => tour.start() },
  { label: 'Show a tip', icon: 'lightbulb', words: 'help', run: () => tips.show() },
  { label: 'About Ampage', icon: 'help', words: 'version', run: () => about.show() },
]);

// Everything is set up: show the app (index.html kept it hidden behind its
// loading screen) once its fonts are in, as icons read as words before the
// icon font arrives; at most two seconds, whatever happens to the fonts.
Promise.race([document.fonts.ready, new Promise((done) => setTimeout(done, 2000))]).then(() => {
  document.documentElement.classList.add('ready');
  const splash = document.getElementById('splash');
  splash?.addEventListener('transitionend', () => splash.remove(), { once: true });
  setTimeout(() => splash?.remove(), 500); // in case the transition never runs
});


// Anonymous usage counts (the published web version only; see src/analytics.ts),
// as Settings say: the visit, and which language and drawing standard are in use.
byId('settings-dialog').querySelector<HTMLElement>('.settings-analytics')!.hidden = !analyticsAvailable;
setAnalytics(settings.analytics);
settings.onChange(() => setAnalytics(settings.analytics));
track(`language/${language()}`);
track(`norm/${settings.norm}`);
