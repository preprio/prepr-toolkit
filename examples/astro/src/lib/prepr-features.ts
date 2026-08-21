import type { PreprFeatures } from '@preprio/toolkit';

/**
 * One config, passed to both the middleware (server) and the toolbar (client),
 * so a disabled feature is off everywhere: no UI, no cookies, no headers.
 *
 * Everything is on by default. Turn a feature off to remove it app-wide:
 *
 *   segments: false,
 *   abTesting: false,
 *   editMode: { enabled: false },
 */
export const preprFeatures: PreprFeatures = {};
