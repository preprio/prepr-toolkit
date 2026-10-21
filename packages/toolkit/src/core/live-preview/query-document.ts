// The selection structure of a GraphQL query: which response keys each
// selection set produces, which schema field each key comes from, and which
// fragments apply. This is all live preview needs to map an editor address
// (an item and a field name) onto a query result, so the parser below reads
// only that and skips argument values, variables and directives as opaque
// token runs. It avoids a dependency on `graphql` for a structural walk.

/** One selection inside a selection set. */
export type QuerySelection =
  | {
      kind: 'field';
      /** Schema field name. */
      name: string;
      /** Response key: the alias, or the name when there is none. */
      key: string;
      /** Whether the field takes arguments, such as `url(width: 1000)`. */
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
  /** Root selection set of the first (or the named) operation. */
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
  | { type: 'value' }; // string, number: never inspected

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

// The subset of graphql-js AST nodes read here, typed structurally so the
// toolkit works with any DocumentNode producer without importing `graphql`.
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
 * Parse a query into its selection structure. Results are cached per
 * document, since the same query is normalized on every preview render.
 * Throws a `SyntaxError` for input that is not an executable document.
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

/** One response key of an object, with the schema field it comes from. */
export interface ResolvedField {
  name: string;
  key: string;
  hasArgs: boolean;
  selections: QuerySelection[];
}

/**
 * The fields a selection set yields for one response object. Fragments
 * whose type condition names the object's `__typename` take precedence;
 * conditions naming another type (an interface, a union, or a sibling
 * concrete type) only fill keys the exact match did not produce. Without a
 * schema the toolkit cannot tell an interface from a sibling type, and only
 * keys present on the object are ever used, so this errs towards mapping.
 */
export function collectFields(
  selections: QuerySelection[],
  typename: string | undefined,
  doc: QueryDocument,
): Map<string, ResolvedField> {
  const exact = new Map<string, ResolvedField>();
  const loose = new Map<string, ResolvedField>();
  const seen = new Set<QueryFragment>();

  const add = (
    target: Map<string, ResolvedField>,
    s: Extract<QuerySelection, { kind: 'field' }>,
  ) => {
    const existing = target.get(s.key);
    if (existing) {
      if (s.selections)
        existing.selections = [...existing.selections, ...s.selections];
      return;
    }
    target.set(s.key, {
      name: s.name,
      key: s.key,
      hasArgs: s.hasArgs,
      selections: s.selections ? [...s.selections] : [],
    });
  };

  const walk = (list: QuerySelection[], matched: boolean): void => {
    for (const s of list) {
      if (s.kind === 'field') {
        add(matched ? exact : loose, s);
      } else if (s.kind === 'inline') {
        walk(s.selections, matched && conditionMatches(s.on, typename));
      } else {
        const fragment = doc.fragments.get(s.name);
        // A fragment spread twice in one set is walked once; a fragment
        // that spreads itself is invalid GraphQL and must not loop.
        if (!fragment || seen.has(fragment)) continue;
        seen.add(fragment);
        walk(
          fragment.selections,
          matched && conditionMatches(fragment.on, typename),
        );
        seen.delete(fragment);
      }
    }
  };
  walk(selections, true);

  for (const [key, field] of loose) {
    if (!exact.has(key)) exact.set(key, field);
  }
  return exact;
}

function conditionMatches(
  on: string | null,
  typename: string | undefined,
): boolean {
  return on === null || typename === undefined || on === typename;
}
