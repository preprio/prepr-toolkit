# Next.js Cache Components example

The [Next.js example](../nextjs) with
[Cache Components](https://nextjs.org/docs/app/getting-started/cache-components)
turned on (`cacheComponents: true` in [`next.config.ts`](./next.config.ts)).
Each page is served as a prerendered shell; only the parts that differ per
visitor render on request.

## How it works

The page uses its ordinary query ([`get-page-by-slug.graphql`](./src/queries/get-page-by-slug.graphql)); the toolkit derives everything else from it.

- **All variants, cached.** `getPage` runs the query with `{ variants: true }`
  inside `'use cache'`. The client adds `personalize: false` to every
  personalizable field (it learns which from the schema) and selects each
  item's `_context`, so the result holds every variant of every
  personalization and A/B group and is the same for every visitor. A group
  that shows nothing to "all other users" still gets its place.
- **The decision, per visitor.** `prepr().decide(...)` sends the same query
  cut down to `_context` only (a few hundred bytes). Prepr decides from
  everything the middleware forwards: customer profile, UTM parameters,
  visitor IP, HubSpot id.
- **`<PreprStack>`** renders what never varies, and every A/B test, in the
  static shell; each segment group gets its own `<Suspense>` boundary with
  the default variant as fallback, and a visitor in several segments gets the
  right variant per group.
- **A/B tests never stream.** [`src/proxy.ts`](./src/proxy.ts) gets the
  visitor's bucket with `resolvePreprBucket` (asked from Prepr once, then a
  cookie) and rewrites every page to `/ab/<bucket>/<slug>`, which is
  prerendered per bucket.
- The preview toolbar reads request headers, so it sits in its own
  `<Suspense>` boundary.

## Run

    cp .env.example .env    # set PREPR_GRAPHQL_URL
    pnpm install
    pnpm --filter example-nextjs-cache-components dev

`next build` lists the catch-all route as `◐` (Partial Prerender).
