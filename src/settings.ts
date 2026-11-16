import type { MdDialog } from '@material/web/dialog/dialog.js';
import { LANGUAGES, browserLanguage, initLanguage, onLanguage, setLanguage, t, type Language } from './i18n/index.ts';
import { confirmDialog } from './confirm.ts';
import { setNorm, type Norm } from './norm.ts';
import { setDecimalMark } from './units.ts';
import { THEMES, applyTheme, type ThemeId, type ThemeMode } from './theme.ts';

const KEY = 'ampage:settings';


// What to show when a circuit is opened: all of it, or the view saved with it.
export type OpenView = 'fit' | 'saved';

// How numbers are written: the language's way (a comma in German and
// Spanish), or always a point or a comma.
export type Decimal = 'auto' | 'point' | 'comma';

// The board's grid: lines, dots or none.
export type Grid = 'lines' | 'dots' | 'none';

// Which way the current-flow dots move: + to − (conventional current) or
// − to + (the electrons).
export type Flow = 'conventional' | 'electron';

interface Settings {
  language: Language;
  theme: ThemeId;
  mode: ThemeMode;
  norm: Norm;
  openView: OpenView;
  tolerances: boolean; // simulate parts within their tolerance rather than at their marked values
  readout: boolean; // show live values in a tooltip over the part or wire under the pointer
  tips: boolean; // show a tip of the day as the app starts
  decimal: Decimal;
  grid: Grid;
  flow: Flow;
  flowDots: boolean; // animate current along the wires
  sound: boolean; // sounders are heard while running
  burnOut: boolean; // overloaded parts fail
  temperatures: boolean; // ambient temperature, heat between parts, fans cooling
  autoRun: boolean; // start running when a circuit is opened
}

// The choices each setting allows (true/false ones are checked as booleans).
const CHOICES: Partial<Record<keyof Settings, readonly string[]>> = {
  mode: ['system', 'light', 'dark'],
  norm: ['eu', 'us'],
  openView: ['fit', 'saved'],
  decimal: ['auto', 'point', 'comma'],
  grid: ['lines', 'dots', 'none'],
  flow: ['conventional', 'electron'],
};
const DEFAULTS: Settings = { language: browserLanguage(), theme: 'green', mode: 'system', norm: 'eu', openView: 'fit', tolerances: false, readout: true, tips: true,
  decimal: 'auto', grid: 'lines', flow: 'conventional', flowDots: true, sound: true, burnOut: true, temperatures: true, autoRun: false,
};

function load(): Settings {
  try {
    const saved = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') } as Settings;
    if (!LANGUAGES.some((l) => l.id === saved.language)) saved.language = DEFAULTS.language;
    if (!THEMES.some((theme) => theme.id === saved.theme)) saved.theme = DEFAULTS.theme;
    const fix = saved as unknown as Record<string, unknown>;
    for (const [key, value] of Object.entries(DEFAULTS)) {
      const ok = typeof value === 'boolean' ? typeof fix[key] === 'boolean' : !CHOICES[key as keyof Settings] || CHOICES[key as keyof Settings]!.includes(fix[key] as string);
      if (!ok) fix[key] = value;
    }
    return saved;
  } catch {
    return { ...DEFAULTS };
  }
}

function store(settings: Settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // no storage here: settings last until the page is closed
  }
}

