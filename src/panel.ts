import { PARTS, isChoiceSpec, isSwitchSpec, type ChoiceSpec, type NumberSpec, type PropSpec, type SwitchSpec } from './components.ts';
import type { Editor } from './editor.ts';
import type { Circuit } from './model.ts';
import { MODELS } from './sim/models.ts';
import type { Part, PropValue } from './types.ts';
import { formatNumber, parseSI } from './units.ts';

// Side sheet for editing the selected part's values, built from M3 fields.
// Shown while exactly one part is selected.
export function createPanel(el: HTMLElement, circuit: Circuit, editor: Pick<Editor, 'refreshPart'>) {
  let current: string | null = null;

  // The panel edits values by name, whatever the part type.
  const value = (c: Part, key: string) => (c.props as Record<string, PropValue>)[key];

  function set(c: Part, key: string, v: PropValue) {
    (c.props as Record<string, PropValue>)[key] = v;
    editor.refreshPart(c.id);
  }

  // Outlined text field with the unit as suffix. Commits on Enter or leaving
  // the field; bad input is flagged and not applied, and leaving restores the
  // current value.
  function numberInput(c: Part, key: string, spec: NumberSpec) {
    const field = document.createElement('md-outlined-text-field');
    field.label = spec.label;
    field.suffixText = spec.unit;
    field.inputMode = 'decimal';
    field.value = formatNumber(value(c, key) as number);
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
      field.value = formatNumber(value(c, key) as number);
    });
    return field;
  }

  function choiceInput(c: Part, key: string, spec: ChoiceSpec) {
    const select = document.createElement('md-outlined-select');
    select.label = spec.label;
    for (const name of spec.options) {
      const option = document.createElement('md-select-option');
      option.value = name;
      option.selected = name === value(c, key);
      const headline = document.createElement('div');
      headline.slot = 'headline';
      headline.textContent = name;
      option.append(headline);
      select.append(option);
    }
    select.addEventListener('change', () => set(c, key, select.value));
    return select;
  }

  // On/off values get an M3 switch with its label beside it.
  function switchInput(c: Part, key: string, spec: SwitchSpec) {
    const label = document.createElement('label');
    label.className = 'field check';
    const name = document.createElement('span');
    name.textContent = spec.label;
    const toggle = document.createElement('md-switch');
    toggle.selected = value(c, key) as boolean;
    toggle.addEventListener('change', () => set(c, key, toggle.selected));
    label.append(name, toggle);
    return label;
  }

  function field(c: Part, key: string, spec: PropSpec) {
    if (isSwitchSpec(spec)) return switchInput(c, key, spec);
    return isChoiceSpec(spec) ? choiceInput(c, key, spec) : numberInput(c, key, spec);
  }

  function show(id: string | null) {
    if (id === current) return;
    current = id;
    const c = id === null ? undefined : circuit.part(id);
    if (!c) {
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
  function brokenNotice(c: Part) {
    const notice = document.createElement('div');
    notice.className = 'broken-notice';
    const text = document.createElement('span');
    const label = MODELS[c.type].failure?.label ?? 'broken';
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
