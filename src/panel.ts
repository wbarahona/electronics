import { PARTS, applyPreset, canReset, isChoiceSpec, isModified, resetValues, isSwitchSpec, presetOf, type ChoiceSpec, type NumberSpec, type PropSpec, type SwitchSpec } from './components.ts';
import type { Editor, Live } from './editor.ts';
import type { Circuit } from './model.ts';
import { MODELS } from './sim/models.ts';
import type { Part, PropValue } from './types.ts';
import { formatNumber, parseSI } from './units.ts';

// Side sheet for editing the selected part's values, built from M3 fields.
// Laid out per M3 by window size (in CSS): a standard side sheet docked
// beside the board when wide, a modal side sheet over it (with a scrim) when
// medium, a modal bottom sheet (with a drag handle) on phones. Its header
// holds the part's name and the close button, the body scrolls, and Reset
// sits in the action area at the bottom.
// Shown while exactly one part is selected; its close button, or Esc from
// inside it, deselects the part (an open dropdown takes the Esc first).
export function createPanel(el: HTMLElement, circuit: Circuit, editor: Pick<Editor, 'refreshPart' | 'deselect'>) {
  let current: string | null = null;

  // The scrim behind it when it's modal: a click there closes it.
  const scrim = document.createElement('div');
  scrim.className = 'props-scrim';
  scrim.addEventListener('click', () => editor.deselect());
  el.before(scrim);

  // The bottom sheet's drag handle: drag it down to dismiss.
  const handle = document.createElement('div');
  handle.className = 'props-handle';
  handle.setAttribute('aria-hidden', 'true');
  handle.addEventListener('pointerdown', (e) => {
    const start = e.clientY;
    handle.setPointerCapture(e.pointerId);
    el.classList.add('dragging');
    const move = (ev: PointerEvent) => (el.style.translate = `0 ${Math.max(0, ev.clientY - start)}px`);
    const up = (ev: PointerEvent) => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      handle.removeEventListener('pointercancel', up);
      el.classList.remove('dragging');
      el.style.translate = '';
      if (ev.clientY - start > 80) editor.deselect();
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
    handle.addEventListener('pointercancel', up);
  });

  function setOpen(open: boolean) {
    el.classList.toggle('open', open);
    el.inert = !open;
    el.setAttribute('aria-hidden', String(!open));
  }
  setOpen(false);

  el.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || e.composedPath().some((n) => n instanceof Element && n.matches('md-menu'))) return;
    e.preventDefault();
    editor.deselect();
  });

  // The panel edits values by name, whatever the part type.
  const value = (c: Part, key: string) => (c.props as Record<string, PropValue>)[key];

  function set(c: Part, key: string, v: PropValue) {
    (c.props as Record<string, PropValue>)[key] = v;
    editor.refreshPart(c.id);
    if (partSelect) partSelect.supportingText = partNote(c);
    markModified(c);
  }

  // Reset, at the bottom: back to the part number's datasheet values (or the
  // part's defaults), at once — it's undoable. An M3 outlined button in the
  // error colour role, enabled only when there's something to reset.
  let reset: (HTMLElement & { disabled: boolean }) | null = null;

  function resetButton(c: Part) {
    const button = document.createElement('md-outlined-button');
    button.className = 'props-reset';
    button.innerHTML = '<md-icon slot="icon">restart_alt</md-icon>Reset';
    button.title = presetOf(c.type, c.props) ? 'Back to the datasheet values' : 'Back to the default values';
    button.addEventListener('click', () => {
      Object.assign(c.props, resetValues(c.type, c.props));
      editor.refreshPart(c.id);
      refresh();
    });
    reset = button;
    return button;
  }

  // A part with a part number: badge each setting that differs from the
  // datasheet (an M3 small badge in the accent colour), and colour the Part
  // number note to match while anything does.
  function markModified(c: Part) {
    const preset = presetOf(c.type, c.props);
    for (const wrap of el.querySelectorAll<HTMLElement>('.prop-field')) {
      const key = wrap.dataset.key!;
      const datasheet = preset?.values[key as keyof typeof preset.values];
      wrap.classList.toggle('modified', datasheet !== undefined && value(c, key) !== datasheet);
    }
    partSelect?.classList.toggle('modified', isModified(c.type, c.props));
    if (reset) reset.disabled = !canReset(c.type, c.props);
  }

  // A part with part numbers: its Part number field, whose supporting text
  // says what the part is, or that its values have been changed from it.
  let partSelect: (HTMLElement & { supportingText: string }) | null = null;

  function partNote(c: Part): string {
    const preset = presetOf(c.type, c.props);
    if (!preset) return 'No particular part: the values are your own';
    return isModified(c.type, c.props) ? `Modified: differs from the ${preset.code} datasheet` : preset.note;
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
    if (key === 'partNumber') {
      // Picking a part number brings in its values; show them.
      partSelect = select;
      select.supportingText = partNote(c);
      select.addEventListener('change', () => {
        applyPreset(c.type, c.props, select.value);
        editor.refreshPart(c.id);
        refresh();
      });
      return select;
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
      setOpen(false); // its contents stay while it slides away
      return;
    }
    level = null;
    partSelect = null;
    const heading = document.createElement('h2');
    const ref = document.createElement('span');
    ref.className = 'ref';
    ref.textContent = `-${c.ref}`;
    heading.append(ref, ` ${PARTS[c.type].name}`);
    const close = document.createElement('md-icon-button');
    close.title = 'Close (Esc)';
    close.ariaLabel = 'Close';
    close.innerHTML = '<md-icon>close</md-icon>';
    close.addEventListener('click', () => editor.deselect());
    const head = document.createElement('div');
    head.className = 'props-head';
    head.append(heading, close);
    const body = document.createElement('div');
    body.className = 'props-body';
    body.append(
      ...(c.broken ? [brokenNotice(c)] : []),
      ...(PARTS[c.type].gauge ? [chargeRow(c)] : []),
      ...Object.entries(PARTS[c.type].props)
        .filter(([, spec]) => !spec.hidden)
        .map(([key, spec]) => {
          // Each setting in a wrapper that can carry a badge (see markModified).
          const wrap = document.createElement('div');
          wrap.className = 'prop-field';
          wrap.dataset.key = key;
          wrap.append(field(c, key, spec));
          return wrap;
        }),
    );
    const actions = document.createElement('div');
    actions.className = 'props-actions';
    actions.append(resetButton(c));
    el.replaceChildren(handle, head, body, actions);
    markModified(c);
    setOpen(true);
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
