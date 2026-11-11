import type { MdDialog } from '@material/web/dialog/dialog.js';
import { THEMES, applyTheme, type ThemeId, type ThemeMode } from './theme.ts';

const KEY = 'ampage:settings';

// The drawing standard: EU (IEC / DIN EN 60617 symbols, EN 81346 references)
// is what the app draws; US (ANSI / IEEE 315) is still to come.
export type Norm = 'eu' | 'us';

interface Settings {
  theme: ThemeId;
  mode: ThemeMode;
  norm: Norm;
}
const DEFAULTS: Settings = { theme: 'green', mode: 'system', norm: 'eu' };

function load(): Settings {
  try {
    const saved = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') } as Settings;
    if (!THEMES.some((t) => t.id === saved.theme)) saved.theme = DEFAULTS.theme;
    if (!['system', 'light', 'dark'].includes(saved.mode)) saved.mode = DEFAULTS.mode;
    if (saved.norm !== 'eu') saved.norm = 'eu'; // only EU is available so far
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

// Settings: an M3 dialog (from the rail) for the theme colour (a swatch per
// theme), light / dark / system mode and the drawing standard. Changes apply
// at once and are remembered in this browser; the theme is applied as the
// app starts.
export function createSettings(dialog: MdDialog) {
  const settings = load();
  applyTheme(settings.theme, settings.mode);

  const swatches = dialog.querySelector<HTMLElement>('.theme-swatches')!;
  swatches.replaceChildren(
    ...THEMES.map((theme) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'theme-swatch';
      button.setAttribute('role', 'radio');
      button.dataset.theme = theme.id;
      button.title = theme.label;
      button.style.setProperty('--swatch', theme.seed);
      button.innerHTML = `
        <span class="theme-swatch-color"><md-focus-ring></md-focus-ring><md-ripple></md-ripple><md-icon>check</md-icon></span>
        <span class="theme-swatch-label">${theme.label}</span>`;
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

  function update() {
    applyTheme(settings.theme, settings.mode);
    store(settings);
    show();
  }

  // The dialog's controls as the settings are.
  function show() {
    for (const swatch of swatches.querySelectorAll<HTMLElement>('.theme-swatch')) {
      swatch.setAttribute('aria-checked', String(swatch.dataset.theme === settings.theme));
    }
    for (const radio of radios('mode')) radio.checked = radio.value === settings.mode;
    for (const radio of radios('norm')) radio.checked = radio.value === settings.norm;
  }
  show();

  return {
    open: () => dialog.show(),
    get norm() {
      return settings.norm;
    },
  };
}
