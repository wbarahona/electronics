// Downloads the Material Symbols icon font, cut down to the icons Ampage
// uses, into src/fonts (bundled, so the app works offline). Add an icon's
// name to ICONS and run `npm run icons` when the app starts using a new one.
import { writeFile } from 'node:fs/promises';

// Alphabetical, as Google Fonts requires.
const ICONS = [
  'arrow_drop_down', 'autorenew', 'avg_pace', 'battery_charging_full', 'bolt', 'check', 'close', 'content_copy',
  'content_cut', 'content_paste', 'delete', 'developer_board', 'doorbell', 'draw', 'electrical_services',
  'fast_forward', 'fast_rewind', 'filter_center_focus', 'fit_screen', 'folder', 'folder_open', 'gradient', 'image',
  'library_add', 'lightbulb', 'linear_scale', 'link', 'memory', 'menu', 'menu_open', 'mode_fan', 'monitoring',
  'more_horiz', 'note_add', 'palette', 'pause', 'play_arrow', 'power', 'print', 'redo', 'restart_alt', 'save',
  'schedule', 'school', 'search', 'settings', 'speed', 'stairs', 'sticky_note_2', 'thermostat', 'timer', 'toggle_on',
  'undo', 'wallpaper', 'zoom_in', 'zoom_out',
];
const OUT = new URL('../src/fonts/material-symbols-outlined.woff2', import.meta.url);

const sorted = [...ICONS].sort();
if (sorted.join() !== ICONS.join()) throw new Error('ICONS must be in alphabetical order.');
const css = await fetch(
  `https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&icon_names=${ICONS.join(',')}&display=block`,
  // A current browser's user agent, or Google serves an older format.
  { headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36' } },
).then((r) => r.text());
const url = css.match(/url\((https:[^)]+)\) format\('woff2'\)/)?.[1];
if (!url) throw new Error(`No woff2 in the Google Fonts response:\n${css}`);
const font = Buffer.from(await fetch(url).then((r) => r.arrayBuffer()));
await writeFile(OUT, font);
console.log(`${ICONS.length} icons, ${(font.length / 1024).toFixed(1)} KB → src/fonts/material-symbols-outlined.woff2`);
