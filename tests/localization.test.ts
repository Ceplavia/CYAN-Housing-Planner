import { afterEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { availableLocales, initializeLocale, locale, t, translate, type Locale } from '../src/lib/i18n';
import en from '../src/lib/i18n/languages/en.json';

// Every file in languages/ is a locale keyed by filename; furniture.* entries are
// optional display-name overlays and need no English counterpart.
const languageFiles = import.meta.glob('../src/lib/i18n/languages/*.json', { eager: true, import: 'default' }) as Record<string, Record<string, string>>;
const dictionaries = Object.fromEntries(
  Object.entries(languageFiles).map(([path, messages]) => [/([^/\\]+)\.json$/.exec(path)![1], messages]));

afterEach(() => { vi.unstubAllGlobals(); locale.set('en'); });

describe('locale preferences', () => {
  it('preserves user content and substitutes numbers without recursively translating values', () => {
    expect(translate('pt', 'floors.elevation', { name: 'My {value} floor' })).toBe('Elevação de My {value} floor (cm)');
    expect(translate('pt', 'floors.default', { value: 125.5 })).toBe('Usar padrão (125.5 cm)');
    expect(translate('en', 'floors.default', { value: 125.5 })).toBe('Use default (125.5 cm)');
  });
  it('keeps dictionary keys and substitution tokens in agreement across all language files', () => {
    expect(Object.keys(dictionaries).sort()).toEqual([...availableLocales].sort());
    const enKeys = Object.keys(en);
    for (const [code, messages] of Object.entries(dictionaries)) {
      for (const key of enKeys as (keyof typeof en)[]) {
        const value = messages[key];
        expect(value?.trim(), `${code} is missing "${key}"`).not.toBe('');
        expect(value.match(/\{\w+\}/g) ?? [], `${code} "${key}"`).toEqual(en[key].match(/\{\w+\}/g) ?? []);
      }
      for (const key of Object.keys(messages)) {
        expect(enKeys.includes(key) || key.startsWith('furniture.'), `${code} has unknown key "${key}"`).toBe(true);
      }
    }
  });
  it('updates subscribed text, persists the choice and sets document language', () => {
    const setItem = vi.fn();
    vi.stubGlobal('localStorage', { setItem });
    vi.stubGlobal('document', { documentElement: { lang: 'en' } });
    const values: string[] = [];
    const unsubscribe = t.subscribe((translate) => values.push(translate('settings.title')));
    locale.set('pt');
    unsubscribe();
    expect(values).toEqual(['Settings', 'Configurações']);
    expect(setItem).toHaveBeenCalledWith('o3d_locale', 'pt');
    expect(document.documentElement.lang).toBe('pt');
  });
  it('restores valid preferences and ignores unknown persisted locales', () => {
    const getItem = vi.fn().mockReturnValue('pt');
    vi.stubGlobal('localStorage', { getItem, setItem: vi.fn() });
    initializeLocale();
    expect(get(locale)).toBe('pt');
    getItem.mockReturnValue('fr');
    initializeLocale();
    expect(get(locale)).toBe('en');
    locale.set('fr' as Locale);
    expect(get(locale)).toBe('en');
  });
  it('works in memory when storage access throws', () => {
    vi.stubGlobal('localStorage', { getItem() { throw new Error('denied'); }, setItem() { throw new Error('quota'); } });
    expect(() => initializeLocale()).not.toThrow();
    expect(() => locale.set('pt')).not.toThrow();
    expect(get(t)('settings.title')).toBe(translate('pt', 'settings.title'));
  });
});
