import {
  vercelStegaCombine,
  vercelStegaDecode,
  vercelStegaSplit,
} from '@vercel/stega';

import { createScopedLogger } from '../utils';
import { indexSnapshot, type LivePath } from './index-snapshot';
import {
  keepEditLink,
  syncListAtPath,
  writeAtPath,
  type LiveEntryBuilder,
  type LiveListEntry,
  type LiveValue,
} from './patch';
import {
  collectFields,
  readQueryDocument,
  typeConditions,
  type QueryDocument,
  type QueryInput,
  type QuerySelection,
} from './query-document';
import {
  isLiveValue,
  isPlainRecord,
  parseEditTarget,
  parseListEntries,
  type LiveEditTarget,
} from './validate';

export type { LiveEditTarget } from './validate';

const debug = createScopedLogger('live-preview:normalize');

/**
 * One unsaved change made in the Prepr editor, addressed the way the editor
 * addresses it: the `_id` of the item (or stack entry) that owns the field,
 * and the field's API name, or a dotted path below that item
 * (`content.headline_style`, `content.3.body`).
 */
export type LivePatch =
  | {
      type: 'field';
      itemId: string;
      field: string;
      value: LiveValue;
      /**
       * Where a click on this text leads in the editor, for text that has no
       * edit link yet (typed into an entry added before save).
       */
      edit?: LiveEditTarget;
    }
  | { type: 'list'; itemId: string; field: string; entries: LiveListEntry[] };

export interface NormalizeQueryOptions {
  /**
   * The editor's unsaved changes for this render, oldest first. Usually read
   * from the incoming request by a framework adapter. Treated as hostile:
   * malformed entries are dropped. Without entries the result is returned
   * as-is, without parsing the query.
   */
  log?: unknown;
  /** Which operation to use when the document holds more than one. */
  operationName?: string;
}

const MAX_LOG_ENTRIES = 500;
const MAX_LOG_SOURCE_LENGTH = 1_000_000;
const INDEX_SEGMENT = /^\d+$/;
const FORBIDDEN_SEGMENTS = new Set(['__proto__', 'prototype', 'constructor']);
const UPPERCASE_BOUNDARY = /(.)(?=[A-Z])/g;
const ENVELOPE_KEYS = new Set(['data', 'errors', 'extensions']);

/**
 * Validate a patch log from an untrusted source (a request body, a cookie).
 * Accepts the array or its JSON text, drops every entry that is not a
 * well-formed `LivePatch`, and never throws.
 */
