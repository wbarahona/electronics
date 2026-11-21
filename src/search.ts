import { CATEGORIES, PARTS, defaults, symbolMarkup } from './components.ts';
import { t } from './i18n/index.ts';
import { icon, partTooltip, type Palette } from './palette.ts';
import { recentParts } from './recent.ts';
import { availableCommands, type Command } from './commands.ts';
import { combo } from './shortcuts.ts';
import type { PartType } from './types.ts';

const escape = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

// The text with the first match of the query marked, as HTML.
function highlight(text: string, query: string): string {
  const at = text.toLowerCase().indexOf(query);
  if (at < 0) return escape(text);
  const end = at + query.length;
  return `${escape(text.slice(0, at))}<mark>${escape(text.slice(at, end))}</mark>${escape(text.slice(end))}`;
}

// "Search parts" in the top bar (an M3 docked search view, Expressive): as
// you type, a list under the field shows every part whose name, subcategory
// or a part number contains the text ("gate" finds the gates, "1N4148" the
// diode), by category, with its symbol and the matching piece highlighted.
// Before anything is typed it shows the parts placed most recently. Under
// the list, fixed while it scrolls, Browse has a chip per category that
// opens its tray. Click a result to drop the part in the middle of the view,
// or drag it onto the board, as in the tray. It finds actions too (the command palette, see commands.ts): ⌘⇧P, or typing
// > first, shows only them, all of them before anything else is typed;
// otherwise they come first when the text starts one of their names ("fit",
// "export"), after the parts if not. Enter or a click runs one. From the
// keyboard: ⌘K focuses the field, ↑/↓ choose, Enter places, Esc closes the
// list (or clears the field when the list is already closed). While the list
// is open the leading search icon turns into a back button (M3 search view):
// it leaves the search, clearing the field so it opens fresh next time; the
// ✕ at the end only clears it.
export function createSearch(root: HTMLElement, palette: Palette) {
  const input = root.querySelector<HTMLInputElement>('#search-input')!;
  const results = root.querySelector<HTMLElement>('.search-results')!;
  const list = results.querySelector<HTMLElement>('.search-list')!; // what scrolls
  const browse = results.querySelector<HTMLElement>('.search-browse')!;
  const clear = root.querySelector<HTMLElement>('.search-clear')!;
  let options: { el: HTMLElement; type?: PartType; command?: Command }[] = [];
  let actionsOnly = false; // opened with ⌘⇧P: only actions, until it closes
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

  // A section of the list: its heading (an icon and a name) and its rows.
  function section(iconName: string, label: string, rows: HTMLElement[]): HTMLElement {
    const group = document.createElement('div');
    group.className = 'search-category';
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', label);
    group.innerHTML = `<div class="search-category-label" aria-hidden="true"><md-icon>${iconName}</md-icon>${escape(label)}</div>`;
    group.append(...rows);
    return group;
  }

  // One part's row: its symbol on a tile, its name, and under it its
  // subcategory and any part numbers that match.
  function option(type: PartType, query: string, codes: string[] = []): HTMLElement {
    const part = PARTS[type];
    const { box, width, height } = icon(type);
    const el = document.createElement('div');
    el.className = 'search-option';
    el.id = `search-option-${type}`;
    el.setAttribute('role', 'option');
    const name = t(part.name);
    const subgroup = part.group && t(part.group);
    const mark = (text: string) => (query ? highlight(text, query) : escape(text));
    el.title = partTooltip(type, t('Drag {part} onto the board', { part: name }));
    el.innerHTML = `
      <span class="search-option-icon"><svg class="part" viewBox="${box}" style="width: ${width}px; height: ${height}px" aria-hidden="true">${symbolMarkup(type, defaults(type))}</svg></span>
      <span class="search-option-text">
        <span class="search-option-name">${mark(name)}</span>
        ${subgroup || codes.length ? `<span class="search-option-group">${[subgroup ? mark(subgroup) : '', ...codes.slice(0, 3).map(mark)].filter(Boolean).join(' · ')}</span>` : ''}
      </span>`;
    el.addEventListener('pointerdown', (e) => palette.startDrag(e, type, el));
    // After a click or a drop: done here, back to the board.
    el.addEventListener('click', () => input.blur());
    options.push({ el, type });
    return el;
  }

  // An action's row: its icon on a tile, its name, and its shortcut at the end.
  function actionRow(command: Command, query: string): HTMLElement {
    const el = document.createElement('div');
    el.className = 'search-option search-action';
    el.id = `search-action-${options.length}`;
    el.setAttribute('role', 'option');
    const name = t(command.label);
    el.innerHTML = `
      <span class="search-option-icon"><md-icon>${command.icon}</md-icon></span>
      <span class="search-option-text"><span class="search-option-name">${query ? highlight(name, query) : escape(name)}</span></span>
      ${command.keys ? `<span class="search-keys shortcut-keys">${combo(command.keys)}</span>` : ''}`;
    el.addEventListener('click', () => runCommand(command));
    options.push({ el, command });
    return el;
  }

  // Back to the board, then do it (so a dialog it opens gets the focus).
  function runCommand(command: Command) {
    input.value = '';
    input.blur();
    command.run();
  }

  // The actions whose name (in this language or English) or other words
  // contain the query; and whether one of them starts with it.
  function matchingActions(query: string): { list: Command[]; leading: boolean } {
    const list = availableCommands().filter((c) => [c.label, t(c.label), c.words ?? ''].some((s) => s.toLowerCase().includes(query)));
    const starts = (s: string) => s.toLowerCase().split(/[\s,()]+/).some((word) => word.startsWith(query));
    return { list, leading: list.some((c) => starts(c.label) || starts(t(c.label))) };
  }

  // Show these rows, from the top, with Browse under them unless only actions
  // are searched.
  function fill(rows: HTMLElement[], withBrowse = true) {
    list.replaceChildren(...rows);
    list.hidden = !rows.length;
    list.scrollTop = 0;
    browse.hidden = !withBrowse;
    if (withBrowse) browse.replaceChildren(browseSection());
    show(true);
  }

  // Browse: a chip per category, opening its tray.
  function browseSection(): HTMLElement {
    const chips = document.createElement('md-chip-set');
    chips.className = 'search-chips';
    for (const category of CATEGORIES) {
      const chip = document.createElement('md-assist-chip');
      chip.setAttribute('label', t(category.label));
      chip.innerHTML = `<md-icon slot="icon">${category.icon}</md-icon>`;
      chip.addEventListener('click', () => {
        palette.openCategory(category.id);
        input.blur();
      });
      chips.append(chip);
    }
    return section('category', t('Browse'), [chips]);
  }

  // Nothing typed yet: the parts placed most recently.
  function suggestions(): HTMLElement[] {
    const recent = recentParts();
    return recent.length ? [section('history', t('Recent'), recent.map((type) => option(type, '')))] : [];
  }

  function update() {
    clear.hidden = !input.value;
    const typed = input.value.trim();
    const onlyActions = actionsOnly || typed.startsWith('>');
    const query = (typed.startsWith('>') ? typed.slice(1) : typed).trim().toLowerCase();
    input.placeholder = t(onlyActions ? 'Search actions' : 'Search parts');
    if (document.activeElement !== input) {
      show(false);
      return;
    }
    options = [];
    active = -1;
    if (onlyActions) {
      const { list: found } = query ? matchingActions(query) : { list: availableCommands() };
      fill([found.length ? section('bolt', t('Actions'), found.map((c) => actionRow(c, query))) : nothing(t('No actions match “{query}”', { query }))], false);
      setActive(options.length ? 0 : -1);
      return;
    }
    if (!query) {
      fill(suggestions());
      return;
    }
    const groups = CATEGORIES.flatMap((category) => {
      // A part's part numbers that match, e.g. "1N4148" for the diode.
      const codes = (type: PartType) => (PARTS[type].presets ?? []).map((p) => p.code).filter((c) => c.toLowerCase().includes(query));
      // Names and subcategories match in the current language or in English.
      const has = (text = '') => [text, t(text)].some((s) => s.toLowerCase().includes(query));
      const matches = (Object.keys(PARTS) as PartType[]).filter((type) => {
        const { category: id, name, group } = PARTS[type];
        // (A bare module block isn't placed from search: modules come from the library.)
        return id === category.id && type !== 'module' && (has(name) || has(group) || codes(type).length > 0);
      });
      if (!matches.length) return [];
      return [section(category.icon, t(category.label), matches.map((type) => option(type, query, codes(type))))];
    });
    // Actions: first when the text starts one of their names, else after the parts.
    const actions = matchingActions(query);
    if (actions.list.length) {
      const rows = () => section('bolt', t('Actions'), actions.list.map((c) => actionRow(c, query)));
      if (actions.leading) {
        // Built first so they come first in the arrow-key order too.
        const first = rows();
        const parts = groups.map((g) => g);
        options = [...options.filter((o) => o.command), ...options.filter((o) => o.type)];
        groups.splice(0, groups.length, first, ...parts);
      } else groups.push(rows());
    }
    fill(groups.length ? groups : [nothing(t('No parts match “{query}”', { query: input.value.trim() }))]);
    setActive(options.length ? 0 : -1);
  }

  // The row saying nothing matched.
  function nothing(text: string): HTMLElement {
    const none = document.createElement('div');
    none.className = 'search-empty';
    none.innerHTML = `<md-icon>search_off</md-icon><span></span>`;
    none.querySelector('span')!.textContent = text;
    return none;
  }

  // The shortcut hint at the end of the empty bar, as this keyboard has it.
  root.querySelector('.search-key')!.textContent = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘K' : 'Ctrl K';

  // Back: leave the search, and start afresh next time.
  const back = root.querySelector<HTMLElement>('.search-back')!;
  back.addEventListener('pointerdown', (e) => e.preventDefault());
  back.addEventListener('click', (e) => {
    e.preventDefault(); // it sits in the field's label: don't focus the field again
    input.value = '';
    clear.hidden = true;
    input.blur();
  });

  // Phones: the search folded to a magnifier, which unfolds it (it folds
  // again when the field loses focus).
  const unfold = (e: Event) => {
    e.preventDefault(); // the field takes the focus, not the button
    root.classList.add('unfolded');
    input.focus();
  };
  const magnifier = root.querySelector('.search-open')!;
  magnifier.addEventListener('pointerdown', unfold);
  magnifier.addEventListener('click', unfold); // from the keyboard

  // The clear button: empty the field, keep typing.
  clear.addEventListener('pointerdown', (e) => e.preventDefault());
  clear.addEventListener('click', () => {
    input.value = '';
    input.focus();
    update();
  });

  input.addEventListener('input', update);
  input.addEventListener('focus', update);
  input.addEventListener('blur', () => {
    actionsOnly = false;
    root.classList.remove('unfolded');
    show(false);
  });
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
      if (option.command) return runCommand(option.command);
      palette.addToView(option.type!);
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
    if (!(e.metaKey || e.ctrlKey) || e.altKey || e.key.toLowerCase() !== 'k' || e.shiftKey) return;
    e.preventDefault();
    input.focus();
    input.select();
  });

  // ⌘⇧P (Ctrl+Shift+P): the same field, showing only actions.
  window.addEventListener('keydown', (e) => {
    if (!(e.metaKey || e.ctrlKey) || !e.shiftKey || e.altKey || e.key.toLowerCase() !== 'p') return;
    e.preventDefault();
    actionsOnly = true;
    input.value = '';
    if (document.activeElement === input) update();
    else input.focus();
  });
}
