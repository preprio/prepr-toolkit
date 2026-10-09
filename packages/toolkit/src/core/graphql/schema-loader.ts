import {
  PREPR_SCHEMA_QUERY,
  toSchemaInfo,
  type PreprSchemaInfo,
} from '../variants/schema';
import { assertPreprUrl } from './client';
import { createTransport } from './transport';

// One schema per GraphQL URL for the life of the process. Failed loads are
// dropped so the next call retries.
const schemas = new Map<string, Promise<PreprSchemaInfo>>();

/**
 * Loads what `toVariantsQuery` and `toDecisionQuery` need to know about your
 * Prepr schema (which fields take `personalize`, which types can hold
 * variants) with one introspection request, kept in memory per URL. For a
 * site that uses its own GraphQL client; `createPreprClient` does this
 * itself.
 *
 * Load it once at startup or lazily before the first rewrite. Schema changes
 * in Prepr take effect after a restart or redeploy.
 *
 * @throws PreprError when the URL is invalid or the request fails; the URL,
 *   which holds your access token, is never part of the message.
 */
export async function loadPreprSchema(
  url: string,
  options: { fetch?: typeof fetch } = {},
): Promise<PreprSchemaInfo> {
  assertPreprUrl(url, 'loadPreprSchema');
  let schema = schemas.get(url);
  if (!schema) {
    const run = createTransport({ url, fetch: options.fetch, stega: 'none' });
    schema = run<Parameters<typeof toSchemaInfo>[0], undefined>(
      PREPR_SCHEMA_QUERY,
    ).then(
      (result) => toSchemaInfo(result.data),
      (error: unknown) => {
        schemas.delete(url);
        throw error;
      },
    );
    schemas.set(url, schema);
  }
  return schema;
}