// Settings: an M3 dialog (from the rail) with its options in four tabs.
// Appearance: the language (each named in itself), the theme colour (a swatch
// per theme), light / dark / system mode. Board: the drawing standard and the
// view a circuit opens in. Simulation: whether parts are simulated within their
// tolerances, which way and whether current flow moves, sound, burning out
// and starting to run on opening. Misc: the tip of the day at startup and
// resetting everything. Appearance also has how numbers are written; Board
// the grid and whether hovering shows live values. `onChange` hears of every
// change. Changes apply at once and are remembered in this browser; the
// language and theme are applied as the app starts.
export function createSettings(dialog: MdDialog) {
  const settings = load();
  applyTheme(settings.theme, settings.mode);
  initLanguage(settings.language);
  setNorm(settings.norm);
  applyNumbers();

  // The decimal mark for the setting, and for "auto" the language's own.
  function applyNumbers() {
    const comma = settings.decimal === 'comma' || (settings.decimal === 'auto' && settings.language !== 'en');
    setDecimalMark(comma ? ',' : '.');
  }

  const languages = dialog.querySelector<HTMLElement>('.settings-languages')!;
  languages.innerHTML = LANGUAGES.map(
    (l) => `<label class="settings-radio" lang="${l.id}"><md-radio name="language" value="${l.id}" touch-target="wrapper"></md-radio>${l.label}</label>`,
  ).join('');

  const swatches = dialog.querySelector<HTMLElement>('.theme-swatches')!;
  swatches.replaceChildren(
    ...THEMES.map((theme) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'theme-swatch';
      button.setAttribute('role', 'radio');
      button.dataset.theme = theme.id;
      button.title = t(theme.label);
      button.style.setProperty('--swatch', theme.seed);
      button.innerHTML = `
        <span class="theme-swatch-color"><md-focus-ring></md-focus-ring><md-ripple></md-ripple><md-icon>check</md-icon></span>
        <span class="theme-swatch-label">${t(theme.label)}</span>`;
      button.addEventListener('click', () => {
        settings.theme = theme.id;
        update();
      });
      return button;
    }),
  );

  const radios = (name: string) => [...dialog.querySelectorAll<HTMLElement & { value: string; checked: boolean }>(`md-radio[name="${name}"]`)];
  // Mode: a segmented button (system / light / dark), each with its icon.
  const modes = [...dialog.querySelectorAll<HTMLElement & { selected: boolean }>('.settings-mode [data-mode]')];
  dialog.querySelector('.settings-mode')!.addEventListener('segmented-button-set-selection', (e) => {
    const { button, selected } = (e as CustomEvent<{ button: HTMLElement; selected: boolean }>).detail;
    if (!selected) return;
    settings.mode = button.dataset.mode as ThemeMode;
    update();
  });

  // Tabs: one group of settings (appearance, board, simulation) at a time.
  const tabs = dialog.querySelector<HTMLElement & { activeTabIndex: number }>('.settings-tabs')!;
  tabs.addEventListener('change', () => {
    for (const [i, tab] of [...tabs.querySelectorAll('md-primary-tab')].entries()) {
      dialog.querySelector<HTMLElement>(`#${tab.getAttribute('aria-controls')}`)!.hidden = i !== tabs.activeTabIndex;
    }
  });

  for (const radio of radios('norm')) {
    radio.addEventListener('change', () => {
      if (!radio.checked) return;
      settings.norm = radio.value as Norm;
      setNorm(settings.norm); // redraws the board, tray and panel (onNorm)
      update();
    });
  }

  for (const radio of radios('tolerances')) {
    radio.addEventListener('change', () => {
      if (!radio.checked) return;
      settings.tolerances = radio.value === 'real';
      update();
    });
  }

  for (const radio of radios('readout')) {
    radio.addEventListener('change', () => {
      if (!radio.checked) return;
      settings.readout = radio.value === 'show';
      update();
    });
  }

  for (const radio of radios('tips')) {
    radio.addEventListener('change', () => {
      if (!radio.checked) return;
      settings.tips = radio.value === 'show';
      update();
    });
  }

  for (const radio of radios('open-view')) {
    radio.addEventListener('change', () => {
      if (!radio.checked) return;
      settings.openView = radio.value as OpenView;
      update();
    });
  }

  for (const radio of radios('language')) {
    radio.addEventListener('change', () => {
      if (!radio.checked) return;
      settings.language = radio.value as Language;
      setLanguage(settings.language);
      update();
    });
  }

  // The swatches' names follow the language.
  onLanguage(() => {
    for (const swatch of swatches.querySelectorAll<HTMLElement>('.theme-swatch')) {
      const theme = THEMES.find((th) => th.id === swatch.dataset.theme)!;
      swatch.title = swatch.querySelector('.theme-swatch-label')!.textContent = t(theme.label);
    }
  });

  const listeners: (() => void)[] = [];

  // On / off settings: an M3 switch each, named by data-setting.
  const switches = [...dialog.querySelectorAll<HTMLElement & { selected: boolean }>('md-switch[data-setting]')];
  for (const sw of switches) {
    sw.addEventListener('change', () => {
      (settings as unknown as Record<string, boolean>)[sw.dataset.setting!] = sw.selected;
      update();
    });
  }

  // Few-option settings shown as a segmented button (data-setting on the set,
  // data-value on each button).
  const segments = [...dialog.querySelectorAll<HTMLElement>('md-outlined-segmented-button-set[data-setting]')];
  for (const set of segments) {
    set.addEventListener('segmented-button-set-selection', (e) => {
      const { button, selected } = (e as CustomEvent<{ button: HTMLElement; selected: boolean }>).detail;
      if (!selected) return;
      (settings as unknown as Record<string, string>)[set.dataset.setting!] = button.dataset.value!;
      update();
    });
  }

  for (const radio of radios('flow')) {
    radio.addEventListener('change', () => {
      if (!radio.checked) return;
      settings.flow = radio.value as Flow;
      update();
    });
  }

  // Reset all: every setting as Ampage starts out, after asking; the language
  // stays as chosen.
  dialog.querySelector('#settings-reset')!.addEventListener('click', async () => {
    const ok = await confirmDialog({
      headline: t('Reset settings to defaults?'),
      message: t('Every setting except the language goes back to how Ampage starts out. Your circuit isn’t touched.'),
      action: t('Reset'),
    });
    if (!ok) return;
    Object.assign(settings, { ...DEFAULTS, language: settings.language });
    setNorm(settings.norm);
    update();
  });

  function update() {
    applyTheme(settings.theme, settings.mode);
    applyNumbers();
    store(settings);
    show();
    for (const listener of listeners) listener();
  }

  // The dialog's controls as the settings are.
  function show() {
    for (const swatch of swatches.querySelectorAll<HTMLElement>('.theme-swatch')) {
      swatch.setAttribute('aria-checked', String(swatch.dataset.theme === settings.theme));
    }
    for (const radio of radios('language')) radio.checked = radio.value === settings.language;
    for (const mode of modes) mode.selected = mode.dataset.mode === settings.mode;
    for (const radio of radios('norm')) radio.checked = radio.value === settings.norm;
    for (const radio of radios('open-view')) radio.checked = radio.value === settings.openView;
    for (const radio of radios('tolerances')) radio.checked = radio.value === (settings.tolerances ? 'real' : 'ideal');
    for (const radio of radios('flow')) radio.checked = radio.value === settings.flow;
    for (const sw of switches) sw.selected = (settings as unknown as Record<string, boolean>)[sw.dataset.setting!];
    for (const set of segments) {
      for (const button of set.querySelectorAll<HTMLElement & { selected: boolean }>('[data-value]')) {
        button.selected = button.dataset.value === (settings as unknown as Record<string, string>)[set.dataset.setting!];
      }
    }
    for (const radio of radios('tips')) radio.checked = radio.value === (settings.tips ? 'show' : 'hide');
    for (const radio of radios('readout')) radio.checked = radio.value === (settings.readout ? 'show' : 'hide');
  }
  show();

  return {
    open: () => dialog.show(),
    get norm() {
      return settings.norm;
    },
    get openView() {
      return settings.openView;
    },
    get tolerances() {
      return settings.tolerances;
    },
    get readout() {
      return settings.readout;
    },
    set readout(on: boolean) {
      settings.readout = on;
      update();
    },
    get tips() {
      return settings.tips;
    },
    set tips(on: boolean) {
      settings.tips = on;
      update();
    },
    get grid() {
      return settings.grid;
    },
    get flow() {
      return settings.flow;
    },
    get flowDots() {
      return settings.flowDots;
    },
    get sound() {
      return settings.sound;
    },
    get burnOut() {
      return settings.burnOut;
    },
    get temperatures() {
      return settings.temperatures;
    },
    get autoRun() {
      return settings.autoRun;
    },
    onChange: (listener: () => void) => listeners.push(listener),
  };
}
