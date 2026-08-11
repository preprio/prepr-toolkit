/**
 * One config, passed to the middleware (server) and serialized into the page so
 * the client toolbar gets the same object. A disabled feature is off everywhere:
 * no UI, no cookies, no headers.
 *
 * Everything is on by default. Turn a feature off to remove it app-wide:
 *
 *   segments: false,
 *   abTesting: false,
 *   editMode: { enabled: false },
 *
 * @type {import('@preprio/toolkit').PreprFeatures}
 */
export const preprFeatures = {};
