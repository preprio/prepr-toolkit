// A minimal GraphQL reader: only the selection structure (response keys,
// schema fields, fragments) that maps an editor address onto a result.
// Arguments, variables and directives are skipped as opaque token runs, which
// avoids a dependency on `graphql`.

export type QuerySelection =
  | {
      kind: 'field';
      name: string;
      /** The alias, or the name when there is none. */
      key: string;
      hasArgs: boolean;
      selections: QuerySelection[] | null;
    }
  | { kind: 'spread'; name: string }
  | { kind: 'inline'; on: string | null; selections: QuerySelection[] };

export interface QueryFragment {
  on: string;
  selections: QuerySelection[];
}

export interface QueryDocument {
  /** The first operation, or the one named by `operationName`. */
  operation: QuerySelection[];
  fragments: Map<string, QueryFragment>;
}

/**
 * What `normalizeQuery` accepts as the query: GraphQL source text, a parsed
 * `DocumentNode` (from `graphql-tag`, Apollo or GraphQL Code Generator), or a
 * string-like object such as codegen's `TypedDocumentString`.
 */
export type QueryInput = string | { kind: 'Document' } | { toString(): string };

// --- Source text ------------------------------------------------------------

type Token =
  | { type: 'name'; value: string }
  | { type: 'punct'; value: string }
  | { type: 'value' };

const NAME_START = /[_A-Za-z]/;
const NAME_CONTINUE = /[_0-9A-Za-z]/;
const PUNCT = new Set([
  '!',
  '$',
  '&',
  '(',
  ')',
  ':',
  '=',
  '@',
  '[',
  ']',
  '{',
  '|',
  '}',
]);

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const n = source.length;
  while (i < n) {
    const ch = source[i];
    if (
      ch === ' ' ||
      ch === '\t' ||
      ch === '\n' ||
      ch === '\r' ||
      ch === ',' ||
      ch === '﻿'
    ) {
      i++;
    } else if (ch === '#') {
      while (i < n && source[i] !== '\n' && source[i] !== '\r') i++;
    } else if (ch === '.' && source.startsWith('...', i)) {
      tokens.push({ type: 'punct', value: '...' });
      i += 3;
    } else if (PUNCT.has(ch)) {
      tokens.push({ type: 'punct', value: ch });
      i++;
    } else if (NAME_START.test(ch)) {
      const start = i;
      while (i < n && NAME_CONTINUE.test(source[i])) i++;
      tokens.push({ type: 'name', value: source.slice(start, i) });
    } else if (ch === '"') {
      if (source.startsWith('"""', i)) {
        i += 3;
        while (i < n && !source.startsWith('"""', i)) {
          i += source.startsWith('\\"""', i) ? 4 : 1;
        }
        if (i >= n) throw new SyntaxError('Unterminated block string');
        i += 3;
      } else {
        i++;
        while (i < n && source[i] !== '"') {
          if (source[i] === '\n' || source[i] === '\r') {
            throw new SyntaxError('Unterminated string');
          }
          i += source[i] === '\\' ? 2 : 1;
        }
        if (i >= n) throw new SyntaxError('Unterminated string');
        i++;
      }
      tokens.push({ type: 'value' });
    } else if (ch === '-' || (ch >= '0' && ch <= '9')) {
      i++;
      while (i < n && /[0-9.eE+-]/.test(source[i])) i++;
      tokens.push({ type: 'value' });
    } else {
      throw new SyntaxError(`Unexpected character "${ch}"`);
    }
  }
  return tokens;
}

