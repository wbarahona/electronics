import type { MdDialog } from '@material/web/dialog/dialog.js';
import { PARTS, tagOf } from './components.ts';
import { lightTokens } from './theme.ts';
import type { Circuit } from './model.ts';

const SVG_NS = 'http://www.w3.org/2000/svg';
const MARGIN = 40; // world units of space around the circuit

// Sheet sizes in mm (portrait), and the preview's pixels per mm.
const PAPER = { A4: [210, 297], Letter: [216, 279] } as const;
type Paper = keyof typeof PAPER;
const PX_PER_MM = 96 / 25.4; // CSS pixels
const SCOPE_PRINT = [720, 200]; // CSS px of the scope snapshot (scaled to fit on paper)

export interface PrintOptions {
  title: string;
  paper: Paper;
  landscape: boolean;
  grid: boolean;
  values: boolean;
  flow: boolean;
  thermal: boolean;
  scope: boolean;
  parts: boolean;
}

export interface PrintSources {
  circuit: Circuit;
  board: SVGSVGElement; // the live board, copied for the schematic
  scope: HTMLElement; // the oscilloscope section (for its settings caption)
  scopeSnapshot: (width: number, height: number) => string; // its screen in light colours
  title: () => string; // the circuit's name, the default title
  scopeShowing: () => boolean;
  thermalShowing: () => boolean;
}

