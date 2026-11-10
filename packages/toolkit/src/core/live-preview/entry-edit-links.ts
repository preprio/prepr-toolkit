import {
  vercelStegaCombine,
  vercelStegaDecode,
  vercelStegaSplit,
} from '@vercel/stega';

import type { LiveListEntry } from './patch';
import { isPlainRecord } from './validate';

/** Writes an edit link into a text value, for a given field path. */
export interface EditLinks {
  encode(text: string, field: string): string;
}

const EDIT_PATH = /\/content\/edit\/[^/?#]+/;

/**
 * Edit links for a new entry's text, so it is click-to-edit before save.
 * Host and locale are copied from an edit link the result already carries;
 * without one (edit mode off) or without `__edit` hints, values stay plain.
 */
export function editLinks(
  result: unknown,
  entry: LiveListEntry,
): EditLinks | null {
  const edit = entry.fields?.__edit;
  if (!isPlainRecord(edit) || typeof edit.item !== 'string') return null;
  return editLinksFor(result, edit.item);
}

// Prepr item ids. Anything else could rewrite the edit link's path.
const ITEM_ID = /^[A-Za-z0-9_-]+$/;

export function editLinksFor(result: unknown, item: string): EditLinks | null {
  if (!ITEM_ID.test(item)) return null;
  const template = findEditLink(result);
  if (!template) return null;
  return {
    encode(text, field) {
      if (vercelStegaSplit(text).encoded) return text;
      let href: URL;
      try {
        href = new URL(template.href);
      } catch {
        return text;
      }
      href.pathname = href.pathname.replace(
        EDIT_PATH,
        () => `/content/edit/${item}`,
      );
      href.searchParams.set('field', field);
      // The editor reads the path with dots and slashes as written.
      const link = href.toString().replace(/%2E/gi, '.').replace(/%2F/gi, '/');
      return vercelStegaCombine(text, { origin: template.origin, href: link });
    },
  };
}

const linkCache = new WeakMap<
  object,
  { origin: string; href: string } | null
>();

function findEditLink(root: unknown): { origin: string; href: string } | null {
  if (root === null || typeof root !== 'object') return null;
  if (linkCache.has(root)) return linkCache.get(root) ?? null;
  let found: { origin: string; href: string } | null = null;
  const seen = new WeakSet<object>();
  const walk = (node: unknown): void => {
    if (found) return;
    if (typeof node === 'string') {
      if (!vercelStegaSplit(node).encoded) return;
      try {
        const decoded = vercelStegaDecode(node) as
          { origin?: unknown; href?: unknown } | undefined;
        if (
          typeof decoded?.origin === 'string' &&
          typeof decoded.href === 'string' &&
          EDIT_PATH.test(decoded.href)
        ) {
          found = { origin: decoded.origin, href: decoded.href };
        }
      } catch {
        // Not a Prepr edit link.
      }
      return;
    }
    if (node === null || typeof node !== 'object' || seen.has(node)) return;
    seen.add(node);
    for (const value of Object.values(node)) walk(value);
  };
  walk(root);
  linkCache.set(root, found);
  return found;
}
