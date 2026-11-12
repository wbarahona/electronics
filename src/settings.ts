import type { MdDialog } from '@material/web/dialog/dialog.js';
import { LANGUAGES, browserLanguage, initLanguage, onLanguage, setLanguage, t, type Language } from './i18n/index.ts';
import { THEMES, applyTheme, type ThemeId, type ThemeMode } from './theme.ts';

const KEY = 'ampage:settings';

// The drawing standard: EU (IEC / DIN EN 60617 symbols, EN 81346 references)
// is what the app draws; US (ANSI / IEEE 315) is still to come.
export type Norm = 'eu' | 'us';

// What to show when a circuit is opened: all of it, or the view saved with it.
export type OpenView = 'fit' | 'saved';

interface Settings {
  language: Language;
  theme: ThemeId;
  mode: ThemeMode;
  norm: Norm;
  openView: OpenView;
  tolerances: boolean; // simulate parts within their tolerance rather than at their marked values
}
const DEFAULTS: Settings = { language: browserLanguage(), theme: 'green', mode: 'system', norm: 'eu', openView: 'fit', tolerances: false };

function load(): Settings {
  try {
    const saved = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') } as Settings;
    if (!LANGUAGES.some((l) => l.id === saved.language)) saved.language = DEFAULTS.language;
    if (!THEMES.some((theme) => theme.id === saved.theme)) saved.theme = DEFAULTS.theme;
    if (!['system', 'light', 'dark'].includes(saved.mode)) saved.mode = DEFAULTS.mode;
    if (saved.norm !== 'eu') saved.norm = 'eu'; // only EU is available so far
    if (!['fit', 'saved'].includes(saved.openView)) saved.openView = DEFAULTS.openView;
    if (typeof saved.tolerances !== 'boolean') saved.tolerances = DEFAULTS.tolerances;
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

// Settings: an M3 dialog (from the rail) for the language (each named in
// itself), the theme colour (a swatch per theme), light / dark / system mode,
// the drawing standard, the view a circuit opens in and whether parts are
// simulated within their tolerances. `onChange` hears of every change. Changes apply at once and are remembered in this
// browser; the language and theme are applied as the app starts.
export function createSettings(dialog: MdDialog) {
  const settings = load();
  applyTheme(settings.theme, settings.mode);
  initLanguage(settings.language);

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
  for (const radio of radios('mode')) {
    radio.addEventListener('change', () => {
      if (!radio.checked) return;
      settings.mode = radio.value as ThemeMode;
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

  function update() {
    applyTheme(settings.theme, settings.mode);
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
    for (const radio of radios('mode')) radio.checked = radio.value === settings.mode;
    for (const radio of radios('norm')) radio.checked = radio.value === settings.norm;
    for (const radio of radios('open-view')) radio.checked = radio.value === settings.openView;
    for (const radio of radios('tolerances')) radio.checked = radio.value === (settings.tolerances ? 'real' : 'ideal');
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
    onChange: (listener: () => void) => listeners.push(listener),
  };
}
