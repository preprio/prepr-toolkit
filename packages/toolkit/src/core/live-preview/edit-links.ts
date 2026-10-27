import {
  vercelStegaCombine,
  vercelStegaDecode,
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
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Rewrites one string's edit link, or returns it unchanged. Adds the entry
 * id, and the entry's field path when the link names no field and points at
 * the entry's owner (a `Text` entry's link carries no field of its own).
 */
function annotate(value: string, ctx: Context): string {
  if (!ctx.entryId) return value;
  const { cleaned, encoded } = vercelStegaSplit(value);
  if (!encoded) return value;

  let payload: { href?: unknown; origin?: unknown } | undefined;
  try {
    payload = vercelStegaDecode(encoded) as typeof payload;
  } catch {
    return value;
  }
  if (typeof payload?.href !== 'string') return value;

  let url: URL;
  try {
    url = new URL(payload.href);
  } catch {
    return value;
  }
  if (url.searchParams.has(ENTRY_PARAM)) return value;

  url.searchParams.set(ENTRY_PARAM, ctx.entryId);
  const itemId = decodeURIComponent(url.pathname.split('/').pop() ?? '');
  if (
    !url.searchParams.has('field') &&
    ctx.entryField &&
    itemId === ctx.entryOwnerId
  ) {
    url.searchParams.set('field', ctx.entryField);
  }
  return vercelStegaCombine(
    cleaned,
    { ...payload, href: url.toString() },
    false,
  );
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
      const entry =
        isRecord(element) && typeof element._id === 'string'
          ? {
              entryId: element._id,
              entryField: ctx.ownerId ? path.join('.') : undefined,
              entryOwnerId: ctx.ownerId,
            }
          : {};
      const out = walk(element, selections, { ...ctx, ...entry, path });
      if (out !== element) changed = true;
      return out;
    });
    return changed ? next : value;
  }

  if (!isRecord(value)) return value;

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
