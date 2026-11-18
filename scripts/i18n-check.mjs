// Checks the parts' descriptions (`npm run i18n:check`): which are still
// drafts (not yet checked by an engineer: their info has no `reviewed`), which
// parts have none, and for each language which are missing, out of date (the
// English changed since they were translated: their fingerprint no longer
// matches) or for parts that no longer exist. Exits non-zero only when a
// description or translation is missing.
import { PARTS } from '../src/components.ts';
import { aboutFingerprint, fingerprint } from '../src/i18n/fingerprint.ts';

const LANGUAGES = { de: 'German', es: 'Spanish' };

const types = Object.keys(PARTS);
const list = (items) => (items.length ? items.join(', ') : 'none');
let missing = 0;

const none = types.filter((t) => !PARTS[t].info);
const noAbout = types.filter((t) => PARTS[t].info && !PARTS[t].info.about);
const drafts = types.filter((t) => PARTS[t].info && !PARTS[t].info.reviewed);
missing += none.length;
console.log(`Parts: ${types.length}`);
console.log(`  without a description: ${list(none)}`);
console.log(`  without About this part: ${list(noAbout)}`);
console.log(`  drafts (not reviewed yet): ${drafts.length} of ${types.length - none.length}`);
if (drafts.length) console.log(`    ${drafts.join(', ')}`);

for (const [lang, name] of Object.entries(LANGUAGES)) {
  const texts = (await import(`../src/i18n/parts/${lang}.ts`)).default;
  const absent = types.filter((t) => PARTS[t].info && !texts[t]);
  const stale = types.filter((t) => PARTS[t].info && texts[t] && texts[t].of !== fingerprint(PARTS[t].info.summary));
  const aboutAbsent = types.filter((t) => PARTS[t].info?.about && texts[t] && !texts[t].about);
  const aboutStale = types.filter((t) => PARTS[t].info?.about && texts[t]?.about && texts[t].aboutOf !== aboutFingerprint(PARTS[t].info.about));
  const extra = Object.keys(texts).filter((t) => !(t in PARTS));
  missing += absent.length + aboutAbsent.length;
  console.log(`${name} (src/i18n/parts/${lang}.ts):`);
  console.log(`  missing: ${list(absent)}`);
  console.log(`  out of date: ${list(stale)}`);
  console.log(`  About this part missing: ${list(aboutAbsent)}`);
  console.log(`  About this part out of date: ${list(aboutStale)}`);
  console.log(`  for parts that don't exist: ${list(extra)}`);
}

process.exit(missing ? 1 : 0);
