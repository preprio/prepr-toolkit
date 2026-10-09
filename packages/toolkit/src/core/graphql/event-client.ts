import { PreprError, getPreprHeadersFromHeaders } from '../server';
import type { PreprDecisions } from '../variants';
import { createPreprClient } from './client';
import { mergePreprHeaders } from './transport';
import type {
  PreprClientOptions,
  PreprDecideOptions,
  PreprDocument,
  PreprQueryOptions,
  PreprQueryResult,
} from './types';

/** @internal How a framework wrapper reaches the current request. */
export interface PreprEventAdapter<TEvent> {
  /** Request headers; only the Prepr ones are forwarded. */
  headers(event: TEvent): Headers;
  /** Request-scoped fetch, when the framework provides one. */
  fetch?(event: TEvent): typeof fetch | undefined;
}

/**
 * Query options for frameworks without an implicit request scope.
 * `personalize: true` requires the request `event`; the compiler enforces it.
 */
export type PreprEventQueryOptions<TEvent> = PreprQueryOptions &
  (
    | { personalize?: false; event?: TEvent }
    | { personalize: true; event: TEvent }
  );

export interface PreprEventClient<TEvent> {
  /**
   * Run a GraphQL query against Prepr. With `personalize: true`, the Prepr
   * headers of `event` are forwarded and the request is `no-store`; without
   * it the request is identical for every visitor.
   *
   * @throws PreprError — as `PreprClient.query`, plus `CONTEXT_ERROR` when
   *   `personalize` is true and no `event` is passed.
   */
  query<TResult, TVariables>(
    document: PreprDocument<TResult, TVariables>,
    variables?: TVariables,
    options?: PreprEventQueryOptions<TEvent>,
  ): Promise<PreprQueryResult<TResult>>;
  /**
   * Which variant of each group this visitor gets, for the query you render
   * with `variants: true`. Forwards the Prepr headers of `event`.
   *
   * @throws PreprError — `CONTEXT_ERROR` without an `event`.
   */
  decide<TVariables>(
    document: PreprDocument<unknown, TVariables>,
    variables: TVariables | undefined,
    options: PreprDecideOptions & { event: TEvent },
  ): Promise<PreprDecisions>;
}

/** @internal Shared implementation of the Nuxt, SvelteKit and Astro clients. */
export function createEventClient<TEvent>(
  options: PreprClientOptions,
  adapter: PreprEventAdapter<TEvent>,
): PreprEventClient<TEvent> {
  const client = createPreprClient(options);

  return {
    async query<TResult, TVariables>(
      document: PreprDocument<TResult, TVariables>,
      variables?: TVariables,
      queryOptions: PreprEventQueryOptions<TEvent> = {},
    ): Promise<PreprQueryResult<TResult>> {
      const { personalize, event, ...rest } = queryOptions;

      // Throwing beats a silent headerless fetch: the caller asked for this
      // visitor's variant and would otherwise get the default one.
      if (personalize && event === undefined) {
        throw new PreprError(
          'personalize: true requires the request event',
          'CONTEXT_ERROR',
          'createPreprClient',
        );
      }

      const fetchImpl =
        rest.fetch ??
        (event === undefined ? undefined : adapter.fetch?.(event));
      // Filtering through getPreprHeadersFromHeaders keeps cookies and other
      // request headers from ever reaching the Prepr API.
      const headers = personalize
        ? mergePreprHeaders(
            getPreprHeadersFromHeaders(adapter.headers(event as TEvent)),
            rest.headers,
          )
        : rest.headers;

      return client.query(document, variables, {
        ...rest,
        headers,
        fetch: fetchImpl,
      });
    },

    async decide<TVariables>(
      document: PreprDocument<unknown, TVariables>,
      variables: TVariables | undefined,
      queryOptions: PreprDecideOptions & { event: TEvent },
    ): Promise<PreprDecisions> {
      const { event, ...rest } = queryOptions;
      if (event === undefined) {
        throw new PreprError(
          'decide requires the request event',
          'CONTEXT_ERROR',
          'createPreprClient',
        );
      }
      return client.decide(document, variables, {
        ...rest,
        headers: mergePreprHeaders(
          getPreprHeadersFromHeaders(adapter.headers(event)),
          rest.headers,
        ),
        fetch: rest.fetch ?? adapter.fetch?.(event),
      });
    },
  };
}
