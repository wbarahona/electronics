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
import { onLanguage, t } from './i18n/index.ts';
import { onNorm, refText } from './norm.ts';
import { fromShown, onDecimalMark, shownUnit, toShown } from './units.ts';
import { createEngine } from './sim/engine.ts';
import { wireCurrents } from './sim/flow.ts';
import { createAirflow } from './airflow.ts';
import { MODELS, type Result, type Sound, type Thermal } from './sim/models.ts';
import { parse, serialize, type SavedCircuit, type View } from './persist.ts';
import { blockAt, insideOf } from './modules.ts';

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
  for (const c of shown.components) {
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
  capture: () => JSON.stringify(serialize(circuit)),
  restore(snapshot) {
    const data = parse(snapshot);
    leaveModules();
    circuit.load(data.parts, data.joints, data.wires, data.ambient, data.modules);
    editor.reload();
    showAmbient();
  },
});

const editor = createEditor(board, shown, {
  // (Inside a module the parts are looked at, not set: no panel.)
  onSelect: (ids) => panel.show(ids.length === 1 && !path.length ? ids[0] : null),
  onChange: (next) => {
    nets = next;
    airflow.reset();
    findProbes();
    engine.rebuild(nets);
    showResults();
    files.changed();
    history.changed();
  },
  onPropChange: () => panel.refresh(),
  onEnterModule: enterModule,
  onLeaveModule: () => leaveModule(),
  onContextMenu: (x, y, at) =>
    menu.open(x, y, [
      { label: t('Cut'), icon: 'content_cut', shortcut: `${MOD}X`, enabled: editor.canCopy() && !path.length, action: editor.cut },
      { label: t('Copy'), icon: 'content_copy', shortcut: `${MOD}C`, enabled: editor.canCopy(), action: editor.copy },
      { label: t('Paste'), icon: 'content_paste', shortcut: `${MOD}V`, enabled: editor.canPaste() && !path.length, action: () => editor.paste(at) },
      { label: t('Duplicate'), icon: 'library_add', shortcut: `${MOD}D`, enabled: editor.canCopy() && !path.length, action: editor.duplicate },
      { label: t('Rotate'), icon: 'rotate_right', shortcut: 'R', enabled: editor.hasSelection() && !path.length, action: editor.rotate },
      ...(editor.canSelectContents() && !path.length
        ? [
            { label: t('Select contents'), icon: 'select_all', enabled: true, action: editor.selectContents },
            { label: t('Make module'), icon: 'category', enabled: true, action: makeModule },
          ]
        : []),
      'separator',
      { label: t('Delete'), icon: 'delete', shortcut: MOD === '⌘' ? '⌘⌫' : t('Del'), enabled: editor.hasSelection() && !path.length, danger: true, action: editor.deleteSelected },
    ]),
}, { root: circuit, locked: () => path.length > 0 });
const menu = createMenu(byId('menu'), byId('menu-anchor'));
const panel = createPanel(byId('props'), shown, editor, makeModule);

// Make the selected frame a module, saying why not or what had to give.
function makeModule() {
  const said = editor.makeModule();
  if (said) showToast(t(said.message, { count: String(said.count ?? 0) }));
}
const palette = createPalette(byId('palette'), byId('palette-tray'), board, editor);
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

function showLevel() {
  const id = path.at(-1)?.id;
  shownCircuit = (id && insideOf(circuit, id)) || circuit;
  files.quietly(() => editor.reload());
  renderPath();
}

function enterModule(id: string) {
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
  if (!path.length) return;
  let view: View | undefined;
  for (let k = 0; k < levels && path.length; k++) view = path.pop()!.view;
  showLevel();
  if (view) board.setView(view);
}

// Back to the whole circuit at once, as it's about to be replaced (a file
// opened, an undo); the caller redraws.
function leaveModules() {
  if (!path.length) return;
  board.setView(path[0].view);
  path.length = 0;
  shownCircuit = circuit;
  renderPath();
}

// The path bar: back, then the circuit and each block stepped into, the
// levels above clickable.
function renderPath() {
  pathBar.hidden = !path.length;
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
  pathBar.replaceChildren(back, ...items);
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

