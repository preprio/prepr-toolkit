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

export default defineConfig([
  {
    ...sharedOptions,
    entry: {
      index: 'src/index.ts',
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
    external: ['next', 'react', 'react-dom', './components'],
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
]);
