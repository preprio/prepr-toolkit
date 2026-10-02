// Prepr adds these to `Vary` when the queried fields contain segment variants
// or A/B tests at any depth, e.g. `Prepr-Segments`, `Prepr-ABTesting5050`.
const PERSONALIZED_VARY = /\bPrepr-(Segments|ABTesting)/i;

/**
 * Whether a Prepr GraphQL response differs per visitor, read from its `Vary`
 * header. Use it when fetching with your own GraphQL client; the toolkit's
 * `createPreprClient` already returns it as `personalized`.
 *
 * Never throws; a response without `Vary` is not personalized.
 */
export function isPersonalizedResponse(source: Response | Headers): boolean {
  const headers = 'headers' in source ? source.headers : source;
  return PERSONALIZED_VARY.test(headers.get('vary') ?? '');
}
