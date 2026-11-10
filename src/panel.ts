import { PARTS, isChoiceSpec, isSwitchSpec, type ChoiceSpec, type NumberSpec, type PropSpec, type SwitchSpec } from './components.ts';
import type { Editor, Live } from './editor.ts';
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

  // An M3 slider for values with a natural range (positions, ambient light),
  // applied live as it moves.
  function sliderInput(c: Part, key: string, spec: NumberSpec) {
    const row = document.createElement('div');
    row.className = 'slider-field';
    const head = document.createElement('div');
    head.className = 'slider-head';
    const name = document.createElement('span');
    name.textContent = spec.label;
    const shown = document.createElement('span');
    shown.className = 'slider-value';
    head.append(name, shown);
    const slider = document.createElement('md-slider');
    slider.min = spec.min ?? 0;
    slider.max = spec.max ?? 100;
    slider.labeled = true;
    slider.value = value(c, key) as number;
    const show = () => {
      shown.textContent = `${Math.round(slider.value ?? 0)} ${spec.unit}`;
    };
    slider.addEventListener('input', () => {
      show();
      set(c, key, slider.value ?? 0);
    });
    show();
    row.append(head, slider);
    return row;
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
    if (isChoiceSpec(spec)) return choiceInput(c, key, spec);
    return spec.slider ? sliderInput(c, key, spec) : numberInput(c, key, spec);
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
    level = null;
    const heading = document.createElement('h2');
    const ref = document.createElement('span');
    ref.className = 'ref';
    ref.textContent = `-${c.ref}`;
    heading.append(ref, ` ${PARTS[c.type].name}`);
    el.replaceChildren(
      heading,
      ...(c.broken ? [brokenNotice(c)] : []),
      ...(PARTS[c.type].gauge ? [chargeRow(c)] : []),
      ...Object.entries(PARTS[c.type].props)
        .filter(([, spec]) => !spec.hidden)
        .map(([key, spec]) => field(c, key, spec)),
    );
    el.hidden = false;
    showLive();
  }

  // How full an energy store is, kept live by showLive(); batteries also get a
  // button to recharge them.
  let level: { bar: HTMLElement & { value: number }; text: HTMLElement } | null = null;
  let latest: Live = new Map(); // so a freshly opened panel shows values at once

  function chargeRow(c: Part) {
    const row = document.createElement('div');
    row.className = 'charge';
    const head = document.createElement('div');
    head.className = 'charge-head';
    const name = document.createElement('span');
    name.textContent = 'Charge';
    const text = document.createElement('span');
    text.className = 'charge-value';
    head.append(name, text);
    const bar = document.createElement('md-linear-progress');
    row.append(head, bar);
    if ('charge' in c.props) {
      const recharge = document.createElement('md-outlined-button');
      recharge.innerHTML = '<md-icon slot="icon">battery_charging_full</md-icon>Recharge';
      recharge.addEventListener('click', () => set(c, 'charge', 1));
      row.append(recharge);
    }
    level = { bar, text };
    return row;
  }

  function showLive(live: Live = latest) {
    latest = live;
    const l = current === null ? undefined : live.get(current)?.level;
    if (!level || l === undefined) return;
    level.bar.value = l;
    level.text.textContent = `${Math.round(l * 100)} %`;
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

  return { show, refresh, showLive };
}