function parseSource(source: string, operationName?: string): QueryDocument {
  const tokens = tokenize(source);
  let pos = 0;

  const peek = (): Token | undefined => tokens[pos];
  const isPunct = (value: string): boolean => {
    const t = tokens[pos];
    return t?.type === 'punct' && t.value === value;
  };
  const expectPunct = (value: string): void => {
    if (!isPunct(value)) throw new SyntaxError(`Expected "${value}"`);
    pos++;
  };
  const expectName = (): string => {
    const t = tokens[pos];
    if (t?.type !== 'name') throw new SyntaxError('Expected a name');
    pos++;
    return t.value;
  };
  /** Skip a balanced `( … )` run: arguments or variable definitions. */
  const skipParens = (): void => {
    expectPunct('(');
    let depth = 1;
    while (depth > 0) {
      const t = tokens[pos++];
      if (!t) throw new SyntaxError('Unbalanced parentheses');
      if (t.type === 'punct' && t.value === '(') depth++;
      else if (t.type === 'punct' && t.value === ')') depth--;
    }
  };
  const skipDirectives = (): void => {
    while (isPunct('@')) {
      pos++;
      expectName();
      if (isPunct('(')) skipParens();
    }
  };

  const parseSelectionSet = (): QuerySelection[] => {
    expectPunct('{');
    const selections: QuerySelection[] = [];
    while (!isPunct('}')) {
      if (!peek()) throw new SyntaxError('Unterminated selection set');
      selections.push(parseSelection());
    }
    pos++;
    return selections;
  };

  const parseSelection = (): QuerySelection => {
    if (isPunct('...')) {
      pos++;
      const t = peek();
      if (t?.type === 'name' && t.value !== 'on') {
        pos++;
        skipDirectives();
        return { kind: 'spread', name: t.value };
      }
      let on: string | null = null;
      if (t?.type === 'name') {
        pos++;
        on = expectName();
      }
      skipDirectives();
      return { kind: 'inline', on, selections: parseSelectionSet() };
    }
    let name = expectName();
    const key = name;
    if (isPunct(':')) {
      pos++;
      name = expectName();
    }
    let hasArgs = false;
    if (isPunct('(')) {
      hasArgs = true;
      skipParens();
    }
    skipDirectives();
    const selections = isPunct('{') ? parseSelectionSet() : null;
    return { kind: 'field', name, key, hasArgs, selections };
  };

  const fragments = new Map<string, QueryFragment>();
  const operations: Array<{
    name: string | null;
    selections: QuerySelection[];
  }> = [];

  while (pos < tokens.length) {
    if (isPunct('{')) {
      operations.push({ name: null, selections: parseSelectionSet() });
      continue;
    }
    const keyword = expectName();
    if (keyword === 'fragment') {
      const name = expectName();
      if (expectName() !== 'on') throw new SyntaxError('Expected "on"');
      const on = expectName();
      skipDirectives();
      fragments.set(name, { on, selections: parseSelectionSet() });
    } else if (
      keyword === 'query' ||
      keyword === 'mutation' ||
      keyword === 'subscription'
    ) {
      const t = peek();
      let name: string | null = null;
      if (t?.type === 'name') name = expectName();
      if (isPunct('(')) skipParens();
      skipDirectives();
      operations.push({ name, selections: parseSelectionSet() });
    } else {
      throw new SyntaxError(`Unexpected "${keyword}"`);
    }
  }

  return { operation: pickOperation(operations, operationName), fragments };
}

function pickOperation(
  operations: Array<{ name: string | null; selections: QuerySelection[] }>,
  operationName?: string,
): QuerySelection[] {
  const op = operationName
    ? operations.find((o) => o.name === operationName)
    : operations[0];
  if (!op) throw new SyntaxError('The document has no operation');
  return op.selections;
}

// --- DocumentNode -----------------------------------------------------------

// Typed structurally so any DocumentNode producer works without `graphql`.
interface AstName {
  value: string;
}
interface AstSelectionSet {
  selections: AstSelection[];
}
interface AstSelection {
  kind: string;
  name?: AstName;
  alias?: AstName;
  arguments?: unknown[];
  typeCondition?: { name: AstName } | null;
  selectionSet?: AstSelectionSet | null;
}
interface AstDefinition {
  kind: string;
  name?: AstName | null;
  typeCondition?: { name: AstName };
  selectionSet?: AstSelectionSet;
}

