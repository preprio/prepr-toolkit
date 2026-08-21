// Extension is explicit, and `./components.js` is externalized in tsup.config
// so this stays a real runtime import: `'use client'` is only preserved on a
// config's own entry file, and inlining would strip it from the module where
// the hooks run. The `.js` keeps the emitted ESM resolvable under plain Node.
export {
  PreprPreview,
  PreprTrackingPixel,
  type PreprPreviewProps,
  type PreprTrackingPixelProps,
} from './components.js';
