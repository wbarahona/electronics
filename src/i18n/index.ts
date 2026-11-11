import de from './de.ts';
import es from './es.ts';

// The interface's languages (Settings), each named in itself. English is the
// source: every text in the code and index.html is written in English, and
// that English is the key into the other languages' dictionaries (es.ts,
// de.ts). A text missing from a dictionary shows in English.
export const LANGUAGES = [
  { id: 'en', label: 'English' },
  { id: 'es', label: 'Español' },
  { id: 'de', label: 'Deutsch' },
] as const;
export type Language = (typeof LANGUAGES)[number]['id'];

// English text → translation. {name} marks a value filled in by t().
export type Dictionary = Record<string, string>;
const DICTIONARIES: Record<Language, Dictionary> = { en: {}, es, de };

let current: Language = 'en';
const listeners: (() => void)[] = [];

export const language = () => current;

// The language the browser prefers, if it's one of ours.
export function browserLanguage(): Language {
  const code = navigator.language.slice(0, 2);
  return LANGUAGES.find((l) => l.id === code)?.id ?? 'en';
}

// `text` in the current language, with {name}s filled from `values`.
export function t(text: string, values?: Record<string, string | number>): string {
  const out = DICTIONARIES[current][text] ?? text;
  return values ? out.replace(/\{(\w+)\}/g, (all, name: string) => (name in values ? String(values[name]) : all)) : out;
}

// Switch language: index.html's texts change in place, then each listener
// (see onLanguage) redraws what it built.
export function setLanguage(id: Language) {
  current = id;
  document.documentElement.lang = id;
  for (const { node, attr, source } of statics) {
    if (attr) (node as Element).setAttribute(attr, t(source));
    else node.textContent = node.textContent!.replace(node.textContent!.trim(), t(source));
  }
  if (ready) for (const listener of listeners) listener();
}

// Run `redraw` whenever the language changes, for text built in code.
export const onLanguage = (redraw: () => void) => listeners.push(redraw);

// index.html's translatable texts (text and the attributes below), noted with
// their English once, as the page loads, before code adds anything.
const ATTRS = ['title', 'aria-label', 'placeholder', 'label', 'supporting-text'];
const statics: { node: Node; attr?: string; source: string }[] = [];
let ready = false;

export function initLanguage(id: Language) {
  const known = (text: string) => text in es || text in de;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.nodeType === Node.TEXT_NODE) {
      if (node.parentElement?.localName === 'md-icon') continue; // icon names, not words
      const source = node.textContent!.trim();
      if (source && known(source)) statics.push({ node, source });
      continue;
    }
    for (const attr of ATTRS) {
      const source = (node as Element).getAttribute(attr);
      if (source && known(source)) statics.push({ node, attr, source });
    }
  }
  setLanguage(id);
  ready = true;
}
