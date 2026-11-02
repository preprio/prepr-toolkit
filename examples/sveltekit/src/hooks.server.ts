import { dev } from '$app/env';
import { preprHandle } from '@preprio/toolkit/sveltekit';
import { preprFeatures } from '#lib/prepr.js';

// `preview` is the only gate — the toolkit reads no env vars of its own. This
// starter uses SvelteKit's built-in `dev` flag; use whatever signal your
// deployment already has. When on, request headers (Prepr-Segments, etc.) are
// forwarded to load functions and preview cookies are set on the response.
export const handle = preprHandle({ preview: dev, features: preprFeatures });
