import { PARTS } from '../components.ts';
import type { PartAbout } from '../parts/defs.ts';
import type { PartType } from '../types.ts';
import { language, onLanguage, type Language } from './index.ts';

// The parts' descriptions in the interface's language. English lives with
// each part (its info, in src/parts); the other languages are in
// src/i18n/parts/, keyed by part type rather than by the English sentence (a
// description is too long to key by), apart from the interface's dictionaries,
// and loaded only for the language in use. A part without a translation reads
// in English.

export type PartTexts = Record<string, { summary: string; of: string; about?: PartAbout; aboutOf?: string }>;

const LOADERS: Partial<Record<Language, () => Promise<{ default: PartTexts }>>> = {
  de: () => import('./parts/de.ts'),
  es: () => import('./parts/es.ts'),
};

let texts: PartTexts = {};

// Load the descriptions for the language in use (called once the interface's
// language is set, and again whenever it changes).
export async function loadPartTexts() {
  const want = language();
  const loaded = (await LOADERS[want]?.())?.default ?? {};
  if (language() === want) texts = loaded;
}
onLanguage(() => void loadPartTexts());

// What a part is, in one sentence, in the language in use ('' if it has no
// description).
export function partSummary(type: PartType): string {
  return texts[type]?.summary ?? PARTS[type].info?.summary ?? '';
}

// A little more about it (how it works, how Ampage simulates it, what it's
// used for), in the language in use; undefined if it has none.
export function partAbout(type: PartType): PartAbout | undefined {
  return texts[type]?.about ?? PARTS[type].info?.about;
}
