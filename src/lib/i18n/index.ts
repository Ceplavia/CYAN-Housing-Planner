import { derived, writable } from 'svelte/store';
import enMessages from './languages/en.json';

export type TranslationKey = keyof typeof enMessages;
type Dictionary = Record<string, string>;

// Every JSON file in languages/ becomes an available locale; the filename is the locale code.
const languageFiles = import.meta.glob('./languages/*.json', { eager: true, import: 'default' });
const dictionaries: Record<string, Dictionary> = {};
for (const [path, messages] of Object.entries(languageFiles)) {
  const code = /([^/\\]+)\.json$/.exec(path)?.[1];
  if (code && messages) dictionaries[code] = messages as Dictionary;
}

export type Locale = string;
export const availableLocales: Locale[] = Object.keys(dictionaries)
  .sort((a, b) => (a === 'en' ? -1 : b === 'en' ? 1 : a.localeCompare(b)));
const preference = writable<Locale>('en');
const isLocale = (value: unknown): value is Locale =>
  typeof value === 'string' && Object.hasOwn(dictionaries, value);

export function translate(language: Locale, key: TranslationKey, variables: Record<string, string | number> = {}): string {
  // Missing keys fall back to English so new locales can be translated incrementally.
  const template = dictionaries[language]?.[key] ?? enMessages[key];
  // Single-pass substitution preserves literal braces in user-provided values.
  return template.replace(/\{(\w+)\}/g, (token, name) =>
    Object.hasOwn(variables, name) ? String(variables[name]) : token);
}

/** Optional overlay lookup (e.g. `furniture.*` names) without English fallback. */
export function lookup(language: Locale, key: string): string | undefined {
  return dictionaries[language]?.[key];
}

/** Each file names itself via `language.name`; falls back to the locale code. */
export function localeName(language: Locale): string {
  return dictionaries[language]?.['language.name'] ?? language;
}

/** BCP-47 tag for Intl date/time APIs via `language.intlLocale`; falls back to the locale code. */
export function intlLocale(language: Locale): string {
  return dictionaries[language]?.['language.intlLocale'] ?? language;
}

export const locale = {
  subscribe: preference.subscribe,
  set(value: Locale) {
    if (!isLocale(value)) return;
    preference.set(value);
    if (typeof document !== 'undefined') document.documentElement.lang = value;
    try { localStorage.setItem('o3d_locale', value); } catch { /* In-memory choice still works. */ }
  },
};

/** Run after hydration; SSR and the first client render always agree on English. */
export function initializeLocale() {
  let saved: unknown;
  try { saved = localStorage.getItem('o3d_locale'); } catch { /* Storage can be disabled. */ }
  // Keep English until the remaining interface has been translated; users opt in.
  locale.set(isLocale(saved) ? saved : 'en');
}

/** Svelte's $t subscription updates labels without remounting dialogs or inputs. */
export const t = derived(preference, (language) =>
  (key: TranslationKey, variables?: Record<string, string | number>) => translate(language, key, variables));
