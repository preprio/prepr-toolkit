import { describe, expect, it } from 'vitest';

import { t } from './i18n';

describe('t', () => {
  it('returns the English label for a real key from en.json', () => {
    expect(t('adaptiveContent.enablePreview', 'en')).toBe('Preview mode');
  });

  it('returns the Dutch label for a real key from nl.json', () => {
    expect(t('adaptiveContent.enablePreview', 'nl')).toBe('Preview modus');
  });

  it('falls back to en for an unknown locale', () => {
    // @ts-expect-error - intentionally passing an unsupported locale to verify fallback
    expect(t('adaptiveContent.enablePreview', 'fr')).toBe('Preview mode');
  });

  it('returns the key itself when the key path is not found', () => {
    expect(t('does.not.exist', 'en')).toBe('does.not.exist');
  });
});
