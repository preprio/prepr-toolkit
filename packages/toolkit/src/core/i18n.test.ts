import { describe, expect, it } from 'vitest';

import de from './locales/de.json';
import en from './locales/en.json';
import { LOCALES, t } from './i18n';

/** Every dotted key path that ends in a string. */
function keyPaths(obj: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([key, value]) =>
    value && typeof value === 'object'
      ? keyPaths(value as Record<string, unknown>, `${prefix}${key}.`)
      : [`${prefix}${key}`],
  );
}

describe('t', () => {
  it('returns the English label for a real key from en.json', () => {
    expect(t('adaptiveContent.enablePreview', 'en')).toBe('Preview mode');
  });

  it('returns the Dutch label for a real key from nl.json', () => {
    expect(t('adaptiveContent.enablePreview', 'nl')).toBe('Preview modus');
  });

  it('falls back to en for an unknown locale', () => {
    // @ts-expect-error - intentionally passing an unsupported locale to verify fallback
    expect(t('adaptiveContent.enablePreview', 'es')).toBe('Preview mode');
  });

  it('returns the key itself when the key path is not found', () => {
    expect(t('does.not.exist', 'en')).toBe('does.not.exist');
  });

  it('translates every English key in every supported locale', () => {
    for (const locale of LOCALES) {
      for (const key of keyPaths(en)) {
        expect(t(key, locale), `${locale}: ${key}`).not.toBe(key);
      }
    }
  });

  it('has German for every English key and nothing more', () => {
    expect(keyPaths(de).sort()).toEqual(keyPaths(en).sort());
    expect(t('visualEditor.linkedItem', 'de')).toBe('verknüpftes Element');
  });
});