function fromAstSelections(set: AstSelectionSet): QuerySelection[] {
  return set.selections.map((s): QuerySelection => {
    if (s.kind === 'FragmentSpread')
      return { kind: 'spread', name: s.name!.value };
    if (s.kind === 'InlineFragment') {
      return {
        kind: 'inline',
        on: s.typeCondition?.name.value ?? null,
        selections: fromAstSelections(s.selectionSet!),
      };
    }
    const name = s.name!.value;
    return {
      kind: 'field',
      name,
      key: s.alias?.value ?? name,
      hasArgs: Boolean(s.arguments?.length),
      selections: s.selectionSet ? fromAstSelections(s.selectionSet) : null,
    };
  });
}

function fromAst(
  doc: { definitions?: AstDefinition[] },
  operationName?: string,
): QueryDocument {
  const fragments = new Map<string, QueryFragment>();
  const operations: Array<{
    name: string | null;
    selections: QuerySelection[];
  }> = [];
  for (const def of doc.definitions ?? []) {
    if (
      def.kind === 'FragmentDefinition' &&
      def.name &&
      def.typeCondition &&
      def.selectionSet
    ) {
      fragments.set(def.name.value, {
        on: def.typeCondition.name.value,
        selections: fromAstSelections(def.selectionSet),
      });
    } else if (def.kind === 'OperationDefinition' && def.selectionSet) {
      operations.push({
        name: def.name?.value ?? null,
        selections: fromAstSelections(def.selectionSet),
      });
    }
  }
  return { operation: pickOperation(operations, operationName), fragments };
}

// --- Entry point ------------------------------------------------------------

const astCache = new WeakMap<object, Map<string, QueryDocument>>();
const sourceCache = new Map<string, QueryDocument>();
const SOURCE_CACHE_LIMIT = 200;

/**
 * Parse a query into its selection structure, cached per document. Throws a
 * `SyntaxError` for input that is not an executable document.
 */
export function readQueryDocument(
  query: QueryInput,
  operationName?: string,
): QueryDocument {
  const cacheKey = operationName ?? '';
  if (
    typeof query === 'object' &&
    query !== null &&
    (query as { kind?: unknown }).kind === 'Document'
  ) {
    let byName = astCache.get(query);
    if (!byName) astCache.set(query, (byName = new Map()));
    let parsed = byName.get(cacheKey);
    if (!parsed) {
      parsed = fromAst(
        query as { definitions?: AstDefinition[] },
        operationName,
      );
      byName.set(cacheKey, parsed);
    }
    return parsed;
  }
  const source = String(query);
  const sourceKey = `${cacheKey}\n${source}`;
  let parsed = sourceCache.get(sourceKey);
  if (!parsed) {
    parsed = parseSource(source, operationName);
    if (sourceCache.size >= SOURCE_CACHE_LIMIT) {
      sourceCache.delete(sourceCache.keys().next().value as string);
    }
    sourceCache.set(sourceKey, parsed);
  }
  return parsed;
}

export interface ResolvedField {
  name: string;
  key: string;
  hasArgs: boolean;
  selections: QuerySelection[];
}

const fieldsCache = new WeakMap<
  QuerySelection[],
  Map<string, Map<string, ResolvedField>>
>();

/**
 * The fields a selection set yields for one response object, keyed by
 * response key. Fragments matching the object's `__typename` win; other type
 * conditions only fill missing keys, because without a schema an interface
 * cannot be told from a sibling type. `strict` drops those other branches.
 */
export function collectFields(
  selections: QuerySelection[],
  typename: string | undefined,
  doc: QueryDocument,
  options: { strict?: boolean } = {},
): Map<string, ResolvedField> {
  const cacheKey = `${options.strict ? 's' : 'l'}:${typename ?? ''}`;
  let cached = fieldsCache.get(selections);
  if (!cached) {
    cached = new Map();
    fieldsCache.set(selections, cached);
  }
  const hit = cached.get(cacheKey);
  if (hit) return hit;
  const fields = resolveFields(selections, typename, doc, options);
  cached.set(cacheKey, fields);
  return fields;
}

