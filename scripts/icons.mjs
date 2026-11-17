// Downloads the Material Symbols icon font, cut down to the icons Ampage
// uses, into src/fonts (bundled, so the app works offline). Add an icon's
// name to ICONS and run `npm run icons` when the app starts using a new one.
import { writeFile } from 'node:fs/promises';

// Alphabetical, as Google Fonts requires.
const ICONS = [
  '123', 'apps', 'arrow_back', 'arrow_drop_down', 'arrow_selector_tool', 'autorenew', 'avg_pace',
  'battery_charging_full', 'bolt', 'brightness_auto', 'category', 'check', 'check_box_outline_blank', 'close',
  'content_copy', 'content_cut', 'content_paste', 'contrast', 'dark_mode', 'delete', 'developer_board', 'doorbell',
  'draw', 'edit', 'edit_note', 'electrical_services', 'fast_forward', 'fast_rewind', 'filter_center_focus',
  'fit_screen', 'folder', 'folder_open', 'format_color_fill', 'gradient', 'grid_on', 'help', 'history', 'image',
  'keyboard', 'library_add', 'light_mode', 'lightbulb', 'linear_scale', 'memory', 'menu', 'menu_open', 'mode_fan',
  'monitoring', 'more_horiz', 'note_add', 'palette', 'pause', 'play_arrow', 'play_circle', 'power', 'print', 'redo',
  'restart_alt', 'rotate_right', 'save', 'schedule', 'schema', 'school', 'search', 'search_off', 'select_all', 'settings', 'speed',
  'stairs', 'swap_horiz', 'thermostat', 'timer', 'toggle_on', 'touch_app', 'tour', 'translate', 'tune', 'undo',
  'visibility', 'wallpaper', 'zoom_in', 'zoom_out',
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
