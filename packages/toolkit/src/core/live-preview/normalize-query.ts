import {
  vercelStegaCombine,
  vercelStegaDecode,
  vercelStegaSplit,
} from '@vercel/stega';

import { createScopedLogger } from '../utils';
import { graphqlFieldName } from './field-name';
import {
  indexSnapshot,
  type LivePath,
  type SnapshotIndex,
} from './index-snapshot';
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
  isLiveFieldChange,
  isPlainRecord,
  parseEditTarget,
  parseListEntries,
  type LiveEditTarget,
} from './validate';

export type { LiveEditTarget } from './validate';

const debug = createScopedLogger('live-preview:normalize');

/**
 * One unsaved change from the Prepr editor: the `_id` of the item (or stack
 * entry) that owns the field, and the field's API name or a dotted path below
 * it (`content.headline_style`, `content.3.body`).
 */
export type LivePatch =
  | {
      type: 'field';
      itemId: string;
      field: string;
      value: LiveValue;
      /** Edit-link target for text that has none yet (an unsaved entry). */
      edit?: LiveEditTarget;
    }
  | { type: 'list'; itemId: string; field: string; entries: LiveListEntry[] };

export interface NormalizeQueryOptions {
  /**
   * The editor's unsaved changes, oldest first. Treated as hostile: malformed
   * entries are dropped.
   */
  log?: unknown;
  /** Which operation to use when the document holds more than one. */
  operationName?: string;
}

const MAX_LOG_ENTRIES = 500;
const MAX_LOG_SOURCE_LENGTH = 1_000_000;
const INDEX_SEGMENT = /^\d+$/;
const FORBIDDEN_SEGMENTS = new Set(['__proto__', 'prototype', 'constructor']);
const ENVELOPE_KEYS = new Set(['data', 'errors', 'extensions']);

/**
 * Validate a patch log from an untrusted source (a request body, a cookie).
 * Accepts the array or its JSON text, drops malformed entries, never throws.
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
    if (type === 'field' && isLiveFieldChange(field, entry.value)) {
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
 * renders them before the editor saves. Pass the query that produced the
 * result (`{ data }` or just `data`):
 *
 * ```ts
 * const page = normalizeQuery(GetPageDocument, data, { log });
 * ```
 *
 * The query maps fields to response keys, so changes land under aliases and
 * on every place the same item appears; fields not in the query are left
 * alone. Select `_id` on every item and component that should update.
 * Without a log the query is not parsed and the result is returned as-is.
 * Never throws.
 */
export function normalizeQuery<T>(
  query: QueryInput,
  result: T,
  options: NormalizeQueryOptions = {},
): T {
  return applyPatchLog(
    query,
    result,
    parsePatchLog(options.log),
    options.operationName,
  );
}

/** `normalizeQuery` for a log that already passed `parsePatchLog`. */
export function applyPatchLog<T>(
  query: QueryInput,
  result: T,
  log: LivePatch[],
  operationName?: string,
): T {
  if (!log.length || result === null || typeof result !== 'object') {
    return result;
  }

  if (isEnvelope(result)) {
    const data = applyPatchLog(query, result.data, log, operationName);
    return data === result.data ? result : ({ ...result, data } as T);
  }

  let doc: QueryDocument | null = null;
  try {
    doc = readQueryDocument(query, operationName);
  } catch (error) {
    debug.log('could not read the query; applying fields by literal path', {
      error: String(error),
    });
  }

  let root: unknown = result;
  // Rebuilt lazily, only after a change moved or replaced objects.
  let index: SnapshotIndex | null = null;
  for (const patch of log) {
    // A change that fails must not cost the others, nor the render.
    try {
      index ??= indexSnapshot(root);
      const next = applyPatch(root, index, patch, doc, result);
      if (next !== root) {
        root = next;
        if (patch.type === 'list' || !isScalarValue(patch.value)) {
          index = null;
        }
      }
    } catch (error) {
      debug.log('could not apply a change', {
        itemId: patch.itemId,
        field: patch.field,
        error: String(error),
      });
    }
  }
  return root as T;
}

function isScalarValue(value: LiveValue): boolean {
  return value === null || typeof value !== 'object';
}

/** The result with one change applied, or `root` when it applies nowhere. */
function applyPatch(
  root: unknown,
  index: SnapshotIndex,
  patch: LivePatch,
  doc: QueryDocument | null,
  result: unknown,
): unknown {
  const ownerPaths = index.get(patch.itemId);
  if (!ownerPaths?.length) return root;
  const segments = patch.field.split('.');
  if (segments.some((s) => !s || FORBIDDEN_SEGMENTS.has(s))) return root;

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
    return root;
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
    for (const target of targets) {
      const selections = doc ? selectionsAt(root, doc, target) : null;
      const build: LiveEntryBuilder | undefined =
        doc && selections
          ? (entry) =>
              buildEntry(doc, selections, entry, {
                links: editLinks(result, entry),
                lists: listKeysIn(result),
              })
          : undefined;
      root = syncListAtPath(root, target, patch.entries, build);
    }
  }
  return root;
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
 * Every response path that holds `segments` below the item at `ownerPath`
 * (one per alias). The editor's `items` list-container segments are skipped
 * when the query has no field by that name.
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
      if (!Object.prototype.hasOwnProperty.call(record, field.key)) continue;
      matched = true;
      const fieldPath = [...path, field.key];
      let value = record[field.key];
      // An empty component (just added, nothing typed yet) is null: build it
      // in the query's shape so the write has somewhere to land.
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
          value = fillObject(doc, field.selections, typename, {}, undefined, {
            links: null,
            lists: listKeysIn(root),
          });
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
 * The query type a new entry is built as, matching the editor's type name
 * loosely (`Side by side` ↔ `SideBySide`). Undefined when nothing fits, so
 * the entry waits for the save.
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
  // Fall back to the only selected type only when the editor named none:
  // an entry of another type must not be built in this type's shape.
  const named = explicit !== undefined || typeof typeName === 'string';
  return known.length === 1 && !named ? known[0] : undefined;
}

