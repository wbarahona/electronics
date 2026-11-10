import { PARTS } from './components.js';
import { MODELS } from './sim/models.js';
import { formatSI } from './units.js';

// Tooltip with the live simulation values of the part or wire under the
// pointer. `wireCurrent(id)` gives a wire's current in amps.
export function createReadout(el, svg, circuit, engine, wireCurrent) {
  let hover = null; // part or wire id
  let pointer = { x: 0, y: 0 };

  function partLines(c) {
    const r = engine.results.get(c.id);
    const model = MODELS[c.type];
    const lines = [[`-${c.ref}`, PARTS[c.type].name]];
    lines.push(...(r ? model.readout(r, c.props) : [['', engine.error ?? 'No result']]));
    // Load against the rating, unless brightness already says the same thing.
    if (r && model.thermal && !model.brightness && !c.broken) {
      lines.push(['Load', `${Math.round(r.load * 100)} %`]);
    }
    if (c.broken) lines.push(['Status', model.failure.label]);
    return lines;
  }

  function wireLines(w) {
    const i = Math.abs(wireCurrent(w.id) ?? 0);
    return [['Wire', ''], ['Current', formatSI(i < 1e-9 ? 0 : i, 'A')]];
  }

  function refresh() {
    const item = hover && circuit.get(hover);
    if (!item) {
      el.hidden = true;
      return;
    }
    const lines = 'from' in item ? wireLines(item) : partLines(item);
    el.replaceChildren(
      ...lines.map(([label, value]) => {
        const row = document.createElement('div');
        const name = document.createElement('span');
        const text = document.createElement('b');
        name.textContent = label;
        text.textContent = value;
        row.append(name, text);
        return row;
      }),
    );
    el.style.left = `${pointer.x + 14}px`;
    el.style.top = `${pointer.y + 14}px`;
    el.hidden = false;
  }

  svg.addEventListener('pointermove', (e) => {
    hover = e.target.closest?.('.part, .wire')?.dataset.id ?? null;
    pointer = { x: e.clientX, y: e.clientY };
    refresh();
  });

  svg.addEventListener('pointerleave', () => {
    hover = null;
    refresh();
  });

  return { refresh };
}
