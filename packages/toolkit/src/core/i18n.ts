import en from './locales/en.json';
import nl from './locales/nl.json';

type Dictionary = Record<string, unknown>;

// Adding a locale = drop the JSON in ./locales and add one entry here; Locale,
// LOCALES and isLocale all derive from this object.
const dictionaries = {
  en: en as Dictionary,
  nl: nl as Dictionary,
};

export type Locale = keyof typeof dictionaries;

export const LOCALES = Object.keys(dictionaries) as readonly Locale[];

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && value in dictionaries;
}

function getDict(locale: string): Dictionary {
  return isLocale(locale) ? dictionaries[locale] : dictionaries.en;
}

function getFromPath(obj: unknown, path: string): unknown {
  return path
    .split('.')
    .reduce<unknown>(
      (acc, key) =>
        acc && typeof acc === 'object'
          ? (acc as Record<string, unknown>)[key]
          : undefined,
      obj,
    );
}

function format(message: string, vars?: Record<string, string | number>) {
  if (!vars) return message;
  return Object.keys(vars).reduce(
    (acc, k) => acc.replace(new RegExp(`\\{${k}\\}`, 'g'), String(vars[k])),
    message,
  );
}

/**
 * Translate a dotted key path. Falls back to 'en' for unsupported locales, and
 * returns the key itself when nothing matches.
 */
export function t(
  key: string,
  locale: Locale,
  vars?: Record<string, string | number>,
): string {
  const dict = getDict(locale);
  const msg = getFromPath(dict, key);
  if (typeof msg === 'string') return format(msg, vars);
  return key;
}
