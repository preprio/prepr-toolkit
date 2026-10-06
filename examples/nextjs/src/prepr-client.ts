import {
  createPreprClient,
  type PreprNextClient,
} from '@preprio/toolkit/nextjs/graphql';
import { preprGraphqlUrl } from './prepr-env';

let client: PreprNextClient | undefined;

/**
 * Created on first use, not at import: preprGraphqlUrl() throws when the env
 * var is missing, and `next build` imports this module without one.
 *
 * `preview` matches the middleware's flag (src/proxy.ts): it keeps stega
 * markers in text so the toolbar's click-to-edit works, and skips caching.
 */
export function prepr(): PreprNextClient {
  return (client ??= createPreprClient({
    url: preprGraphqlUrl(),
    preview: process.env.NODE_ENV !== 'production',
  }));
}
