import { CATEGORIES, PARTS, defaults, symbolMarkup } from './components.ts';
import { icon, type Palette } from './palette.ts';
import type { PartType } from './types.ts';

const escape = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

// The text with the first match of the query marked, as HTML.
function highlight(text: string, query: string): string {
  const at = text.toLowerCase().indexOf(query);
  if (at < 0) return escape(text);
  const end = at + query.length;
  return `${escape(text.slice(0, at))}<mark>${escape(text.slice(at, end))}</mark>${escape(text.slice(end))}`;
}

// "Search parts" in the top bar (an M3 docked search view): as you type, a
// list under the field shows every part whose name, subcategory or a part
// number contains the text ("gate" finds the gates, "1N4148" the diode), by
// category, with its symbol and the matching piece highlighted.
// Click a result to drop the part in the middle of the view, or drag it onto
// the board, as in the tray. From the keyboard: ⌘K focuses the field, ↑/↓
// choose, Enter places, Esc closes the list (or clears the field when the
// list is already closed).
export function createSearch(root: HTMLElement, palette: Palette) {
  const input = root.querySelector<HTMLInputElement>('#search-input')!;
  const results = root.querySelector<HTMLElement>('#search-results')!;
  let options: { el: HTMLElement; type: PartType }[] = [];
  let active = -1; // index into options of the one Enter places

  function setActive(i: number) {
    options[active]?.el.classList.remove('active');
    active = i;
    const option = options[active];
    if (!option) {
      input.removeAttribute('aria-activedescendant');
      return;
    }
    option.el.classList.add('active');
    option.el.scrollIntoView({ block: 'nearest' });
    input.setAttribute('aria-activedescendant', option.el.id);
  }

  function show(open: boolean) {
    results.hidden = !open;
    root.classList.toggle('open', open);
    input.setAttribute('aria-expanded', String(open));
  }

  function update() {
    const query = input.value.trim().toLowerCase();
    if (!query || document.activeElement !== input) {
      show(false);
      return;
    }
    options = [];
    active = -1;
    const groups = CATEGORIES.flatMap((category) => {
      // A part's part numbers that match, e.g. "1N4148" for the diode.
      const codes = (type: PartType) => (PARTS[type].presets ?? []).map((p) => p.code).filter((c) => c.toLowerCase().includes(query));
      const matches = (Object.keys(PARTS) as PartType[]).filter((type) => {
        const { category: id, name, group = '' } = PARTS[type];
        return id === category.id && (name.toLowerCase().includes(query) || group.toLowerCase().includes(query) || codes(type).length > 0);
      });
      if (!matches.length) return [];
      const group = document.createElement('div');
      group.className = 'search-category';
      group.setAttribute('role', 'group');
      group.setAttribute('aria-label', category.label);
      group.innerHTML = `<div class="search-category-label" aria-hidden="true"><md-icon>${category.icon}</md-icon>${category.label}</div>`;
      for (const type of matches) {
        const part = PARTS[type];
        const { box, width, height } = icon(type);
        const el = document.createElement('div');
        el.className = 'search-option';
        el.id = `search-option-${type}`;
        el.setAttribute('role', 'option');
        el.title = `Drag ${part.name} onto the board`;
        el.innerHTML = `
          <span class="search-option-icon"><svg class="part" viewBox="${box}" style="width: ${width}px; height: ${height}px" aria-hidden="true">${symbolMarkup(type, defaults(type))}</svg></span>
          <span class="search-option-text">
            <span class="search-option-name">${highlight(part.name, query)}</span>
            ${part.group || codes(type).length ? `<span class="search-option-group">${[part.group ? highlight(part.group, query) : '', ...codes(type).slice(0, 3).map((c) => highlight(c, query))].filter(Boolean).join(' · ')}</span>` : ''}
          </span>`;
        el.addEventListener('pointerdown', (e) => palette.startDrag(e, type, el));
        // After a click or a drop: done here, back to the board.
        el.addEventListener('click', () => input.blur());
        options.push({ el, type });
        group.append(el);
      }
      return [group];
    });
    if (groups.length) {
      results.replaceChildren(...groups);
    } else {
      const none = document.createElement('div');
      none.className = 'search-empty';
      none.textContent = `No parts match “${input.value.trim()}”`;
      results.replaceChildren(none);
    }
    results.scrollTop = 0;
    show(true);
    setActive(options.length ? 0 : -1);
  }

  input.addEventListener('input', update);
  input.addEventListener('focus', update);
  input.addEventListener('blur', () => show(false));
  // Pressing in the list (its scrollbar too) mustn't take focus from the field.
  results.addEventListener('pointerdown', (e) => e.preventDefault());

  input.addEventListener('keydown', (e) => {
    const open = !results.hidden;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) return update();
      if (!options.length) return;
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive((active + step + options.length) % options.length);
    } else if (e.key === 'Enter') {
      const option = open ? options[active] : undefined;
      if (!option) return;
      e.preventDefault();
      palette.addToView(option.type);
      input.blur();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      if (open) show(false);
      else input.value = '';
    }
  });

  // ⌘K (Ctrl+K) from anywhere jumps to the field, with any earlier text
  // selected so typing replaces it.
  window.addEventListener('keydown', (e) => {
    if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey || e.key.toLowerCase() !== 'k') return;
    e.preventDefault();
    input.focus();
    input.select();
  });
}
