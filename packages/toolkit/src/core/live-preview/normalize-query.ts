import { vercelStegaSplit } from '@vercel/stega';

import { createScopedLogger } from '../utils';
import { indexSnapshot, type LivePath } from './index-snapshot';
import {
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
import { isLiveValue, isPlainRecord, parseListEntries } from './validate';

const debug = createScopedLogger('live-preview:normalize');

/**
 * One unsaved change made in the Prepr editor, addressed the way the editor
 * addresses it: the `_id` of the item (or stack entry) that owns the field,
 * and the field's API name, or a dotted path below that item
 * (`content.headline_style`, `content.3.body`).
 */
export type LivePatch =
  | { type: 'field'; itemId: string; field: string; value: LiveValue }
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
      log.push({ type, itemId, field, value: entry.value });
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
        targets.push(...resolveTargets(root, doc, ownerPath, segments));
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
        const value = keepEditLink(readAtPath(root, target), patch.value);
        root = writeAtPath(root, target, value);
      }
    } else {
      const before = root;
      for (const target of targets) {
        const selections = doc ? selectionsAt(root, doc, target) : null;
        const build: LiveEntryBuilder | undefined =
          doc && selections
            ? (entry) => buildEntry(doc, selections, entry)
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

/**
 * Text the editor pushes carries no hidden edit link, while the value it
 * replaces does. Carrying the old link over keeps the element click-to-edit
 * after a server render shows the new text.
 */
function keepEditLink(current: unknown, value: LiveValue): LiveValue {
  if (typeof current !== 'string' || typeof value !== 'string') return value;
  const { encoded } = vercelStegaSplit(current);
  if (!encoded || vercelStegaSplit(value).encoded) return value;
  return value + encoded;
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
): LivePath[] {
  let owner: unknown = root;
  for (const step of ownerPath) {
    owner = (owner as Record<string | number, unknown>)[step];
  }
  const selections = selectionsAt(root, doc, ownerPath);
  if (!selections) return [];

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
      walk(record[field.key], field.selections, i + 1, [...path, field.key]);
    }
    if (!matched && segment === 'items') walk(node, sel, i + 1, path);
  };
  walk(owner, selections, 0, ownerPath);
  return out;
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
): Record<string, unknown> | undefined {
  const typename = resolveTypename(
    doc,
    selections,
    entry.__typename,
    entry.typeName,
  );
  if (typename === undefined) return undefined;
  return fillObject(doc, selections, typename, entry.fields ?? {}, entry._id);
}

function fillObject(
  doc: QueryDocument,
  selections: QuerySelection[],
  typename: string | null,
  values: Record<string, unknown>,
  id: unknown,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const fields = collectFields(selections, typename ?? undefined, doc, {
    strict: true,
  });
  for (const field of fields.values()) {
    if (field.name === '__typename') {
      out[field.key] = typename;
    } else if (field.name === '_id') {
      out[field.key] = typeof id === 'string' ? id : (values._id ?? null);
    } else if (field.selections.length) {
      out[field.key] = fillNested(doc, field.selections, values[field.name]);
    } else {
      const value = values[field.name];
      out[field.key] =
        value === undefined || (value !== null && typeof value === 'object')
          ? null
          : value;
    }
  }
  return out;
}

function fillNested(
  doc: QueryDocument,
  selections: QuerySelection[],
  value: unknown,
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
    return fillObject(doc, selections, typename, item, item._id);
  };
  if (Array.isArray(value)) return value.map(one).filter((v) => v !== null);
  return value === undefined ? null : one(value);
}
