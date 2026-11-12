import type { MdDialog } from '@material/web/dialog/dialog.js';
import { PARTS, tagOf } from './components.ts';
import { language, t } from './i18n/index.ts';
import { saveFile } from './platform.ts';
import { lightTokens } from './theme.ts';
import dDin from './fonts/d-din/D-DIN.woff2?url';
import dDinBold from './fonts/d-din/D-DIN-Bold.woff2?url';
import sansLatin from '@fontsource/google-sans/files/google-sans-latin-400-normal.woff2?url';
import sansGreek from '@fontsource/google-sans/files/google-sans-greek-400-normal.woff2?url';
import type { Circuit } from './model.ts';

const SVG_NS = 'http://www.w3.org/2000/svg';
const MARGIN = 40; // world units of space around the circuit

// Sheet sizes in mm (portrait), and the preview's pixels per mm.
const PAPER = { A4: [210, 297], A3: [297, 420], Letter: [216, 279] } as const;
type Paper = keyof typeof PAPER;
const PX_PER_MM = 96 / 25.4; // CSS pixels
const SCOPE_PRINT = [720, 200]; // CSS px of the scope snapshot (scaled to fit on paper)

// The drawing frame (ISO 5457): its line 20 mm in from the left edge (for
// filing) and 10 mm from the others, with grid reference zones of about
// 50 mm in the 5 mm strip outside it, numbered along the top and bottom and
// lettered down the sides, counted from centring marks at each edge's middle.
const FRAME = { left: 20, other: 10, strip: 5, zone: 50 };
const BLOCK_WIDTH = 180; // mm, the title block in the frame's bottom-right corner
const ZONE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I or O

// What the title block says that isn't the title, remembered in this browser.
const BLOCK_FIELDS = ['owner', 'createdBy', 'approvedBy', 'number', 'revision'] as const;
type BlockFields = Record<(typeof BLOCK_FIELDS)[number], string>;
const BLOCK_KEY = 'ampage:title-block';

