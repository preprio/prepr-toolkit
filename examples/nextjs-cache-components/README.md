# Next.js Cache Components example

The [Next.js example](../nextjs) with
[Cache Components](https://nextjs.org/docs/app/getting-started/cache-components)
turned on (`cacheComponents: true` in [`next.config.ts`](./next.config.ts)).
Each page is served as a prerendered shell; only the parts that differ per
visitor render on request.

## How it works

- [`src/app/[[...slug]]/page.tsx`](./src/app/%5B%5B...slug%5D%5D/page.tsx) —
  `getPage` runs the headerless query inside `'use cache'`. The result carries
  Prepr's `personalized` verdict. Pages without personalization render
  entirely from the cache. Personalized pages render the default variant as a
  `<Suspense>` fallback and stream this visitor's variant
  (`personalize: true`) in over it.
- [`src/app/[[...slug]]/layout.tsx`](./src/app/%5B%5B...slug%5D%5D/layout.tsx) —
  the preview toolbar reads request headers, so it sits in its own
  `<Suspense>` boundary instead of making the whole route dynamic.
- [`src/prepr-client.ts`](./src/prepr-client.ts) — one client, with `preview`
  on in development so the toolbar's click-to-edit keeps its markers.

The cached entry is tagged `prepr` by the client itself, so a Prepr publish
webhook that calls `revalidateTag('prepr')` refreshes it; no `cacheTag()` call
is needed.

## Run

    cp .env.example .env    # set PREPR_GRAPHQL_URL
    pnpm install
    pnpm --filter example-nextjs-cache-components dev

`next build` lists the catch-all route as `◐` (Partial Prerender).
