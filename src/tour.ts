import { t } from './i18n/index.ts';

const KEY = 'ampage:toured'; // set once the tour has been finished or skipped

const MOD = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl+';

// One stop of the tour: what to point at (a selector; none for a card in the
// middle of the window) and what to say about it.
interface Step {
  target?: string;
  title: string;
  text: string;
}

const STEPS: Step[] = [
  {
    title: 'Welcome to Ampage',
    text: 'Build circuits from real parts and watch them run: lamps glow, current flows, overloaded parts burn out. Here is a quick look around.',
  },
  {
    target: '#palette',
    title: 'Parts',
    text: 'Pick a category, then drag a part onto the board, or click it to drop it in the middle.',
  },
  {
    target: '#search',
    title: 'Search',
    text: 'Or press {mod}K and type a part’s name.',
  },
  {
    target: '#board',
    title: 'The board',
    text: 'Drag from one pin (the small circles) to another to wire them. Click a part to change its values; R rotates it. Hold Space and drag to pan.',
  },
  {
    target: '#sim-controls',
    title: 'Run it',
    text: 'Run starts the simulation (or press Space). Slower and Faster change its speed.',
  },
  {
    target: '#rail-examples',
    title: 'Examples',
    text: 'Working circuits to open, run and change.',
  },
  {
    target: '#rail-file',
    title: 'Files',
    text: 'Save and open circuits, export or print them. A saved .ampage file opens in Ampage with a double-click.',
  },
  {
    target: '#rail-settings',
    title: 'Settings',
    text: 'Language, theme, EU or US symbols, and how the simulation behaves. You can take this tour again from Settings › Misc.',
  },
];

// Whether the tour has been finished or skipped in this browser.
export function toured(): boolean {
  try {
    return localStorage.getItem(KEY) === 'true';
  } catch {
    return true; // no storage: don't keep offering it
  }
}

// A first look around for newcomers: each stop lifts one part of the window
// out of a scrim and explains it on an M3 card beside it, with Back, Next and
// Skip. Esc skips; ← and → step. Finishing or skipping it is remembered.
export function createTour() {
  let step = 0;
  let root: HTMLElement | null = null;

  function build(): HTMLElement {
    const el = document.createElement('div');
    el.className = 'tour';
    el.innerHTML = `
      <div class="tour-spot"></div>
      <div class="tour-card" role="dialog" aria-modal="true" aria-labelledby="tour-title" aria-describedby="tour-text">
        <p class="tour-count"></p>
        <h2 class="tour-title" id="tour-title"></h2>
        <p class="tour-text" id="tour-text"></p>
        <div class="tour-actions">
          <md-text-button class="tour-skip"></md-text-button>
          <span class="tour-gap"></span>
          <md-text-button class="tour-back"></md-text-button>
          <md-filled-button class="tour-next"></md-filled-button>
        </div>
      </div>`;
    el.querySelector('.tour-skip')!.addEventListener('click', end);
    el.querySelector('.tour-back')!.addEventListener('click', () => go(step - 1));
    el.querySelector('.tour-next')!.addEventListener('click', () => (step === STEPS.length - 1 ? end() : go(step + 1)));
    return el;
  }

  // Put the highlight round the step's target and the card beside it (below,
  // else above, else over it), kept inside the window.
  function place() {
    if (!root) return;
    const { target } = STEPS[step];
    const spot = root.querySelector<HTMLElement>('.tour-spot')!;
    const card = root.querySelector<HTMLElement>('.tour-card')!;
    const el = target ? document.querySelector<HTMLElement>(target) : null;
    const r = el?.getBoundingClientRect();
    const margin = 16;
    const [vw, vh] = [window.innerWidth, window.innerHeight];
    const w = card.offsetWidth;
    const h = card.offsetHeight;
    if (!r || r.width === 0) {
      spot.classList.add('centred');
      spot.removeAttribute('style');
      card.style.left = `${(vw - w) / 2}px`;
      card.style.top = `${(vh - h) / 2}px`;
      return;
    }
    spot.classList.remove('centred');
    const pad = 6;
    // A target bigger than the window (the board) is lit only where it shows.
    const box = {
      left: Math.max(r.left, 0) - pad,
      top: Math.max(r.top, 0) - pad,
      right: Math.min(r.right, vw) + pad,
      bottom: Math.min(r.bottom, vh) + pad,
    };
    Object.assign(spot.style, {
      left: `${box.left}px`,
      top: `${box.top}px`,
      width: `${box.right - box.left}px`,
      height: `${box.bottom - box.top}px`,
    });
    const clampX = (x: number) => Math.min(Math.max(x, margin), vw - w - margin);
    const clampY = (y: number) => Math.min(Math.max(y, margin), vh - h - margin);
    let left = clampX(r.left + r.width / 2 - w / 2);
    let top: number;
    if (box.bottom + margin + h <= vh) top = box.bottom + margin;
    else if (box.top - margin - h >= 0) top = box.top - margin - h;
    else if (box.right + margin + w <= vw) {
      // Beside it (a rail button on a short window).
      left = box.right + margin;
      top = clampY(r.top + r.height / 2 - h / 2);
    } else top = clampY(r.top + r.height / 2 - h / 2);
    card.style.left = `${left}px`;
    card.style.top = `${top}px`;
  }

  function go(next: number) {
    if (!root || next < 0 || next >= STEPS.length) return;
    step = next;
    const { title, text } = STEPS[step];
    root.querySelector('.tour-count')!.textContent = t('{n} of {total}', { n: step + 1, total: STEPS.length });
    root.querySelector('.tour-title')!.textContent = t(title);
    root.querySelector('.tour-text')!.textContent = t(text, { mod: MOD });
    root.querySelector('.tour-skip')!.textContent = t('Skip');
    const back = root.querySelector<HTMLElement & { disabled: boolean }>('.tour-back')!;
    back.textContent = t('Back');
    back.hidden = step === 0;
    const next_ = root.querySelector<HTMLElement & { focus: () => void }>('.tour-next')!;
    next_.textContent = t(step === 0 ? 'Start the tour' : step === STEPS.length - 1 ? 'Done' : 'Next');
    root.querySelector<HTMLElement>('.tour-skip')!.hidden = step === STEPS.length - 1;
    place();
    // After the card has its new size.
    requestAnimationFrame(place);
    next_.focus();
  }

  function onKey(e: KeyboardEvent) {
    if (!root) return;
    // The tour has the keyboard while it's open: board shortcuts wait.
    e.stopPropagation();
    if (e.key === 'Escape') end();
    else if (e.key === 'ArrowRight') go(step + 1);
    else if (e.key === 'ArrowLeft') go(step - 1);
    else return;
    e.preventDefault();
  }

  function end() {
    if (!root) return;
    root.remove();
    root = null;
    window.removeEventListener('keydown', onKey, true);
    window.removeEventListener('resize', place);
    try {
      localStorage.setItem(KEY, 'true');
    } catch {
      // no storage: it may be offered again
    }
  }

  return {
    start() {
      if (root) return;
      root = build();
      document.body.append(root);
      window.addEventListener('keydown', onKey, true);
      window.addEventListener('resize', place);
      go(0);
    },
  };
}