// Printing: ⌘P / Ctrl+P or the Print button open our own M3 dialog (with a
// live preview) instead of the browser's; its Print button lays the sheet
// out for real and hands it to the browser, where the printer (or PDF) is
// chosen. The sheet: a title block, the schematic fitted to the page, and,
// as chosen, a snapshot of the oscilloscope, the thermal view's colours and
// legend, and a parts list on a page of its own.
export function createPrint(dialog: MdDialog, src: PrintSources) {
  const form = dialog.querySelector('form')!;
  const preview = dialog.querySelector<HTMLElement>('.print-preview')!;
  const field = <T extends Element>(name: string) => form.querySelector<T & { value: string; checked: boolean }>(`[name="${name}"]`)!;
  const pageStyle = document.head.appendChild(document.createElement('style'));

  function options(): PrintOptions {
    return {
      title: field('title').value.trim() || 'Untitled circuit',
      paper: field('paper').value as Paper,
      landscape: field('orientation').value === 'landscape',
      grid: field('grid').checked,
      values: field('values').checked,
      flow: field('flow').checked,
      thermal: field('thermal').checked,
      scope: field('scope').checked,
      parts: field('parts').checked,
    };
  }

  // The schematic: a copy of the board's drawing, cropped to the circuit.
  function schematic(o: PrintOptions): SVGSVGElement {
    const world = src.board.querySelector<SVGGElement>('#world')!;
    const box = world.getBBox();
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.classList.add('print-board');
    svg.classList.toggle('thermal', o.thermal);
    svg.classList.toggle('no-values', !o.values);
    svg.classList.toggle('no-flow', !o.flow);
    const [x, y, w, h] = [box.x - MARGIN, box.y - MARGIN, box.width + 2 * MARGIN, box.height + 2 * MARGIN];
    svg.setAttribute('viewBox', `${x} ${y} ${w} ${h}`);
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    // A light grid of its own (the board's follows the theme and zoom); the
    // glows' gradients are found in the board's defs.
    if (o.grid) {
      svg.innerHTML = `
        <defs>
          <pattern id="print-grid-minor" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#e6e8ef" stroke-width="0.6" />
          </pattern>
          <pattern id="print-grid-major" width="100" height="100" patternUnits="userSpaceOnUse">
            <rect width="100" height="100" fill="url(#print-grid-minor)" />
            <path d="M 100 0 L 0 0 0 100" fill="none" stroke="#c9cdd8" stroke-width="0.8" />
          </pattern>
        </defs>
        <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#print-grid-major)" />`;
    }
    const copy = world.cloneNode(true) as SVGGElement;
    copy.removeAttribute('id');
    for (const el of copy.querySelectorAll('.selected, .net-hot, .lit')) el.classList.remove('selected', 'net-hot', 'lit');
    for (const el of copy.querySelectorAll('.ghost, .marquee, .smoke')) el.remove();
    svg.append(copy);
    return svg;
  }

  function partsList(): HTMLElement {
    const table = document.createElement('table');
    table.className = 'print-parts';
    const parts = [...src.circuit.components]
      .filter((c) => !PARTS[c.type].noLabel)
      .sort((a, b) => a.ref.localeCompare(b.ref, undefined, { numeric: true }));
    table.innerHTML = `
      <thead><tr><th>Ref.</th><th>Part</th><th>Value</th></tr></thead>
      <tbody>${parts
        .map((c) => `<tr><td>-${c.ref}</td><td>${PARTS[c.type].name}</td><td>${tagOf(c.type, c.props) ?? ''}</td></tr>`)
        .join('')}</tbody>`;
    return table;
  }

  // The whole printout: one page, plus one for the parts list if asked.
  function sheet(o: PrintOptions): HTMLElement {
    const root = document.createElement('div');
    root.className = 'print-sheet';
    // The chosen theme's light colours, whatever the screen's mode.
    for (const [name, value] of Object.entries(lightTokens())) root.style.setProperty(name, value);
    const page = document.createElement('section');
    page.className = 'print-page';
    const date = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
    page.innerHTML = `
      <header class="print-head">
        <div class="print-title"></div>
        <div class="print-meta">Ampage · ${date}</div>
      </header>`;
    page.querySelector('.print-title')!.textContent = o.title;
    const drawing = document.createElement('div');
    drawing.className = 'print-drawing';
    drawing.append(schematic(o));
    page.append(drawing);

    const extras: HTMLElement[] = [];
    if (o.scope) {
      const figure = document.createElement('figure');
      figure.className = 'print-scope';
      const img = new Image();
      img.src = src.scopeSnapshot(SCOPE_PRINT[0], SCOPE_PRINT[1]);
      const caption = document.createElement('figcaption');
      caption.textContent = ['Oscilloscope', ...[...src.scope.querySelectorAll('[data-channel]')].map((e) => e.textContent), src.scope.querySelector('.scope-time')!.textContent]
        .filter(Boolean)
        .join(' · ');
      figure.append(img, caption);
      extras.push(figure);
    }
    if (o.thermal) {
      const legend = document.createElement('div');
      legend.className = 'print-legend';
      legend.innerHTML = '<div>Thermal view</div><div class="thermal-legend-bar"></div><div class="print-legend-labels"><span>Cool</span><span>Rated</span><span>Failing</span></div>';
      extras.push(legend);
    }
    if (extras.length) {
      const row = document.createElement('div');
      row.className = 'print-extras';
      row.append(...extras);
      page.append(row);
    }
    root.append(page);

    if (o.parts) {
      const list = document.createElement('section');
      list.className = 'print-page print-list';
      list.innerHTML = '<header class="print-head"><div class="print-title"></div><div class="print-meta">Parts list</div></header>';
      list.querySelector('.print-title')!.textContent = o.title;
      list.append(partsList());
      root.append(list);
    }
    return root;
  }

  // Page size in mm as laid out.
  function pageSize(o: PrintOptions): [number, number] {
    const [w, h] = PAPER[o.paper];
    return o.landscape ? [h, w] : [w, h];
  }

  function showPreview() {
    const o = options();
    const [w, h] = pageSize(o);
    const s = sheet(o);
    // The first page, inside its sheet (which carries the print colours), at
    // its real size, scaled down to fit inside the preview's padding.
    const [page, ...rest] = s.querySelectorAll<HTMLElement>('.print-page');
    for (const other of rest) other.remove();
    page.style.width = `${w}mm`;
    page.style.height = `${h}mm`;
    const pad = getComputedStyle(preview);
    const roomX = preview.clientWidth - parseFloat(pad.paddingLeft) - parseFloat(pad.paddingRight);
    const roomY = preview.clientHeight - parseFloat(pad.paddingTop) - parseFloat(pad.paddingBottom);
    const scale = Math.min(roomX / (w * PX_PER_MM), roomY / (h * PX_PER_MM));
    s.style.transform = `scale(${scale})`;
    const frame = document.createElement('div');
    frame.className = 'print-preview-page';
    frame.style.width = `${w * PX_PER_MM * scale}px`;
    frame.style.height = `${h * PX_PER_MM * scale}px`;
    frame.append(s);
    preview.replaceChildren(frame);
  }

  function open() {
    if (dialog.open) return;
    field('title').value = src.title();
    // Instruments that are showing start ticked; the scope only if it has probes.
    const scopeBox = field('scope');
    scopeBox.checked = src.scopeShowing();
    (scopeBox as unknown as { disabled: boolean }).disabled = !src.scopeShowing();
    field('thermal').checked = src.thermalShowing();
    dialog.show();
    requestAnimationFrame(showPreview);
  }

  function print() {
    const o = options();
    const [w, h] = pageSize(o);
    pageStyle.textContent = `@page { size: ${w}mm ${h}mm; margin: 0; }`;
    const s = sheet(o);
    s.id = 'print-sheet';
    for (const page of s.querySelectorAll<HTMLElement>('.print-page')) {
      page.style.width = `${w}mm`;
      page.style.height = `${h}mm`;
    }
    document.body.append(s);
    const done = () => {
      s.remove();
      window.removeEventListener('afterprint', done);
    };
    window.addEventListener('afterprint', done);
    window.print();
  }

  form.addEventListener('input', showPreview);
  form.addEventListener('change', showPreview);
  dialog.addEventListener('close', () => {
    if (dialog.returnValue === 'print') print();
  });

  // ⌘P / Ctrl+P: ours, not the browser's.
  window.addEventListener(
    'keydown',
    (e) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey || e.key.toLowerCase() !== 'p') return;
      e.preventDefault();
      e.stopPropagation();
      open();
    },
    true,
  );

  return { open };
}