function resolveFields(
  selections: QuerySelection[],
  typename: string | undefined,
  doc: QueryDocument,
  options: { strict?: boolean },
): Map<string, ResolvedField> {
  const exact = new Map<string, ResolvedField>();
  const loose = new Map<string, ResolvedField>();
  // The same field reached through several fragments must not repeat its
  // sub-selections.
  const merged = new Map<ResolvedField, Set<QuerySelection[]>>();
  // Each fragment is walked once per state, which also stops a fragment that
  // spreads itself (invalid GraphQL) from looping.
  const walkedMatched = new Set<QueryFragment>();
  const walkedLoose = new Set<QueryFragment>();

  const add = (
    target: Map<string, ResolvedField>,
    s: Extract<QuerySelection, { kind: 'field' }>,
  ) => {
    let field = target.get(s.key);
    if (!field) {
      field = { name: s.name, key: s.key, hasArgs: s.hasArgs, selections: [] };
      target.set(s.key, field);
      merged.set(field, new Set());
    }
    const done = merged.get(field)!;
    if (s.selections && !done.has(s.selections)) {
      done.add(s.selections);
      field.selections = [...field.selections, ...s.selections];
    }
  };

  // A fragment on a union or interface applies when one of its inner type
  // conditions names this object's type; one on another concrete type never
  // does.
  const applies = (on: string | null, list: QuerySelection[]): boolean =>
    conditionMatches(on, typename) ||
    (typename !== undefined && typeConditions(list, doc).includes(typename));

  const walk = (list: QuerySelection[], matched: boolean): void => {
    for (const s of list) {
      if (s.kind === 'field') {
        add(matched ? exact : loose, s);
      } else if (s.kind === 'inline') {
        walk(s.selections, matched && applies(s.on, s.selections));
      } else {
        const fragment = doc.fragments.get(s.name);
        if (!fragment) continue;
        const asMatched = matched && applies(fragment.on, fragment.selections);
        // Walked as matching already covers every key a loose walk would add.
        if (walkedMatched.has(fragment)) continue;
        if (!asMatched && walkedLoose.has(fragment)) continue;
        (asMatched ? walkedMatched : walkedLoose).add(fragment);
        walk(fragment.selections, asMatched);
      }
    }
  };
  walk(selections, true);

  // Reading an existing object may borrow other types' keys, since only keys
  // present on it are used; building one (`strict`) must not.
  if (!options.strict) {
    for (const [key, field] of loose) {
      if (!exact.has(key)) exact.set(key, field);
    }
  }
  return exact;
}

function conditionMatches(
  on: string | null,
  typename: string | undefined,
): boolean {
  return on === null || typename === undefined || on === typename;
}

const conditionsCache = new WeakMap<QuerySelection[], string[]>();

/**
 * The type names a selection set distinguishes with fragments, such as a
 * union's members. Empty for a set that applies to one type only.
 */
export function typeConditions(
  selections: QuerySelection[],
  doc: QueryDocument,
): string[] {
  const hit = conditionsCache.get(selections);
  if (hit) return hit;
  const names = new Set<string>();
  const seen = new Set<QueryFragment>();
  const walk = (list: QuerySelection[]): void => {
    for (const s of list) {
      if (s.kind === 'inline') {
        if (s.on) names.add(s.on);
        walk(s.selections);
      } else if (s.kind === 'spread') {
        const fragment = doc.fragments.get(s.name);
        if (!fragment || seen.has(fragment)) continue;
        seen.add(fragment);
        names.add(fragment.on);
        walk(fragment.selections);
      }
    }
  };
  walk(selections);
  const conditions = [...names];
  conditionsCache.set(selections, conditions);
  return conditions;
}
