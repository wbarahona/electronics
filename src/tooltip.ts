// M3 tooltips for the whole app, in place of the browser's own: any element
// with a `title` gets a plain tooltip (a short label on inverse-surface),
// and one that also has a `data-tip` gets a rich tooltip (its title as the
// subhead, `data-tip` as a line of explanation on a surface container), for
// the few features that need explaining. The title stays the source of the
// text (translated with the rest of the page); it's lifted off while the
// tooltip shows so the browser's doesn't show too.
//
// A tooltip that would only repeat a control's visible label isn't shown.
// Shown on hover after a short wait (at once when moving from one to the
// next), and at once on keyboard focus. Hidden on leaving, pressing, typing
// or scrolling. Not on touch, where a long press means dragging on the board.

const SHOW_DELAY = 500; // ms of hovering before a tooltip shows
const WARM = 300; // ms after one hides during which the next shows at once
const GAP = 6; // px between the element and its tooltip

export function createTooltips() {
  const tip = document.createElement('div');
  tip.className = 'tooltip';
  tip.id = 'tooltip';
  tip.setAttribute('role', 'tooltip');
  tip.hidden = true;
  document.body.append(tip);

  let anchor: HTMLElement | null = null; // element whose tooltip shows (or is about to)
  let lifted = ''; // its title while lifted off
  let timer = 0;
  let hiddenAt = 0;

  function show(el: HTMLElement) {
    const title = el.getAttribute('title');
    // Nothing to add when the control already shows the same words (a
    // category button with its label; on narrow windows the label hides and
    // the tooltip is back).
    if (!title || el.innerText.trim() === title.trim()) return;
    lifted = title;
    el.removeAttribute('title');
    const rich = el.dataset.tip;
    tip.className = rich ? 'tooltip rich' : 'tooltip';
    tip.replaceChildren();
    if (rich) {
      const head = document.createElement('div');
      head.className = 'tooltip-title';
      head.textContent = title;
      const text = document.createElement('div');
      text.className = 'tooltip-text';
      text.textContent = rich;
      tip.append(head, text);
    } else {
      tip.textContent = title;
    }
    tip.hidden = false;
    place(el, !!rich);
    el.setAttribute('aria-describedby', tip.id);
  }

  // Below the element (above if there's no room), centred on it for a plain
  // tooltip and starting at its start for a rich one, kept in the window; to
  // the right of the navigation rail's items and the zoom buttons, which
  // stack vertically (except on phones, where the rail is a bar along the
  // bottom).
  function place(el: HTMLElement, rich: boolean) {
    const r = el.getBoundingClientRect();
    const { offsetWidth: w, offsetHeight: h } = tip;
    const margin = 8;
    let left = rich ? r.left : r.left + r.width / 2 - w / 2;
    left = Math.min(Math.max(left, margin), window.innerWidth - w - margin);
    let top = r.bottom + GAP;
    if (top + h > window.innerHeight - margin) top = r.top - GAP - h;
    if (el.closest('#rail, #zoom') && window.innerWidth >= 600) {
      left = r.right + GAP;
      top = rich ? r.top : r.top + r.height / 2 - h / 2;
      top = Math.min(Math.max(top, margin), window.innerHeight - h - margin);
    }
    tip.style.left = `${left}px`;
    tip.style.top = `${top}px`;
  }

  function hide() {
    clearTimeout(timer);
    if (!anchor) return;
    if (!tip.hidden) hiddenAt = performance.now();
    tip.hidden = true;
    anchor.removeAttribute('aria-describedby');
    // Put the title back, unless the page has set a new one meanwhile (a
    // language change).
    if (lifted && !anchor.hasAttribute('title')) anchor.setAttribute('title', lifted);
    lifted = '';
    anchor = null;
  }

  // The element whose tooltip an event is about, if any.
  const target = (e: Event) =>
    (e.composedPath().find((n) => n instanceof HTMLElement && (n.hasAttribute('title') || n === anchor)) as HTMLElement | undefined) ?? null;

  document.addEventListener('pointerover', (e) => {
    if (e.pointerType === 'touch') return;
    const el = target(e);
    if (el === anchor) return;
    hide();
    if (!el) return;
    anchor = el;
    const warm = performance.now() - hiddenAt < WARM;
    timer = window.setTimeout(() => anchor === el && show(el), warm ? 0 : SHOW_DELAY);
  });

  document.addEventListener('pointerout', (e) => {
    if (!anchor) return;
    const to = e.relatedTarget as Node | null;
    if (to && anchor.contains(to)) return;
    hide();
  });

  // Focus from the keyboard (Tab) shows it at once; focus from a click doesn't.
  let keyboard = false;
  document.addEventListener('keydown', (e) => (keyboard = e.key === 'Tab'), true);
  document.addEventListener('pointerdown', () => (keyboard = false), true);
  document.addEventListener('focusin', (e) => {
    const el = target(e);
    if (!el || el === anchor || !keyboard) return;
    hide();
    anchor = el;
    show(el);
  });
  document.addEventListener('focusout', hide);

  for (const type of ['pointerdown', 'keydown', 'wheel'] as const) document.addEventListener(type, hide, true);
  window.addEventListener('scroll', hide, true);
  window.addEventListener('blur', hide);
}
