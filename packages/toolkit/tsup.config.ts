import type { Plugin } from 'esbuild';
import { defineConfig } from 'tsup';

// CSS is compiled to `*.generated.ts` by `scripts/compile-css.mjs` (run via
// the `prebuild` npm hook), so the toolbar/stega styles reach the bundle as
// ordinary TypeScript string modules — no esbuild `.css` loader, and no
// standalone consumer-linked `dist/*.css` is ever emitted. Isolation via the
// shadow root / injected <style> is the whole point. See that script.

const sharedOptions = {
  format: ['esm', 'cjs'] as const,
  dts: true,
  // Bundle preact (and its jsx-runtime) into dist so consumers never install
  // it — the toolbar stays a drop-in with no framework peer requirement.
  noExternal: ['preact', 'preact/jsx-runtime'],
};

// The `./components` sibling stays an external import (see the react/nextjs
// configs below), but the specifier must match the *output* format: under
// `"type": "module"` a `require('./components.js')` in the CJS bundle resolves
// to the ESM sibling and throws ERR_REQUIRE_ESM on Node < 20.19 — inside the
// package's declared `>=18.17` range. Rewrite to `.cjs` in the CJS build and
// pin the explicit `.js` in ESM (plain Node does no extensionless lookup).
const externalSiblingComponents: Plugin = {
  name: 'external-sibling-components',
  setup(build) {
    const ext = build.initialOptions.format === 'cjs' ? '.cjs' : '.js';
    build.onResolve({ filter: /^\.\/components(\.js)?$/ }, () => ({
      path: `./components${ext}`,
      external: true,
    }));
  },
};

export default defineConfig([
  {
    ...sharedOptions,
    entry: {
      index: 'src/index.ts',
      // Consumed by the `.astro` components, which ship as source and are
      // compiled in the consumer's pipeline — so this needs its own entry and
      // a matching `./json-script` export, not just inlining into the barrel.
      'json-script': 'src/core/json-script.ts',
      'nextjs/components': 'src/nextjs/components.ts',
    },
    // No `clean` on any config here: tsup runs this array concurrently, so a
    // clean in one races the output of the others — it silently ate
    // dist/{astro,sveltekit}/index.d.ts, whose DTS pass finishes later than
    // this config's wipe. `dist/` is cleared by the prebuild script instead.
    clean: false,
    external: ['next', 'react', 'react-dom'],
  },
  {
    ...sharedOptions,
    // Its own config, not an added entry above: `'use client'` is only
    // preserved on a config's own entry file, and these components need the
    // directive on the module where the hooks actually run.
    entry: {
      index: 'src/react/index.ts',
      components: 'src/react/components.ts',
    },
    outDir: 'dist/react',
    clean: false,
    // `./components.js` stays a real import into the sibling built above rather
    // than being inlined — same directive-preservation reason as `nextjs`.
    // Externalized (and format-suffixed) by the esbuild plugin.
    external: ['react', 'react-dom'],
    esbuildPlugins: [externalSiblingComponents],
  },
  {
    ...sharedOptions,
    entry: {
      index: 'src/nextjs/index.ts',
      // Standalone loader: consumers point next/image's `loaderFile` at a
      // one-line wrapper that re-exports this file's default. Kept its own
      // entry (not folded into the barrel) so it stays a bare default-export
      // module and Next inlines nothing unexpected.
      'image-loader': 'src/nextjs/image-loader.ts',
    },
    outDir: 'dist/nextjs',
    clean: false,
    // `./components` must stay a real import into the sibling file built above
    // — NOT get inlined — otherwise esbuild dead-code-eliminates the
    // `'use client'` directive (esbuild only preserves a source directive on
    // its own entry file, not on files it inlines into another bundle), and
    // Next's RSC boundary detection needs that directive on the module where
    // the client-only hooks (`useEffect`/`useRouter`) actually run.
    // Externalized (and format-suffixed) by the esbuild plugin.
    external: ['next', 'react', 'react-dom'],
    esbuildPlugins: [externalSiblingComponents],
  },
  {
    ...sharedOptions,
    // Only the TS module is built here — the `.astro` components
    // (PreprToolbar.astro / PreprTrackingPixel.astro) ship as source and
    // are compiled by the *consumer's* Astro pipeline, not tsup/esbuild
    // (esbuild has no `.astro` loader). They're published verbatim via
    // package.json's `files` field and resolved via the
    // `./astro/components/*` export map entry.
    entry: { index: 'src/astro/index.ts' },
    outDir: 'dist/astro',
    clean: false,
    // No astro/react/next imports in this module — it's typed structurally
    // against a minimal `AstroLikeContext`, so there is nothing to
    // externalize here.
    external: [],
  },
  {
    ...sharedOptions,
    // Only the TS module is built here — the `.svelte` components ship as
    // source and are compiled by the *consumer's* Vite/Svelte pipeline (tsup
    // has no `.svelte` loader). Published verbatim via package.json's `files`
    // field, resolved via the `./sveltekit/components/*` export map entry.
    entry: { index: 'src/sveltekit/index.ts' },
    outDir: 'dist/sveltekit',
    clean: false,
    // Typed structurally against a minimal `SvelteKitRequestEvent` — nothing
    // to externalize.
    external: [],
  },
  {
    ...sharedOptions,
    // Only the TS module is built here — the `.vue` components ship as source
    // and are compiled by the *consumer's* Vite/Vue pipeline (tsup has no
    // `.vue` loader). Published verbatim via package.json's `files` field,
    // resolved via the `./nuxt/components/*` export map entry.
    entry: { index: 'src/nuxt/index.ts' },
    outDir: 'dist/nuxt',
    clean: false,
    // Typed structurally against a minimal `H3EventLike` — nothing to
    // externalize.
    external: [],
  },
]);
