import type { DocumentNode } from 'graphql';

import { toAbProbeDocument } from '../variants';
import { isFrameworkSignal, type PreprTransport } from './transport';
import type { PreprClientOptions, PreprDocument } from './types';

// Prepr lists these in `Vary` when the response holds an A/B test or a
// segment personalization group.
export const AB_TEST_VARY = /\bPrepr-ABTesting/i;
export const SEGMENTS_VARY = /\bPrepr-Segments/i;

// How long a hasAbTests answer is reused, and how many are kept per query.
const AB_CHECK_TTL_MS = 60_000;
const AB_CHECK_MAX_ENTRIES = 1000;

/**
 * The `Vary` header Prepr sends for the query without its leaf fields and
 * without visitor headers: it lists `Prepr-ABTesting…` and `Prepr-Segments`
 * when the result holds A/B tests or segment groups. Kept for a minute per
 * query and variables; null when the check failed.
 */
export type PreprVaryProbe = <TVariables>(
  document: PreprDocument<unknown, TVariables>,
  variables?: TVariables,
) => Promise<string | null>;

/**
 * A {@link PreprVaryProbe} with its own caches, sending through `run`.
 * `options.fetch` is read on every probe, like the client's own requests.
 */
export function createVaryProbe(
  run: PreprTransport,
  options: Pick<PreprClientOptions, 'fetch'>,
): PreprVaryProbe {
  // Derived documents are cached per source document, so each is built (and
  // printed) once.
  const abProbes = new Map<unknown, DocumentNode | null>();
  const abChecks = new Map<
    unknown,
    Map<string, { value: Promise<string | null>; at: number }>
  >();

  return <TVariables>(
    document: PreprDocument<unknown, TVariables>,
    variables?: TVariables,
  ): Promise<string | null> => {
    const key = JSON.stringify(variables ?? null);
    let answers = abChecks.get(document);
    if (!answers) {
      answers = new Map();
      abChecks.set(document, answers);
    }
    const cached = answers.get(key);
    if (cached && Date.now() - cached.at < AB_CHECK_TTL_MS) return cached.value;

    const value = (async () => {
      let probe = abProbes.get(document);
      if (probe === undefined) {
        probe = toAbProbeDocument(document);
        abProbes.set(document, probe);
      }
      if (!probe) return '';
      // No visitor headers, so Prepr's CDN can cache it. The answer is in the
      // `Vary` header, not the data.
      let vary = '';
      const send = options.fetch ?? fetch;
      await run(probe, variables, {
        fetch: async (input, init) => {
          const response = await send(input, init);
          vary = response.headers.get('vary') ?? '';
          return response;
        },
      });
      return vary;
    })().catch((error: unknown) => {
      if (isFrameworkSignal(error)) throw error;
      answers!.delete(key);
      return null;
    });

    if (answers.size >= AB_CHECK_MAX_ENTRIES) {
      answers.delete(answers.keys().next().value!);
    }
    answers.set(key, { value, at: Date.now() });
    return value;
  };
}