/**
 * A new list entry in the query's shape; null where the editor sent nothing
 * (references only the server can resolve appear after save).
 */
function buildEntry(
  doc: QueryDocument,
  selections: QuerySelection[],
  entry: LiveListEntry,
  ctx: BuildContext,
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
    ctx,
  );
}

function fillObject(
  doc: QueryDocument,
  selections: QuerySelection[],
  typename: string | null,
  values: Record<string, unknown>,
  id: unknown,
  ctx: BuildContext,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const { links } = ctx;
  // Keys that hold a list on existing objects of this type. A value the
  // editor left empty becomes `[]` there, as the API returns it: a page that
  // maps over the list must not crash on a new entry.
  const lists = ctx.lists(typename);
  const edit = isPlainRecord(values.__edit) ? values.__edit : null;
  // The editor keys values by API id; the query selects GraphQL names (the
  // API id or its snake_case form). Older editors send GraphQL names with an
  // `apiIds` map instead.
  const apiIdOf = new Map<string, string>();
  for (const key of Object.keys(values)) {
    apiIdOf.set(key, key);
    const name = graphqlFieldName(key);
    if (!apiIdOf.has(name)) apiIdOf.set(name, key);
  }
  if (edit && isPlainRecord(edit.apiIds)) {
    for (const [name, apiId] of Object.entries(edit.apiIds)) {
      if (typeof apiId === 'string') apiIdOf.set(name, apiId);
    }
  }
  const valueOf = (name: string): unknown => {
    if (Object.prototype.hasOwnProperty.call(values, name)) return values[name];
    const key = apiIdOf.get(name);
    return key !== undefined && key in values ? values[key] : undefined;
  };
  // A dynamic content block's text lives in one fixed field (`edit.field`).
  const editField = (name: string): string | null => {
    if (!edit) return null;
    if (typeof edit.field === 'string')
      return name === 'body' ? edit.field : null;
    if (typeof edit.path !== 'string') return null;
    // Only text fields carry edit links in the API; an enum or a color with
    // a hidden link would no longer match the values the site compares.
    const apiId = apiIdOf.get(name) ?? name;
    const text = Array.isArray(edit.text) ? edit.text : [];
    if (!text.includes(apiId) && !text.includes(name)) return null;
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
      const value = valueOf(field.name);
      out[field.key] =
        value == null && lists.has(field.key)
          ? []
          : fillNested(doc, field.selections, value, ctx);
    } else {
      const value = valueOf(field.name);
      if (Array.isArray(value) && value.every(isScalarItem)) {
        out[field.key] = value;
        continue;
      }
      if (value == null && lists.has(field.key)) {
        out[field.key] = [];
        continue;
      }
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
  ctx: BuildContext,
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
    return fillObject(doc, selections, typename, item, item._id, ctx);
  };
  if (Array.isArray(value)) return value.map(one).filter((v) => v !== null);
  return value === undefined ? null : one(value);
}

interface EditLinks {
  encode(text: string, field: string): string;
}

/** What building a new entry needs besides the query and the values. */
interface BuildContext {
  links: EditLinks | null;
  lists: (typename: string | null) => ReadonlySet<string>;
}

function isScalarItem(value: unknown): boolean {
  return (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  );
}

const NO_KEYS: ReadonlySet<string> = new Set();
const listKeysCache = new WeakMap<object, Map<string, Set<string>>>();

/** Per type, the keys that hold an array on some object of that type in `result`. */
function listKeysIn(
  result: unknown,
): (typename: string | null) => ReadonlySet<string> {
  return (typename) => {
    if (!typename || result === null || typeof result !== 'object') {
      return NO_KEYS;
    }
    let byType = listKeysCache.get(result);
    if (!byType) {
      byType = new Map();
      const seen = new WeakSet<object>();
      const walk = (node: unknown): void => {
        if (node === null || typeof node !== 'object' || seen.has(node)) return;
        seen.add(node);
        if (Array.isArray(node)) {
          node.forEach(walk);
          return;
        }
        const record = node as Record<string, unknown>;
        const type =
          typeof record.__typename === 'string' ? record.__typename : null;
        for (const [key, value] of Object.entries(record)) {
          if (type && Array.isArray(value)) {
            let keys = byType!.get(type);
            if (!keys) byType!.set(type, (keys = new Set()));
            keys.add(key);
          }
          walk(value);
        }
      };
      walk(result);
      listKeysCache.set(result, byType);
    }
    return byType.get(typename) ?? NO_KEYS;
  };
}

const EDIT_PATH = /\/content\/edit\/[^/?#]+/;

/**
 * Edit links for a new entry's text, so it is click-to-edit before save.
 * Host and locale are copied from an edit link the result already carries;
 * without one (edit mode off) or without `__edit` hints, values stay plain.
 */
function editLinks(result: unknown, entry: LiveListEntry): EditLinks | null {
  const edit = entry.fields?.__edit;
  if (!isPlainRecord(edit) || typeof edit.item !== 'string') return null;
  return editLinksFor(result, edit.item);
}

// Prepr item ids. Anything else could rewrite the edit link's path.
const ITEM_ID = /^[A-Za-z0-9_-]+$/;

function editLinksFor(result: unknown, item: string): EditLinks | null {
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
