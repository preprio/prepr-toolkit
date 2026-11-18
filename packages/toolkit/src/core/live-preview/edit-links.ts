import { isObject } from './guards';
import {
  legacyStegaEncode,
  vercelStegaDecode,
  vercelStegaEncode,
  vercelStegaSplit,
} from '@vercel/stega';

import {
  collectFields,
  readQueryDocument,
  type QueryDocument,
  type QueryInput,
  type QuerySelection,
} from './query-document';

/** Edit-link parameter naming the list entry that holds the text. */
export const ENTRY_PARAM = 'entry';

interface Context {
  doc: QueryDocument | null;
  /** `_id` of the nearest item or component above this value. */
  ownerId?: string;
  /** API field path from that owner down to this value. */
  path: string[];
  /** `_id` of the nearest list entry above this value. */
  entryId?: string;
  /** Field path of that entry, relative to its owner. */
  entryField?: string;
  /** The owner of that entry. */
  entryOwnerId?: string;
  /** Inside an `Assets` entry, whose assets are not entries of their own. */
  inAssets?: boolean;
}

// The only field path the editor focuses an entry by: a field of the open
// item and the entry's index (`content.3`). Deeper entries are found by id.
const TOP_LEVEL_ENTRY = /^[A-Za-z0-9_]+\.\d+$/;

/**
 * The id the editor knows a list entry by: its `_id`, or for an `Assets`
 * entry in dynamic content (which has none) its first asset's.
 */
function entryIdOf(element: unknown): string | undefined {
  if (!isObject(element)) return undefined;
  if (typeof element._id === 'string') return element._id;
  if (element.__typename !== 'Assets' || !Array.isArray(element.items)) {
    return undefined;
  }
  const first: unknown = element.items[0];
  return isObject(first) && typeof first._id === 'string'
    ? first._id
    : undefined;
}

/**
 * Encodes an edit link the way Prepr's API does: two hidden characters per
 * byte, half of what the default encoding takes. Every text in a list entry
 * carries one, so the difference adds up in the page's payload. That form
 * only holds Latin-1; anything else falls back to the default encoding.
 */
function encodeLink(payload: object): string {
  try {
    return legacyStegaEncode(payload);
  } catch {
    return vercelStegaEncode(payload);
  }
}

/**
 * The hidden link with the entry id added, and the entry's field path when
 * the link names no field and points at the entry's owner (a `Text` entry's
 * link carries no field of its own). Empty when the link stays as it is.
 */
function rewriteLink(
  encoded: string,
  entryId: string,
  entryField: string,
  entryOwnerId: string | undefined,
): string {
  let payload: { href?: unknown; origin?: unknown } | undefined;
  try {
    payload = vercelStegaDecode(encoded) as typeof payload;
  } catch {
    return '';
  }
  if (typeof payload?.href !== 'string') return '';

  let url: URL;
  try {
    url = new URL(payload.href);
  } catch {
    return '';
  }
  if (url.searchParams.has(ENTRY_PARAM)) return '';

  url.searchParams.set(ENTRY_PARAM, entryId);
  const itemId = decodeURIComponent(url.pathname.split('/').pop() ?? '');
  if (!url.searchParams.has('field') && entryField && itemId === entryOwnerId) {
    url.searchParams.set('field', entryField);
  }
  return encodeLink({ ...payload, href: url.toString() });
}

// A preview page renders the same content again on every unsaved change, so
// the same links come by each time. Decoding and encoding one costs far more
// than looking it up.
const MAX_REWRITTEN = 10_000;
const rewritten = new Map<string, string>();

/** Rewrites one string's edit link, or returns it unchanged. */
function annotate(value: string, ctx: Context): string {
  if (!ctx.entryId) return value;
  const { cleaned, encoded } = vercelStegaSplit(value);
  if (!encoded) return value;

  const entryField =
    ctx.entryField && TOP_LEVEL_ENTRY.test(ctx.entryField)
      ? ctx.entryField
      : '';
  const key = `${ctx.entryId}\n${entryField}\n${ctx.entryOwnerId ?? ''}\n${encoded}`;
  let link = rewritten.get(key);
  if (link === undefined) {
    link = rewriteLink(encoded, ctx.entryId, entryField, ctx.entryOwnerId);
    if (rewritten.size >= MAX_REWRITTEN) rewritten.clear();
    rewritten.set(key, link);
  }
  return link ? cleaned + link : value;
}

function walk(
  value: unknown,
  selections: QuerySelection[] | null,
  ctx: Context,
): unknown {
  if (typeof value === 'string') return annotate(value, ctx);

  if (Array.isArray(value)) {
    let changed = false;
    const next = value.map((element, index) => {
      const path = [...ctx.path, String(index)];
      const entryId = ctx.inAssets ? undefined : entryIdOf(element);
      const entry = entryId
        ? {
            entryId,
            entryField: ctx.ownerId ? path.join('.') : undefined,
            entryOwnerId: ctx.ownerId,
            inAssets: isObject(element) && element._id === undefined,
          }
        : {};
      const out = walk(element, selections, { ...ctx, ...entry, path });
      if (out !== element) changed = true;
      return out;
    });
    return changed ? next : value;
  }

  if (!isObject(value)) return value;

  const id = typeof value._id === 'string' ? value._id : undefined;
  const typename =
    typeof value.__typename === 'string' ? value.__typename : undefined;
  const fields =
    ctx.doc && selections ? collectFields(selections, typename, ctx.doc) : null;

  let changed = false;
  const next: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    const field = fields?.get(key);
    const name = field?.name ?? key;
    const out = walk(child, field?.selections ?? null, {
      ...ctx,
      ownerId: id ?? ctx.ownerId,
      path: id ? [name] : [...ctx.path, name],
    });
    if (out !== child) changed = true;
    next[key] = out;
  }
  return changed ? next : value;
}

/**
 * Adds the list entry each piece of text belongs to (a dynamic content
 * entry, a repeated component) to its hidden edit link, so the visual editor
 * can find the entry by id without `data-prepr-entry-id` on the page. A
 * `Text` entry's link, which names no field, also gets the entry's field
 * path, so `data-prepr-edit-target` is not needed to name it.
 *
 * Needs `_id` on the entries. Returns the result itself when nothing
 * changed. Pass the query to name fields by their API name under aliases.
 */
export function annotateEditLinks<T>(
  result: T,
  query?: QueryInput,
  operationName?: string,
): T {
  let doc: QueryDocument | null = null;
  if (query !== undefined) {
    try {
      doc = readQueryDocument(query, operationName);
    } catch {
      doc = null;
    }
  }
  return walk(result, doc?.operation ?? null, { doc, path: [] }) as T;
}
