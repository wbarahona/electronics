import './material.js';
import { createBoard } from './board.js';
import { createControls } from './controls.js';
import { createCircuit } from './model.js';
import { createEditor } from './editor.js';
import { createMenu } from './menu.js';
import { createPalette } from './palette.js';
import { createPanel } from './panel.js';
import { createReadout } from './readout.js';
import { createEngine } from './sim/engine.js';
import { wireCurrents } from './sim/flow.js';
import { MODELS } from './sim/models.js';

const MOD = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl+';

const board = createBoard(document.getElementById('board'));
const circuit = createCircuit();
const engine = createEngine(circuit);
let nets = null;
let currents = new Map(); // wire id -> amps
const readout = createReadout(
  document.getElementById('readout'),
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
  const live = new Map();
  for (const c of circuit.components) {
    const { brightness, thermal } = MODELS[c.type];
    const r = engine.results.get(c.id);
    live.set(c.id, {
      glow: r && brightness ? brightness(r, c.props) : 0,
      heat: r && thermal && !c.broken ? Math.min(1, Math.max(0, (r.heat - 1) / (thermal.limit - 1))) : 0,
    });
  }
  editor.showLive(live, smooth);
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
const menu = createMenu(document.getElementById('menu'), document.getElementById('menu-anchor'));
const panel = createPanel(document.getElementById('props'), circuit, editor);
createPalette(document.getElementById('palette'), board, editor);
const controls = createControls(document.getElementById('sim-controls'));

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
    for (const id of failed) circuit.get(id).broken = true;
    for (const id of failed) editor.burn(id);
    if (failed.length) panel.refresh();
    if (engine.dynamic || engine.heating || failed.length) showResults();
    editor.animate(dt);
    controls.showTime(engine.time);
  }
  last = now;
  requestAnimationFrame(frame);
});
