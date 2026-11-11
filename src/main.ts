import './material.ts';
import { createBoard } from './board.ts';
import { createControls } from './controls.ts';
import { createCircuit } from './model.ts';
import { createEditor, type Live } from './editor.ts';
import { createFileActions } from './files.ts';
import { createMenu } from './menu.ts';
import type { Nets } from './nets.ts';
import { createPalette } from './palette.ts';
import { createPanel } from './panel.ts';
import { createReadout } from './readout.ts';
import { createSearch } from './search.ts';
import { createEngine } from './sim/engine.ts';
import { wireCurrents } from './sim/flow.ts';
import { MODELS } from './sim/models.ts';
import type { SavedCircuit } from './persist.ts';

const MOD = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl+';

// An element index.html must have.
function byId<T extends Element = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`index.html is missing #${id}`);
  return el as unknown as T;
}

const board = createBoard(byId<SVGSVGElement>('board'));
const circuit = createCircuit();
const engine = createEngine(circuit);
let nets: Nets | null = null;
let currents = new Map<string, number>(); // wire id -> amps
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
  for (const c of circuit.components) {
    const { brightness, thermal, reading, failure } = MODELS[c.type];
    const r = engine.results.get(c.id);
    live.set(c.id, {
      reading: reading && (c.broken ? (failure?.display ?? '–') : r ? reading(r, c.props) : '–'),
      glow: r && brightness ? brightness(r, c.props) : 0,
      heat: r && thermal && !c.broken ? Math.min(1, Math.max(0, (r.heat - 1) / (thermal.limit - 1))) : 0,
      level: r?.level,
    });
  }
  editor.showLive(live, smooth);
  panel.showLive(live);
  currents = nets ? wireCurrents(circuit, nets, engine.results) : new Map();
  editor.setFlow(currents, smooth);
  readout.refresh();
}

const editor = createEditor(board, circuit, {
  onSelect: (ids) => panel.show(ids.length === 1 ? ids[0] : null),
  onChange: (next) => {
    nets = next;
    engine.rebuild(nets);
    showResults();
    files.changed();
  },
  onPropChange: () => panel.refresh(),
  onContextMenu: (x, y, at) =>
    menu.open(x, y, [
      { label: 'Cut', icon: 'content_cut', shortcut: `${MOD}X`, enabled: editor.canCopy(), action: editor.cut },
      { label: 'Copy', icon: 'content_copy', shortcut: `${MOD}C`, enabled: editor.canCopy(), action: editor.copy },
      { label: 'Paste', icon: 'content_paste', shortcut: `${MOD}V`, enabled: editor.canPaste(), action: () => editor.paste(at) },
      { label: 'Duplicate', icon: 'library_add', shortcut: `${MOD}D`, enabled: editor.canCopy(), action: editor.duplicate },
      'separator',
      { label: 'Delete', icon: 'delete', shortcut: 'Del', enabled: editor.hasSelection(), danger: true, action: editor.deleteSelected },
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
function loadCircuit(data: SavedCircuit) {
  circuit.load(data.parts, data.joints, data.wires);
  engine.reset();
  if (data.view) board.setView(data.view);
  editor.reload();
  controls.showTime(engine.time);
}

const files = createFileActions(byId('file-actions'), {
  circuit,
  getView: () => ({ x: board.view.x, y: board.view.y, scale: board.view.scale }),
  load: loadCircuit,
  report: showToast,
});

// Pick up where the last session left off.
const restored = files.restore();
if (restored) loadCircuit(restored);

// While running, simulated time advances at `speed` times real time. Edits are
// solved immediately even when paused, so readouts stay right, but nothing
// moves on: no heating, no AC, no current-flow animation. The flow dots move at
// a real-time pace whatever the speed, showing the current at that instant, so
// in slow motion AC can be watched swinging back and forth.
// The logo shows the state too: a shining wave while running, burnt brown
// while any part is burnt out. The wave takes 1.6 s at 1×, twice as fast for
// each 10× faster (0.2 s at 1000×) and twice as slow for each 10× slower.
const logo = byId('logo');
let waveSpeed = 0;
let last = performance.now();
requestAnimationFrame(function frame(now) {
  logo.classList.toggle('running', controls.running);
  logo.classList.toggle('burnt', circuit.components.some((c) => c.broken));
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
      const what = parts.length === 1 ? (MODELS[parts[0].type].failure?.label ?? 'failed') : 'failed';
      showToast(`${parts.map((p) => `-${p.ref}`).join(', ')} ${what}. Simulation paused.`);
    }
    if (engine.dynamic || engine.heating || engine.draining || failed.length) showResults();
    editor.animate(dt);
    controls.showTime(engine.time);
  }
  last = now;
  requestAnimationFrame(frame);
});
