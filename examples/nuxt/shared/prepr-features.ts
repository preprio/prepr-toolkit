import type { PreprFeatures } from '@preprio/toolkit';

/**
 * One config, passed to both `server/middleware/prepr.ts` and the toolbar
 * component, so a disabled feature is off everywhere: no UI, no cookies, no
 * headers. Lives in `shared/` because Nuxt's app and server sides are separate
 * roots — this is the one place both can import from.
 *
 * Everything is on by default. Turn a feature off to remove it app-wide:
 *
 *   segments: false,
 *   abTesting: false,
 *   editMode: { enabled: false },
 */
export const preprFeatures: PreprFeatures = {};