// Fonts written into an exported SVG (and so the PNG drawn from it), which
// can't reach the app's own: the print lettering, D-DIN, and Google Sans for
// the characters D-DIN lacks (Ω, −) and for notes. Ranges as in src/fonts.css.
const EXPORT_FONTS = [
  { family: 'D-DIN', weight: 400, url: dDin },
  { family: 'D-DIN', weight: 700, url: dDinBold },
  { family: 'Google Sans', weight: 400, url: sansLatin, range: 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD' },
  { family: 'Google Sans', weight: 400, url: sansGreek, range: 'U+0370-0377, U+037A-037F, U+0384-038A, U+038C, U+038E-03A1, U+03A3-03FF' },
];

export interface PrintOptions {
  title: string;
  frame: boolean; // ISO 5457 frame and ISO 7200 title block instead of a plain heading
  block: BlockFields;
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
// chosen. The sheet: a drawing frame and title block (or a plain heading),
// the schematic fitted to the page, and, as chosen, a snapshot of the
// oscilloscope, the thermal view's colours and legend, and a parts list on a
// sheet of its own.
export function createPrint(dialog: MdDialog, src: PrintSources) {
  const form = dialog.querySelector('form')!;
  const preview = dialog.querySelector<HTMLElement>('.print-preview')!;
  const field = <T extends Element>(name: string) => form.querySelector<T & { value: string; checked: boolean }>(`[name="${name}"]`)!;
  const pageStyle = document.head.appendChild(document.createElement('style'));

  function options(): PrintOptions {
    return {
      title: field('title').value.trim() || t('Untitled circuit'),
      frame: field('frame').checked,
      block: Object.fromEntries(BLOCK_FIELDS.map((name) => [name, field(name).value.trim()])) as BlockFields,
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
      <thead><tr><th>${t('Ref.')}</th><th>${t('Part')}</th><th>${t('Value')}</th></tr></thead>
      <tbody>${parts
        .map((c) => `<tr><td>-${c.ref}</td><td>${t(PARTS[c.type].name)}</td><td>${tagOf(c.type, c.props) ?? ''}</td></tr>`)
        .join('')}</tbody>`;
    return table;
  }

  // The frame of an ISO 5457 sheet, w × h mm, as SVG in mm.
  function frame(w: number, h: number): string {
    const { left, other, strip, zone } = FRAME;
    const [x1, y1, x2, y2] = [left, other, w - other, h - other];
    const [ox1, oy1, ox2, oy2] = [x1 - strip, y1 - strip, x2 + strip, y2 + strip];
    // Zones: an even number, counted out from the middle of each side.
    const count = (length: number) => Math.max(2, 2 * Math.round(length / (2 * zone)));
    const [nx, ny] = [count(x2 - x1), count(y2 - y1)];
    const [zx, zy] = [(x2 - x1) / nx, (y2 - y1) / ny];
    let marks = '';
    let labels = '';
    const label = (x: number, y: number, text: string) =>
      `<text x="${x.toFixed(2)}" y="${y.toFixed(2)}" text-anchor="middle" dominant-baseline="central">${text}</text>`;
    for (let i = 0; i < nx; i++) {
      const x = x1 + i * zx;
      if (i) marks += `M ${x} ${oy1} V ${y1} M ${x} ${y2} V ${oy2} `;
      labels += label(x + zx / 2, y1 - strip / 2, String(i + 1)) + label(x + zx / 2, y2 + strip / 2, String(i + 1));
    }
    for (let j = 0; j < ny; j++) {
      const y = y1 + j * zy;
      if (j) marks += `M ${ox1} ${y} H ${x1} M ${x2} ${y} H ${ox2} `;
      labels += label(x1 - strip / 2, y + zy / 2, ZONE_LETTERS[j]) + label(x2 + strip / 2, y + zy / 2, ZONE_LETTERS[j]);
    }
    // Centring marks: from the sheet's edge to 5 mm inside the frame, except
    // where the title block sits (the bottom one stops at the frame there).
    const [cx, cy] = [(x1 + x2) / 2, (y1 + y2) / 2];
    const bottom = cx > x2 - BLOCK_WIDTH ? y2 : y2 - 5;
    const centring = `M ${cx} 0 V ${y1 + 5} M ${cx} ${h} V ${bottom} M 0 ${cy} H ${x1 + 5} M ${w} ${cy} H ${x2 - 5}`;
    return `
      <svg class="print-frame" viewBox="0 0 ${w} ${h}" aria-hidden="true">
        <rect class="print-frame-zones" x="${ox1}" y="${oy1}" width="${ox2 - ox1}" height="${oy2 - oy1}" />
        <path class="print-frame-zones" d="${marks}" />
        <rect class="print-frame-line" x="${x1}" y="${y1}" width="${x2 - x1}" height="${y2 - y1}" />
        <path class="print-frame-line" d="${centring}" />
        <g class="print-frame-labels">${labels}</g>
      </svg>`;
  }

  // The title block (ISO 7200), 180 mm wide at the frame's bottom right.
  function titleBlock(o: PrintOptions, sheetNo: number, sheets: number, title: string): HTMLElement {
    const block = document.createElement('div');
    block.className = 'print-block';
    const cell = (area: string, label: string, cls = '') =>
      `<div class="print-cell ${cls}" style="grid-area: ${area}"><span class="print-cell-label">${t(label)}</span><span class="print-cell-value"></span></div>`;
    block.innerHTML =
      cell('owner', 'Legal owner', 'print-cell-owner') +
      cell('created', 'Created by') +
      cell('approved', 'Approved by') +
      cell('type', 'Document type') +
      cell('date', 'Date of issue') +
      cell('title', 'Title', 'print-cell-title') +
      cell('number', 'Drawing number') +
      cell('rev', 'Rev.') +
      cell('sheet', 'Sheet');
    const date = new Date();
    const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const values = [
      o.block.owner,
      o.block.createdBy,
      o.block.approvedBy,
      sheetNo === 1 ? t('Circuit diagram') : t('Parts list'),
      iso,
      title,
      o.block.number,
      o.block.revision,
      `${sheetNo} / ${sheets}`,
    ];
    block.querySelectorAll('.print-cell-value').forEach((el, i) => (el.textContent = values[i]));
    return block;
  }

  // A page of the printout: framed with a title block, or under a plain heading.
  function page(o: PrintOptions, meta: string, extraClass = ''): HTMLElement {
    const el = document.createElement('section');
    el.className = `print-page ${extraClass}`.trim();
    if (o.frame) {
      el.classList.add('framed');
      const [w, h] = pageSize(o);
      el.innerHTML = frame(w, h);
    } else {
      el.innerHTML = `<header class="print-head"><div class="print-title"></div><div class="print-meta"></div></header>`;
      el.querySelector('.print-title')!.textContent = o.title;
      el.querySelector('.print-meta')!.textContent = meta;
    }
    return el;
  }

  // The whole printout: one page, plus one for the parts list if asked.
  function sheet(o: PrintOptions): HTMLElement {
    const root = document.createElement('div');
    root.className = 'print-sheet';
    // The chosen theme's light colours, whatever the screen's mode.
    for (const [name, value] of Object.entries(lightTokens())) root.style.setProperty(name, value);
    const sheets = o.parts ? 2 : 1;
    const date = new Date().toLocaleDateString(language(), { year: 'numeric', month: 'long', day: 'numeric' });
    const first = page(o, `Ampage · ${date}`);
    const drawing = document.createElement('div');
    drawing.className = 'print-drawing';
    drawing.append(schematic(o));
    first.append(drawing);

    const extras: HTMLElement[] = [];
    if (o.scope) {
      const figure = document.createElement('figure');
      figure.className = 'print-scope';
      const img = new Image();
      img.src = src.scopeSnapshot(SCOPE_PRINT[0], SCOPE_PRINT[1]);
      const caption = document.createElement('figcaption');
      caption.textContent = [t('Oscilloscope'), ...[...src.scope.querySelectorAll('[data-channel]')].map((e) => e.textContent), src.scope.querySelector('.scope-time')!.textContent]
        .filter(Boolean)
        .join(' · ');
      figure.append(img, caption);
      extras.push(figure);
    }
    if (o.thermal) {
      const legend = document.createElement('div');
      legend.className = 'print-legend';
      legend.innerHTML = `<div>${t('Thermal view')}</div><div class="thermal-legend-bar"></div><div class="print-legend-labels"><span>${t('Cool')}</span><span>${t('Rated')}</span><span>${t('Failing')}</span></div>`;
      extras.push(legend);
    }
    if (extras.length) {
      const row = document.createElement('div');
      row.className = 'print-extras';
      row.append(...extras);
      first.append(row);
    }
    if (o.frame) first.append(titleBlock(o, 1, sheets, o.title));
    root.append(first);

    if (o.parts) {
      const list = page(o, t('Parts list'), 'print-list');
      list.append(partsList());
      if (o.frame) {
        const spacer = document.createElement('div');
        spacer.className = 'print-spacer';
        list.append(spacer, titleBlock(o, 2, sheets, o.title));
      }
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
    try {
      const saved = JSON.parse(localStorage.getItem(BLOCK_KEY) ?? '{}') as Partial<BlockFields & { frame: boolean }>;
      for (const name of BLOCK_FIELDS) field(name).value = saved[name] ?? '';
      if (typeof saved.frame === 'boolean') field('frame').checked = saved.frame;
    } catch {
      // nothing remembered
    }
    form.querySelector<HTMLElement>('.print-block-fields')!.hidden = !field('frame').checked;
    // Instruments that are showing start ticked; the scope only if it has probes.
    const scopeBox = field('scope');
    scopeBox.checked = src.scopeShowing();
    (scopeBox as unknown as { disabled: boolean }).disabled = !src.scopeShowing();
    field('thermal').checked = src.thermalShowing();
    dialog.show();
    requestAnimationFrame(showPreview);
  }

  function remember(o: PrintOptions) {
    try {
      localStorage.setItem(BLOCK_KEY, JSON.stringify({ ...o.block, frame: o.frame }));
    } catch {
      // no storage here
    }
  }

  function print() {
    const o = options();
    remember(o);
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
  form.addEventListener('change', () => {
    showPreview();
    form.querySelector<HTMLElement>('.print-block-fields')!.hidden = !field('frame').checked;
  });
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

  // --- Export as image ------------------------------------------------------------
  // The schematic as an SVG or PNG file, as printed (light colours, part
  // values, the thermal view if it's on) on white. A standalone SVG can't use
  // the page's stylesheet, so each element's computed look is written onto it
  // while it's laid out (off screen) in a print sheet.

  const STYLE_PROPS = [
    'fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-dasharray', 'stroke-linecap',
    'stroke-linejoin', 'opacity', 'font-family', 'font-size', 'font-weight', 'font-style', 'text-anchor',
    'dominant-baseline', 'paint-order', 'stop-color', 'stop-opacity',
  ];

  function standalone(): { svg: SVGSVGElement; width: number; height: number } {
    const o = { ...options(), grid: false, values: true, flow: false, thermal: src.thermalShowing() };
    const svg = schematic(o);
    const [x, y, width, height] = svg.getAttribute('viewBox')!.split(' ').map(Number);
    svg.insertAdjacentHTML('afterbegin', `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="#ffffff" />`);
    const glows = [...src.board.querySelectorAll('defs radialGradient[id^="glow-"], defs mask[id^="glow-"]')].map((g) => g.cloneNode(true));
    const defs = document.createElementNS(SVG_NS, 'defs');
    defs.append(...glows);
    svg.prepend(defs);
    // Lay it out in a light print sheet to read its styles.
    const sheet = document.createElement('div');
    sheet.className = 'print-sheet';
    sheet.style.cssText = 'position: fixed; left: -10000px; top: 0';
    for (const [name, value] of Object.entries(lightTokens())) sheet.style.setProperty(name, value);
    sheet.append(svg);
    document.body.append(sheet);
    // Read every element's look before changing any: dropping a parent's
    // class first would unmatch its children's rules (.part .value).
    const looks = [...svg.querySelectorAll<SVGElement>('*')].map((el) => {
      const style = getComputedStyle(el);
      return { el, hidden: style.display === 'none', css: STYLE_PROPS.map((name) => `${name}: ${style.getPropertyValue(name)}`).join('; ') };
    });
    for (const { el, hidden, css } of looks) {
      if (hidden) {
        el.remove();
        continue;
      }
      el.setAttribute('style', css);
      el.removeAttribute('class');
    }
    sheet.remove();
    svg.removeAttribute('class');
    svg.setAttribute('width', String(width));
    svg.setAttribute('height', String(height));
    return { svg, width, height };
  }

  function download(blob: Blob, extension: string) {
    saveFile(blob, `${src.title() || 'circuit'}.${extension}`);
  }

  // The @font-face rules for EXPORT_FONTS, each font inlined (fetched once).
  let fontFaces: Promise<string> | null = null;
  function embeddedFonts(): Promise<string> {
    fontFaces ??= Promise.all(
      EXPORT_FONTS.map(async ({ family, weight, url, range }) => {
        const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
        let binary = '';
        for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        return `@font-face { font-family: "${family}"; font-weight: ${weight}; src: url(data:font/woff2;base64,${btoa(binary)}) format("woff2");${range ? ` unicode-range: ${range};` : ''} }`;
      }),
    ).then((faces) => faces.join('\n'));
    return fontFaces;
  }

  // PNGs at twice the size, sharp on high-density screens and in documents.
  async function exportImage(kind: 'svg' | 'png') {
    const { svg, width, height } = standalone();
    const style = document.createElementNS(SVG_NS, 'style');
    style.textContent = await embeddedFonts();
    svg.querySelector('defs')!.prepend(style);
    const text = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([text], { type: 'image/svg+xml' });
    if (kind === 'svg') return download(blob, 'svg');
    const img = new Image();
    img.src = URL.createObjectURL(blob);
    await img.decode();
    // The image loads its embedded fonts on its own after decoding; text in a
    // font still loading would draw blank, so give it a moment.
    await new Promise((resolve) => setTimeout(resolve, 250));
    const canvas = document.createElement('canvas');
    canvas.width = width * 2;
    canvas.height = height * 2;
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(img.src);
    canvas.toBlob((png) => png && download(png, 'png'), 'image/png');
  }

  return { open, exportImage };
}
