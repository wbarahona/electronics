import type { MdDialog } from '@material/web/dialog/dialog.js';
import { t } from './i18n/index.ts';
import { fromControl } from './keys.ts';

const MAC = /Mac|iPhone|iPad/.test(navigator.platform);

// One key in a shortcut: a key name, or lowercase words for something done
// with the mouse or a finger ('drag', 'scroll', 'pinch'), shown as text.
type Key = string;

// What a shortcut does and its keys: each inner list one way of doing it,
// keys pressed together ('Mod' is ⌘ on a Mac, Ctrl elsewhere).
type Row = [action: string, ways: Key[][]];

// Every keyboard shortcut (and the few mouse gestures that go with them), by
// what they're for: what the Keyboard shortcuts dialog lists. Keep it in step
// with the key handlers (src/editor.ts, zoom.ts, controls.ts, history.ts,
// files.ts, search.ts, print.ts, readout via main.ts) and README.md.
const GROUPS: { title: string; icon: string; rows: Row[] }[] = [
  {
    title: 'Simulation',
    icon: 'play_arrow',
    rows: [
      ['Run or pause', [['Space']]],
      ['Slower or faster (10× steps)', [['←'], ['→']]],
    ],
  },
  {
    title: 'Parts',
    icon: 'search',
    rows: [
      ['Search parts and actions', [['Mod', 'K']]],
      ['Choose a search result', [['↑'], ['↓']]],
      ['Place the chosen part', [['Enter']]],
      ['Rotate (also while dragging)', [['R']]],
    ],
  },
  {
    title: 'Editing',
    icon: 'edit',
    rows: [
      ['Undo', [['Mod', 'Z']]],
      ['Redo', [['Mod', 'Shift', 'Z'], ['Mod', 'Y']]],
      ['Copy, cut, paste', [['Mod', 'C'], ['Mod', 'X'], ['Mod', 'V']]],
      ['Duplicate', [['Mod', 'D']]],
      ['Delete the selection', MAC ? [['Backspace'], ['Mod', 'Backspace']] : [['Del'], ['Backspace']]],
      ['Undo the last bend while wiring', [['Backspace']]],
      ['Branch a new wire from a wire', [['double-click']]],
      ['Cancel a drag or wire; close panels', [['Esc']]],
    ],
  },
  {
    title: 'View',
    icon: 'visibility',
    rows: [
      ['Fit the circuit in view', [['F'], ['Home'], ['Shift', '1']]],
      ['Zoom in, zoom out', [['Mod', '='], ['Mod', '−']]],
      ['Zoom to 100 %', [['Mod', '0']]],
      ['Zoom with the mouse', [['Mod', 'scroll']]],
      ['Pan the board', [['Space', 'drag']]],
      ['Show or hide values on hover', [['I']]],
    ],
  },
  {
    title: 'Touch',
    icon: 'touch_app',
    rows: [
      ['Pan the board', [['drag with one finger']]],
      ['Zoom', [['pinch']]],
      ['Cut, copy, paste, rotate, delete', [['long press']]],
      ['Place a part', [['drag it down from the tray']]],
    ],
  },
  {
    title: 'Files',
    icon: 'folder',
    rows: [
      ['Save', [['Mod', 'S']]],
      ['Open', [['Mod', 'O']]],
      ['Print', [['Mod', 'P']]],
    ],
  },
  {
    title: 'Help',
    icon: 'help',
    rows: [
      ['Keyboard shortcuts', [['?'], ['Mod', '/']]],
      ['Search actions (command palette)', [['Mod', 'Shift', 'P']]],
    ],
  },
];

// How a key is written on this kind of keyboard.
const MAC_KEYS: Record<string, string> = { Mod: '⌘', Shift: '⇧', Backspace: '⌫', Enter: '↩', Del: '⌦' };
const PC_KEYS: Record<string, string> = { Mod: 'Ctrl' };
const WORDS = new Set(['Space', 'Enter', 'Home', 'Esc', 'Backspace', 'Del', 'Shift']); // key names to translate
const keyText = (key: Key) => (MAC ? MAC_KEYS[key] : PC_KEYS[key]) ?? (WORDS.has(key) ? t(key) : key);
const isGesture = (key: Key) => /^[a-z][a-z -]*$/.test(key);

const escape = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

// One way of doing it: key caps, with + between them off the Mac (where
// shortcuts are written ⌘K); a mouse gesture as a word.
// Kept together on one line. (Also used for the shortcuts shown beside
// actions in the search.)
export function combo(keys: Key[]): string {
  const caps = keys
    .map((key) => (isGesture(key) ? `<span class="shortcut-gesture">${escape(t(key))}</span>` : `<kbd>${escape(keyText(key))}</kbd>`))
    .join(MAC ? '' : '<span class="shortcut-plus">+</span>');
  return `<span class="shortcut-combo">${caps}</span>`;
}

// The Keyboard shortcuts dialog (M3, Expressive): every shortcut in groups
// by what it's for, each group a rounded card with its icon, each row the
// action and its keys as key caps, written for this keyboard (⌘ on a Mac,
// Ctrl elsewhere). Opened with ? or ⌘/ from anywhere but a text field, or
// from Help in the rail.
export function createShortcuts(dialog: MdDialog) {
  const body = dialog.querySelector<HTMLElement>('.shortcuts-body')!;

  // Drawn on opening, so it's in the current language.
  function render() {
    body.innerHTML = GROUPS.map(
      ({ title, icon, rows }) => `
      <section class="shortcuts-group">
        <h3 class="shortcuts-heading"><md-icon>${icon}</md-icon>${escape(t(title))}</h3>
        ${rows
          .map(
            ([action, ways]) => `
          <div class="shortcut">
            <span class="shortcut-action">${escape(t(action))}</span>
            <span class="shortcut-keys">${ways.map(combo).join(`<span class="shortcut-or">${escape(t('or'))}</span>`)}</span>
          </div>`,
          )
          .join('')}
      </section>`,
    ).join('');
  }

  function open() {
    if (dialog.open) return;
    render();
    dialog.show();
  }

  window.addEventListener('keydown', (e) => {
    if (fromControl(e) || e.altKey || document.querySelector('md-dialog[open]:not(#shortcuts-dialog)')) return;
    const help = (e.key === '?' && !e.metaKey && !e.ctrlKey) || ((e.metaKey || e.ctrlKey) && e.key === '/');
    if (!help) return;
    e.preventDefault();
    open();
  });

  return { open };
}
