import {
  createPreprClient,
  type PreprNextClient,
} from '@preprio/toolkit/nextjs/graphql';
import { preprGraphqlUrl } from './prepr-env';

let client: PreprNextClient | undefined;

/**
 * Created on first use, not at import: preprGraphqlUrl() throws when the env
 * var is missing, and `next build` imports this module without one.
 */
export function prepr(): PreprNextClient {
  return (client ??= createPreprClient({ url: preprGraphqlUrl() }));
}
