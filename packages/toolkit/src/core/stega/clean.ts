import { vercelStegaClean, vercelStegaDecode } from '@vercel/stega';

import { createScopedLogger } from '../utils';

const debug = createScopedLogger('stega:clean');

/** Payload the Prepr CMS embeds in visible text: `href` is the edit URL. */
export interface StegaDecodedData {
  href: string;
  origin: string;
}

/** Strip the invisible stega characters. Safe on unencoded strings. */
export function stegaClean(text: string): string {
  if (!text) return text;
  return vercelStegaClean(text);
}

/** Decode the `{ origin, href }` payload, or null if nothing decodes. */
export function decodeStega(str: string | null): StegaDecodedData | null {
  if (!str) return null;

  try {
    const decoded = vercelStegaDecode(str) as StegaDecodedData | undefined;
    if (decoded?.href) {
      return decoded;
    }
  } catch (error) {
    debug.log('error decoding stega data', error as object);
    // Trailing characters can break the decoder; try to isolate the JSON slice.
    const match = str.match(/{"origin.*?}/);
    if (match) {
      try {
        const decodedMatch = vercelStegaDecode(
          match[0]
        ) as StegaDecodedData | undefined;
        if (decodedMatch?.href) {
          return decodedMatch;
        }
      } catch (innerError) {
        debug.log('error decoding stega regex match', innerError as object);
      }
    }
  }

  return null;
}
