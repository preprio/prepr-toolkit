import type { DocumentNode } from 'graphql';

import { PreprError, validatePreprToken } from '../server';
import {
  PREPR_SCHEMA_QUERY,
  decisionsFrom,
  personalizationPaths,
  toDecisionDocument,
  toSchemaInfo,
  toVariantsDocument,
  type PreprDecisions,
  type PreprSchemaInfo,
} from '../variants';
import { AB_TEST_VARY, SEGMENTS_VARY, createVaryProbe } from './probe';
import { createTransport } from './transport';
import type {
  PreprClient,
  PreprClientOptions,
  PreprDecideOptions,
  PreprDocument,
  PreprQueryOptions,
  PreprQueryResult,
} from './types';

/** @internal The schema loader of each client from {@link createPreprClient}. */
export const clientSchemas = new WeakMap<
  PreprClient,
  () => Promise<PreprSchemaInfo>
>();

function isParseableUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * @internal Throws the same `PreprError` for a bad GraphQL URL wherever one is
 * accepted. The message never includes the URL: it contains the access token.
 */
export function assertPreprUrl(url: string, source: string): void {
  validatePreprToken(url);
  if (!isParseableUrl(url)) {
    throw new PreprError(
      'Prepr GraphQL URL is not a valid URL',
      'INVALID_TOKEN',
      source,
    );
  }
}

/**
 * Create a GraphQL client for the Prepr API.
 *
 * Reach for it on the server, to fetch content with codegen types and get
 * Prepr's personalization verdict alongside the data. Requests without
 * `headers` are identical for every visitor and safe to cache; requests with
 * them are always `no-store`.
 *
 * Requires the `graphql` package, which graphql-codegen already installs.
 *
 * @throws PreprError `MISSING_TOKEN` or `INVALID_TOKEN` for a bad `url`.
 */
export function createPreprClient(options: PreprClientOptions): PreprClient {
  assertPreprUrl(options.url, 'createPreprClient');

  const run = createTransport(options);
  const probeVary = createVaryProbe(run, options);

  // The schema says which fields take `personalize`; it is fetched once per
  // client, and refetched only if that request fails.
  let schema: Promise<PreprSchemaInfo> | undefined;
  const loadSchema = () =>
    (schema ??= run<Parameters<typeof toSchemaInfo>[0], undefined>(
      PREPR_SCHEMA_QUERY,
      undefined,
      { init: options.schemaInit },
    ).then(
      (result) => toSchemaInfo(result.data),
      (error: unknown) => {
        schema = undefined;
        throw error;
      },
    ));

  // Derived documents are cached per source document, so each is built (and
  // printed) once.
  const variantsDocuments = new Map<unknown, DocumentNode>();
  const decisionDocuments = new Map<
    unknown,
    Map<string, DocumentNode | null>
  >();

  const client: PreprClient = {
    async query<TResult, TVariables>(
      document: PreprDocument<TResult, TVariables>,
      variables?: TVariables,
      queryOptions: PreprQueryOptions = {},
    ): Promise<PreprQueryResult<TResult>> {
      const { variants, ...rest } = queryOptions;
      if (!variants) return run(document, variables, rest);

      let derived = variantsDocuments.get(document);
      if (!derived) {
        derived = toVariantsDocument(document, await loadSchema());
        variantsDocuments.set(document, derived);
      }
      return run<TResult, TVariables>(derived, variables, rest);
    },

    async decide<TVariables>(
      document: PreprDocument<unknown, TVariables>,
      variables?: TVariables,
      queryOptions: PreprDecideOptions = {},
    ): Promise<PreprDecisions> {
      const { from, topLevelOnly, nestedOnly, ...rest } = queryOptions;
      const paths = from === undefined ? undefined : personalizationPaths(from);
      // Nothing on the page depends on a segment: no request at all.
      if (paths && paths.size === 0) return new Map();

      const signature = paths
        ? [...paths]
            .map(([path, types]) => `${path}:${[...types].sort().join(',')}`)
            .sort()
            .join('|')
        : topLevelOnly
          ? 'top'
          : '*';
      const key = nestedOnly ? `nested:${signature}` : signature;
      let byPaths = decisionDocuments.get(document);
      if (!byPaths) {
        byPaths = new Map();
        decisionDocuments.set(document, byPaths);
      }
      let derived = byPaths.get(key);
      if (derived === undefined) {
        derived = toDecisionDocument(document, await loadSchema(), paths, {
          topLevelOnly: !paths && topLevelOnly,
          nestedOnly,
        });
        byPaths.set(key, derived);
      }
      if (!derived) return new Map();
      const { data } = await run(derived, variables, rest);
      return decisionsFrom(data);
    },

    hasAbTests: (document, variables) =>
      probeVary(document, variables).then(
        (vary) => vary === null || AB_TEST_VARY.test(vary),
      ),

    hasSegments: (document, variables) =>
      probeVary(document, variables).then(
        (vary) => vary === null || SEGMENTS_VARY.test(vary),
      ),
  };
  clientSchemas.set(client, loadSchema);
  return client;
}
