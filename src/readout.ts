import { PARTS } from './components.ts';
import type { Circuit } from './model.ts';
import type { Engine } from './sim/engine.ts';
import { MODELS, type Lines } from './sim/models.ts';
import { isWire, type Part, type Wire } from './types.ts';
import { formatSI } from './units.ts';

// Tooltip with the live simulation values of the part or wire under the
// pointer. `wireCurrent(id)` gives a wire's current in amps.
export function createReadout(
  el: HTMLElement,
  svg: SVGSVGElement,
  circuit: Circuit,
  engine: Engine,
  wireCurrent: (id: string) => number | undefined,
) {
  let hover: string | null = null; // part or wire id
  let pointer = { x: 0, y: 0 };

  function partLines(c: Part): Lines {
    const r = engine.results.get(c.id);
    const model = MODELS[c.type];
    const lines: Lines = [[`-${c.ref}`, PARTS[c.type].name]];
    lines.push(...(r ? model.readout(r, c.props) : ([['', engine.error ?? 'No result']] as Lines)));
    // Load against the rating, unless brightness already says the same thing.
    if (r && model.thermal && !model.brightness && !c.broken) {
      lines.push(['Load', `${Math.round(r.load * 100)} %`]);
    }
    if (c.broken && model.failure) lines.push(['Status', model.failure.label]);
    return lines;
  }

  function wireLines(w: Wire): Lines {
    const i = Math.abs(wireCurrent(w.id) ?? 0);
    return [['Wire', ''], ['Current', formatSI(i < 1e-9 ? 0 : i, 'A')]];
  }

  function refresh() {
    const item = hover && circuit.get(hover);
    if (!item) {
      el.hidden = true;
      return;
    }
    if (!isWire(item) && !('type' in item)) {
      el.hidden = true;
      return;
    }
    const lines = isWire(item) ? wireLines(item) : partLines(item);
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
    hover = (e.target as Element).closest<SVGElement>('.part, .wire')?.dataset.id ?? null;
    pointer = { x: e.clientX, y: e.clientY };
    refresh();
  });

  svg.addEventListener('pointerleave', () => {
    hover = null;
    refresh();
  });

  return { refresh };
}
