import {
  createPreprClient,
  type PreprNextClient,
} from '@preprio/toolkit/nextjs/graphql';
import { preprGraphqlUrl } from './prepr-env';

/** Same signal the middleware and toolbar use; see src/proxy.ts. */
export const isPreview = process.env.NODE_ENV !== 'production';

let client: PreprNextClient | undefined;

/**
 * Created on first use, not at import: preprGraphqlUrl() throws when the env
 * var is missing, and `next build` imports this module without one.
 *
 * `preview` keeps stega markers in text so the toolbar's click-to-edit works.
 */
export function prepr(): PreprNextClient {
  return (client ??= createPreprClient({
    url: preprGraphqlUrl(),
    preview: isPreview,
  }));
}
