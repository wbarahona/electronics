import type { MdMenu } from '@material/web/menu/menu.js';
import './material.ts';
import { createBoard } from './board.ts';
import { createAudio } from './audio.ts';
import { createControls } from './controls.ts';
import { createCircuit } from './model.ts';
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
import { createZoom } from './zoom.ts';
import { onLanguage, t } from './i18n/index.ts';
import { createEngine } from './sim/engine.ts';
import { wireCurrents } from './sim/flow.ts';
import { MODELS, type Sound } from './sim/models.ts';
import { parse, serialize, type SavedCircuit } from './persist.ts';

const MOD = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl+';

// An element index.html must have.
function byId<T extends Element = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`index.html is missing #${id}`);
  return el as unknown as T;
}

// Settings first: the theme colours everything else, and the language
// translates index.html before anything is added to it.
const settings = createSettings(byId('settings-dialog'));

const board = createBoard(byId<SVGSVGElement>('board'));
const circuit = createCircuit();
const engine = createEngine(circuit);
let nets: Nets | null = null;
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
  circuit,
  engine,
  (id) => currents.get(id),
);

// Push the latest simulation results to the screen: how brightly each part
// shines, how close each is to failing (0 at its rating, 1 at its limit), and
// the current along every wire. While running, light and flow ease toward the
// new values (see editor.animate); when paused they jump straight there.
function showResults() {
  const smooth = controls.running;
  const live: Live = new Map();
  sounds = new Map();
  for (const c of circuit.components) {
    const { brightness, thermal, reading, failure, active, segments, light, sound, needle } = MODELS[c.type];
    const r = engine.results.get(c.id);
    const tone = r && sound && !c.broken ? sound(r, c.props) : null;
    if (tone) sounds.set(c.id, tone);
    live.set(c.id, {
      reading: reading && (c.broken ? (failure?.display ?? '–') : r ? reading(r, c.props) : '–'),
      glow: r && brightness ? brightness(r, c.props) : 0,
      heat: r && thermal && !c.broken ? Math.min(1, Math.max(0, (r.heat - 1) / (thermal.limit - 1))) : 0,
      temp: thermal ? (c.broken ? 1 : (r?.heat ?? 0) / thermal.limit) : undefined,
      needle: r && needle && !c.broken ? needle(r, c.props) : undefined,
      level: r?.level,
      active: r && active ? !c.broken && active(r) : undefined,
      segments: r && segments ? (c.broken ? [] : segments(r, c.props)) : undefined,
      light: r && light ? light(r, c.props).map((x) => (c.broken ? 0 : x)) : undefined,
    });
  }
  editor.showLive(live, smooth);
  panel.showLive(live);
  currents = nets ? wireCurrents(circuit, nets, engine.results) : new Map();
  editor.setFlow(currents, smooth);
  readout.refresh();
}

// Undo / redo: the circuit captured whole after each edit, restored in place
// (the simulation carries on; only a new or opened circuit resets it).
const history = createHistory(byId('history-actions'), {
  capture: () => JSON.stringify(serialize(circuit)),
  restore(snapshot) {
    const data = parse(snapshot);
    circuit.load(data.parts, data.joints, data.wires);
    editor.reload();
  },
});

const editor = createEditor(board, circuit, {
  onSelect: (ids) => panel.show(ids.length === 1 ? ids[0] : null),
  onChange: (next) => {
    nets = next;
    findProbes();
    engine.rebuild(nets);
    showResults();
    files.changed();
    history.changed();
  },
  onPropChange: () => panel.refresh(),
  onContextMenu: (x, y, at) =>
    menu.open(x, y, [
      { label: t('Cut'), icon: 'content_cut', shortcut: `${MOD}X`, enabled: editor.canCopy(), action: editor.cut },
      { label: t('Copy'), icon: 'content_copy', shortcut: `${MOD}C`, enabled: editor.canCopy(), action: editor.copy },
      { label: t('Paste'), icon: 'content_paste', shortcut: `${MOD}V`, enabled: editor.canPaste(), action: () => editor.paste(at) },
      { label: t('Duplicate'), icon: 'library_add', shortcut: `${MOD}D`, enabled: editor.canCopy(), action: editor.duplicate },
      'separator',
      { label: t('Delete'), icon: 'delete', shortcut: t('Del'), enabled: editor.hasSelection(), danger: true, action: editor.deleteSelected },
    ]),
});
const menu = createMenu(byId('menu'), byId('menu-anchor'));
const panel = createPanel(byId('props'), circuit, editor);
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

// Put a loaded (or empty) circuit on the board, with fresh simulation state.
// An opened one (file, example, link) is fitted in view unless Settings ask
// for the view saved with it; the autosave always comes back as it was left.
function loadCircuit(data: SavedCircuit, opened = false) {
  circuit.load(data.parts, data.joints, data.wires);
  engine.reset();
  scope.clear();
  const fit = opened && settings.openView === 'fit' && circuit.components.length > 0;
  if (data.view && !fit) board.setView(data.view);
  editor.reload();
  if (fit) board.fitAll();
  controls.showTime(engine.time);
  history.reset();
}

const files = createFileActions(byId('file-menu'), {
  circuit,
  getView: () => ({ x: board.view.x, y: board.view.y, scale: board.view.scale }),
  load: loadCircuit,
  report: showToast,
});

// Pick up where the last session left off.
const restored = files.restore();
if (restored) loadCircuit(restored);
else history.reset();
// Opened from a shared link: its circuit (asking first if that replaces one).
files.openLink();

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
  if (burnt.length) showToast(t('Replaced {parts}.', { parts: burnt.map((c) => `-${c.ref}`).join(', ') }));
});
let waveSpeed = 0;
let last = performance.now();
requestAnimationFrame(function frame(now) {
  scope.draw(engine.time, controls.speed);
  // Sounders are heard only while the simulation runs (pausing silences them
  // without a door chime's closing dong).
  audio.play(controls.running ? sounds : new Map(), !controls.running);
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
      showToast(t('{parts} {what}. Simulation paused.', { parts: parts.map((p) => `-${p.ref}`).join(', '), what }));
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

// Zoom buttons and shortcuts at the board's bottom-left corner.
createZoom(byId('zoom'), board);
