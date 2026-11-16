import { version } from '../package.json';
import { onLanguage, t } from './i18n/index.ts';

// The app's version, from package.json (which the desktop app's version comes
// from too), shown wherever an element has the class app-version: in the
// About dialog (Help in the rail) and at the foot of Settings › Misc.
export const APP_VERSION = version;

export function showVersion() {
  const draw = () => {
    for (const el of document.querySelectorAll('.app-version')) el.textContent = t('Version {version}', { version });
  };
  draw();
  onLanguage(draw);
}
