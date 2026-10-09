import type { DocumentNode } from 'graphql';
// The printer module alone, not the `graphql` barrel: resolved as CommonJS,
// the barrel loads the whole package (~260 KB minified) for this one function.
import { print } from 'graphql/language/printer.js';
import { stripIgnoredCharacters } from 'graphql/utilities/stripIgnoredCharacters.js';

import { PreprError } from '../server';

// Codegen documents are module-level constants, so after the first request
// every lookup hits. Keyed weakly so documents built at runtime can be
// collected.
const printed = new WeakMap<object, string>();

function isDocumentNode(value: unknown): value is DocumentNode {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { kind?: unknown }).kind === 'Document' &&
    Array.isArray((value as { definitions?: unknown }).definitions)
  );
}

function invalidDocument(originalError?: Error): PreprError {
  return new PreprError(
    'Expected a GraphQL query string, TypedDocumentString or DocumentNode',
    'INVALID_DOCUMENT',
    'createPreprClient',
    originalError,
  );
}

// Prepr rejects queries over 27,500 characters (HTTP 412), and indentation
// alone can push a query with many fragments past that. Every query is sent
// without insignificant whitespace and comments.
const minified = new Map<string, string>();
const MINIFIED_CACHE_LIMIT = 500;

function minify(query: string): string {
  const cached = minified.get(query);
  if (cached !== undefined) return cached;
  let result = query;
  try {
    result = stripIgnoredCharacters(query);
  } catch {
    // Not valid GraphQL: send it as is and let Prepr report the error.
  }
  // Query strings are normally module constants; the cap keeps queries built
  // at runtime from growing the cache without bound.
  if (minified.size < MINIFIED_CACHE_LIMIT) minified.set(query, result);
  return result;
}

/**
 * The minified query text of a string, `TypedDocumentString` or
 * `DocumentNode`.
 *
 * @throws PreprError `INVALID_DOCUMENT` for anything else, or for a
 *   `DocumentNode` that cannot be printed.
 */
export function resolveQuery(document: unknown): string {
  if (typeof document === 'string') return minify(document);
  if (document instanceof String) return minify(document.toString());
  if (!isDocumentNode(document)) throw invalidDocument();

  let query = printed.get(document);
  if (query === undefined) {
    try {
      query = minify(print(document));
    } catch (error) {
      throw invalidDocument(error instanceof Error ? error : undefined);
    }
    printed.set(document, query);
  }
  return query;
}
