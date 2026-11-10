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
    const { brightness, thermal } = MODELS[c.type];
    const r = engine.results.get(c.id);
    live.set(c.id, {
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
createPalette(byId('palette'), byId('palette-tray'), board, editor);
const controls = createControls(byId('sim-controls'));

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
let last = performance.now();
requestAnimationFrame(function frame(now) {
  const dt = Math.min(now - last, 100) / 1000;
  if (controls.running) {
    const failed = engine.advance(dt * controls.speed);
    // Mark every casualty before redrawing, since redrawing re-solves.
    for (const id of failed) circuit.part(id)!.broken = true;
    for (const id of failed) editor.burn(id);
    if (failed.length) panel.refresh();
    if (engine.dynamic || engine.heating || engine.draining || failed.length) showResults();
    editor.animate(dt);
    controls.showTime(engine.time);
  }
  last = now;
  requestAnimationFrame(frame);
});