export function parsePatchLog(raw: unknown): LivePatch[] {
  let value = raw;
  if (typeof value === 'string') {
    if (!value || value.length > MAX_LOG_SOURCE_LENGTH) return [];
    try {
      value = JSON.parse(value);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(value)) return [];
  const log: LivePatch[] = [];
  for (const entry of value.slice(-MAX_LOG_ENTRIES)) {
    if (!isPlainRecord(entry)) continue;
    const { type, itemId, field } = entry;
    if (typeof itemId !== 'string' || !itemId) continue;
    if (typeof field !== 'string' || !field) continue;
    if (type === 'field' && isLiveValue(entry.value)) {
      const edit = parseEditTarget(entry.edit);
      log.push(
        edit
          ? { type, itemId, field, value: entry.value, edit }
          : { type, itemId, field, value: entry.value },
      );
    } else if (type === 'list') {
      const entries = parseListEntries(entry.entries);
      if (entries) log.push({ type, itemId, field, entries });
    }
  }
  return log;
}

/**
 * Apply the Prepr editor's unsaved changes to a GraphQL result, so the page
 * renders them before the editor saves. Call it on the server (or anywhere)
 * with the query that produced the result, then render what it returns:
 *
 * ```ts
 * const data = await fetchFromPrepr(GetPageDocument, { slug });
 * const page = normalizeQuery(GetPageDocument, data, { log });
 * ```
 *
 * The query tells the toolkit which response key holds which field, so
 * changes land under aliases (`logoStyle: style`), inside single components
 * (`content.headline_style` below the section that holds them), on dynamic
 * content entries (`content.3.body`), and on every place the same item
 * appears in the result. Fields that are not in the query are left alone:
 * the result keeps exactly the shape the page was typed for.
 *
 * Requirements and limits:
 * - Select `_id` on every item and component whose fields should update.
 *   An object without `_id` cannot be found by the editor's address.
 * - Pass the whole response (`{ data }`) or just `data`; both work.
 * - Without a log, or with an empty one, the result is returned untouched
 *   and the query is not parsed, so production renders pay nothing.
 * - Never throws: an unreadable query or log returns the result unchanged.
 */
export function normalizeQuery<T>(
  query: QueryInput,
  result: T,
  options: NormalizeQueryOptions = {},
): T {
  const log = parsePatchLog(options.log);
  if (!log.length || result === null || typeof result !== 'object') {
    return result;
  }

  if (isEnvelope(result)) {
    const data = normalizeQuery(query, result.data, options);
    return data === result.data ? result : ({ ...result, data } as T);
  }

  let doc: QueryDocument | null = null;
  try {
    doc = readQueryDocument(query, options.operationName);
  } catch (error) {
    debug.log('could not read the query; applying fields by literal path', {
      error: String(error),
    });
  }

  let root: unknown = result;
  let index = indexSnapshot(root);
  for (const patch of log) {
    const ownerPaths = index.get(patch.itemId);
    if (!ownerPaths?.length) continue;
    const segments = patch.field.split('.');
    if (segments.some((s) => !s || FORBIDDEN_SEGMENTS.has(s))) continue;

    const targets: LivePath[] = [];
    for (const ownerPath of ownerPaths) {
      if (doc) {
        const resolved = resolveTargets(root, doc, ownerPath, segments);
        root = resolved.root;
        targets.push(...resolved.targets);
      } else {
        targets.push([...ownerPath, ...segments.map(toPathSegment)]);
      }
    }
    if (!targets.length) {
      debug.log('no field in the query matches', {
        itemId: patch.itemId,
        field: patch.field,
      });
      continue;
    }

    if (patch.type === 'field') {
      for (const target of targets) {
        let value = keepEditLink(readAtPath(root, target), patch.value);
        if (
          patch.edit &&
          typeof value === 'string' &&
          !vercelStegaSplit(value).encoded
        ) {
          value =
            editLinksFor(result, patch.edit.item)?.encode(
              value,
              patch.edit.field,
            ) ?? value;
        }
        root = writeAtPath(root, target, value);
      }
    } else {
      const before = root;
      for (const target of targets) {
        const selections = doc ? selectionsAt(root, doc, target) : null;
        const build: LiveEntryBuilder | undefined =
          doc && selections
            ? (entry) =>
                buildEntry(doc, selections, entry, editLinks(result, entry))
            : undefined;
        root = syncListAtPath(root, target, patch.entries, build);
      }
      // Entries moved: paths recorded before the change no longer point at
      // the same objects.
      if (root !== before) index = indexSnapshot(root);
    }
  }
  return root as T;
}

function readAtPath(root: unknown, path: LivePath): unknown {
  let node = root;
  for (const step of path) {
    if (node === null || typeof node !== 'object') return undefined;
    node = (node as Record<string | number, unknown>)[step];
  }
  return node;
}

function isEnvelope(value: object): value is { data: unknown } {
  if (Array.isArray(value) || !('data' in value)) return false;
  return Object.keys(value).every((key) => ENVELOPE_KEYS.has(key));
}

function toPathSegment(segment: string): string | number {
  return INDEX_SEGMENT.test(segment) ? Number(segment) : segment;
}

/**
 * GraphQL field names are the snake_case form of the API ids the editor
 * uses (`headlineStyle` → `headline_style`), matching how Prepr derives them.
 */
function graphqlFieldName(apiId: string): string {
  return apiId.replace(UPPERCASE_BOUNDARY, '$1_').toLowerCase();
}

function typenameOf(node: unknown): string | undefined {
  const typename = (node as { __typename?: unknown }).__typename;
  return typeof typename === 'string' ? typename : undefined;
}

/** The selection set that produced the object at `path`, or null. */
function selectionsAt(
  root: unknown,
  doc: QueryDocument,
  path: LivePath,
): QuerySelection[] | null {
  let node = root;
  let selections = doc.operation;
  for (const step of path) {
    if (Array.isArray(node)) {
      node = node[step as number];
      continue;
    }
    if (node === null || typeof node !== 'object') return null;
    const field = collectFields(selections, typenameOf(node), doc).get(
      String(step),
    );
    if (!field) return null;
    selections = field.selections;
    node = (node as Record<string, unknown>)[String(step)];
  }
  return selections;
}

/**
 * Every response path that holds `segments` below the item at `ownerPath`.
 * A field name can map to several response keys (the same field selected
 * under different aliases), and each is written. `items` segments that the
 * editor uses for list containers (`tabs.items.0.items.icon`) are skipped
 * when the query has no field by that name. List indexes may be zero-padded.
 */
function resolveTargets(
  root: unknown,
  doc: QueryDocument,
  ownerPath: LivePath,
  segments: string[],
): { root: unknown; targets: LivePath[] } {
  let owner: unknown = root;
  for (const step of ownerPath) {
    owner = (owner as Record<string | number, unknown>)[step];
  }
  const selections = selectionsAt(root, doc, ownerPath);
  if (!selections) return { root, targets: [] };

  let current = root;
  const out: LivePath[] = [];
  const walk = (
    node: unknown,
    sel: QuerySelection[],
    i: number,
    path: LivePath,
  ): void => {
    if (i === segments.length) {
      out.push(path);
      return;
    }
    const segment = segments[i];
    if (Array.isArray(node)) {
      if (INDEX_SEGMENT.test(segment)) {
        const position = Number(segment);
        if (position < node.length) {
          walk(node[position], sel, i + 1, [...path, position]);
        }
      } else if (segment === 'items') {
        walk(node, sel, i + 1, path);
      }
      return;
    }
    if (node === null || typeof node !== 'object') return;
    const record = node as Record<string, unknown>;
    const wanted = graphqlFieldName(segment);
    let matched = false;
    for (const field of collectFields(sel, typenameOf(node), doc).values()) {
      if (field.name !== segment && field.name !== wanted) continue;
      if (!(field.key in record)) continue;
      matched = true;
      const fieldPath = [...path, field.key];
      let value = record[field.key];
      // A component that is still empty (a section just added, with nothing
      // typed into it yet) holds null. The query says what it looks like, so
      // create it in that shape and write into it.
      const next = segments[i + 1];
      if (
        value === null &&
        field.selections.length &&
        next !== undefined &&
        next !== 'items' &&
        !INDEX_SEGMENT.test(next)
      ) {
        const typename = resolveTypename(
          doc,
          field.selections,
          undefined,
          undefined,
        );
        if (typename !== undefined) {
          value = fillObject(
            doc,
            field.selections,
            typename,
            {},
            undefined,
            null,
          );
          current = writeAtPath(current, fieldPath, value as LiveValue);
        }
      }
      walk(value, field.selections, i + 1, fieldPath);
    }
    if (!matched && segment === 'items') walk(node, sel, i + 1, path);
  };
  walk(owner, selections, 0, ownerPath);
  return { root: current, targets: out };
}

const NON_ALPHANUMERIC = /[^a-z0-9]/gi;
const typeKey = (name: string): string =>
  name.replace(NON_ALPHANUMERIC, '').toLowerCase();

/**
 * The type a new entry is built as: one the query names for this list. The
 * editor's `__typename` wins when the query knows it; otherwise its type
 * name is matched loosely (`Side by side` ↔ `SideBySide`); a field the query
 * selects for a single type takes that type. Undefined when nothing fits,
 * so the entry waits for the save.
 */
function resolveTypename(
  doc: QueryDocument,
  selections: QuerySelection[],
  typename: unknown,
  typeName: unknown,
): string | null | undefined {
  const known = typeConditions(selections, doc);
  const explicit = typeof typename === 'string' ? typename : undefined;
  if (!known.length) return explicit ?? null;
  if (explicit && known.includes(explicit)) return explicit;
  for (const candidate of [explicit, typeName]) {
    if (typeof candidate !== 'string' || !candidate) continue;
    const match = known.find((name) => typeKey(name) === typeKey(candidate));
    if (match) return match;
  }
  return known.length === 1 ? known[0] : undefined;
}

/**
 * A new list entry in exactly the shape the query selects for its type, with
 * the editor's values where it sent them and null elsewhere (references and
 * other values only the server can resolve appear after save).
 */
function buildEntry(
  doc: QueryDocument,
  selections: QuerySelection[],
  entry: LiveListEntry,
  links: EditLinks | null,
): Record<string, unknown> | undefined {
  const typename = resolveTypename(
    doc,
    selections,
    entry.__typename,
    entry.typeName,
  );
  if (typename === undefined) return undefined;
  return fillObject(
    doc,
    selections,
    typename,
    entry.fields ?? {},
    entry._id,
    links,
  );
}

function fillObject(
  doc: QueryDocument,
  selections: QuerySelection[],
  typename: string | null,
  values: Record<string, unknown>,
  id: unknown,
  links: EditLinks | null,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const edit = isPlainRecord(values.__edit) ? values.__edit : null;
  const apiIds = edit && isPlainRecord(edit.apiIds) ? edit.apiIds : {};
  // Where a click on this value leads in the editor: a field below this
  // entry (`<path>.items.<field>`), or one fixed field (a dynamic content
  // block's text lives in its dynamic content field).
  const editField = (name: string): string | null => {
    if (!edit) return null;
    if (typeof edit.field === 'string')
      return name === 'body' ? edit.field : null;
    if (typeof edit.path !== 'string') return null;
    // Only text fields carry edit links in the API; an enum or a color with
    // a hidden link would no longer match the values the site compares.
    if (!Array.isArray(edit.text) || !edit.text.includes(name)) return null;
    const apiId = typeof apiIds[name] === 'string' ? apiIds[name] : name;
    return `${edit.path}.items.${apiId}`;
  };
  const fields = collectFields(selections, typename ?? undefined, doc, {
    strict: true,
  });
  for (const field of fields.values()) {
    if (field.name === '__typename') {
      out[field.key] = typename;
    } else if (field.name === '_id') {
      out[field.key] = typeof id === 'string' ? id : (values._id ?? null);
    } else if (field.selections.length) {
      out[field.key] = fillNested(
        doc,
        field.selections,
        values[field.name],
        links,
      );
    } else {
      const value = values[field.name];
      const scalar =
        value === undefined || (value !== null && typeof value === 'object')
          ? null
          : value;
      const target = typeof scalar === 'string' ? editField(field.name) : null;
      out[field.key] =
        target && links ? links.encode(scalar as string, target) : scalar;
    }
  }
  return out;
}

function fillNested(
  doc: QueryDocument,
  selections: QuerySelection[],
  value: unknown,
  links: EditLinks | null,
): unknown {
  const one = (item: unknown): unknown => {
    if (!isPlainRecord(item)) return null;
    const typename = resolveTypename(
      doc,
      selections,
      item.__typename,
      item.typeName,
    );
    if (typename === undefined) return null;
    return fillObject(doc, selections, typename, item, item._id, links);
  };
  if (Array.isArray(value)) return value.map(one).filter((v) => v !== null);
  return value === undefined ? null : one(value);
}

/** Adds the hidden edit link the API gives saved text to built text. */
interface EditLinks {
  encode(text: string, field: string): string;
}

const EDIT_PATH = /\/content\/edit\/[^/?#]+/;

/**
 * Edit links for the values of a new entry, so they are click-to-edit like
 * saved content before the save. Prepr's edit links point at the item open
 * in the editor plus a field path; the path of a stack entry may name it by
 * its id (`sections.items.<id>.items.headline`), which the editor resolves
 * for unsaved entries too. The host and locale are taken from an edit link
 * the result already carries, so nothing is invented: without one (edit mode
 * off) or without the editor's `__edit` hints, values stay plain.
 */
function editLinks(result: unknown, entry: LiveListEntry): EditLinks | null {
  const edit = entry.fields?.__edit;
  if (!isPlainRecord(edit) || typeof edit.item !== 'string') return null;
  return editLinksFor(result, edit.item);
}

function editLinksFor(result: unknown, item: string): EditLinks | null {
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
      href.pathname = href.pathname.replace(EDIT_PATH, `/content/edit/${item}`);
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
