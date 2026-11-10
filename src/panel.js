import { PARTS } from './components.js';
import { MODELS } from './sim/models.js';
import { formatNumber, parseSI } from './units.js';

// Side sheet for editing the selected part's values, built from M3 fields.
// Shown while exactly one part is selected.
export function createPanel(el, circuit, editor) {
  let current = null;

  function set(c, key, value) {
    c.props[key] = value;
    editor.refreshPart(c.id);
  }

  // Outlined text field with the unit as suffix. Commits on Enter or leaving
  // the field; bad input is flagged and not applied, and leaving restores the
  // current value.
  function numberInput(c, key, spec) {
    const field = document.createElement('md-outlined-text-field');
    field.label = spec.label;
    field.suffixText = spec.unit;
    field.inputMode = 'decimal';
    field.value = formatNumber(c.props[key]);
    field.addEventListener('input', () => {
      field.error = false;
    });
    field.addEventListener('change', () => {
      const v = parseSI(field.value);
      if (Number.isNaN(v) || v < (spec.min ?? -Infinity) || v > (spec.max ?? Infinity)) {
        field.error = true;
        field.errorText = 'Not a valid value';
        return;
      }
      set(c, key, v);
      field.value = formatNumber(v);
    });
    field.addEventListener('focusout', () => {
      if (!field.error) return;
      field.error = false;
      field.value = formatNumber(c.props[key]);
    });
    return field;
  }

  function choiceInput(c, key, spec) {
    const select = document.createElement('md-outlined-select');
    select.label = spec.label;
    for (const value of spec.options) {
      const option = document.createElement('md-select-option');
      option.value = value;
      option.selected = value === c.props[key];
      const headline = document.createElement('div');
      headline.slot = 'headline';
      headline.textContent = value;
      option.append(headline);
      select.append(option);
    }
    select.addEventListener('change', () => set(c, key, select.value));
    return select;
  }

  // On/off values get an M3 switch with its label beside it.
  function switchInput(c, key, spec) {
    const label = document.createElement('label');
    label.className = 'field check';
    const name = document.createElement('span');
    name.textContent = spec.label;
    const toggle = document.createElement('md-switch');
    toggle.selected = c.props[key];
    toggle.addEventListener('change', () => set(c, key, toggle.selected));
    label.append(name, toggle);
    return label;
  }

  function field(c, key, spec) {
    if (typeof spec.value === 'boolean') return switchInput(c, key, spec);
    return spec.options ? choiceInput(c, key, spec) : numberInput(c, key, spec);
  }

  function show(id) {
    if (id === current) return;
    current = id;
    const c = id && circuit.get(id);
    if (!c || !('type' in c)) {
      el.hidden = true;
      el.replaceChildren();
      return;
    }
    const heading = document.createElement('h2');
    const ref = document.createElement('span');
    ref.className = 'ref';
    ref.textContent = `-${c.ref}`;
    heading.append(ref, ` ${PARTS[c.type].name}`);
    el.replaceChildren(
      heading,
      ...(c.broken ? [brokenNotice(c)] : []),
      ...Object.entries(PARTS[c.type].props)
        .filter(([, spec]) => !spec.hidden)
        .map(([key, spec]) => field(c, key, spec)),
    );
    el.hidden = false;
  }

  // What happened to a failed part, and a button to swap in a fresh one.
  function brokenNotice(c) {
    const notice = document.createElement('div');
    notice.className = 'broken-notice';
    const text = document.createElement('span');
    const label = MODELS[c.type].failure.label;
    text.textContent = `${label[0].toUpperCase()}${label.slice(1)}`;
    const replace = document.createElement('md-outlined-button');
    replace.innerHTML = '<md-icon slot="icon">autorenew</md-icon>Replace';
    replace.addEventListener('click', () => {
      c.broken = false;
      editor.refreshPart(c.id);
      refresh();
    });
    notice.append(text, replace);
    return notice;
  }

  // Rebuild the panel for the same part, e.g. after it failed.
  function refresh() {
    const id = current;
    current = null;
    show(id);
  }

  return { show, refresh };
}
