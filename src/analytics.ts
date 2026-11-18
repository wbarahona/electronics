import { isApp } from './platform.ts';

// Anonymous usage counts through GoatCounter (https://www.goatcounter.com):
// cookieless, no personal data, no consent banner needed. Only the published
// web version counts: its build sets VITE_GOATCOUNTER (the counting endpoint,
// see .github/workflows/pages.yml), so local builds, forks and the desktop app
// send nothing. It can be turned off in Settings, and a browser asking not to
// be tracked (Do Not Track) isn't. Events say what was used (a part type, an
// example, Run), never what's in a circuit.

const ENDPOINT = import.meta.env.VITE_GOATCOUNTER as string | undefined;
const SCRIPT = 'https://gc.zgo.at/count.js';

// Whether this build counts at all (for showing the setting).
export const analyticsAvailable = !isApp && !!ENDPOINT;

interface GoatCounter {
  count?: (v: { path: string; title?: string; event?: boolean }) => void;
}

let on = false;
let loading = false;
const waiting: string[] = []; // events before the script has loaded

// Count from now on (or stop): the script loads the first time, and counts
// the visit as it does.
export function setAnalytics(enabled: boolean) {
  on = analyticsAvailable && enabled && navigator.doNotTrack !== '1';
  if (!on || loading) return;
  loading = true;
  const script = document.createElement('script');
  script.async = true;
  script.src = SCRIPT;
  script.dataset.goatcounter = ENDPOINT;
  script.addEventListener('load', () => waiting.splice(0).forEach(track));
  document.head.append(script);
}

// Count an event, by a short path: "part/resistor", "example/doorbell", "run".
export function track(event: string) {
  if (!on) return;
  const gc = (window as { goatcounter?: GoatCounter }).goatcounter;
  if (gc?.count) gc.count({ path: event, title: event, event: true });
  else waiting.push(event);
}
