# Next.js Cache Components example

The [Next.js example](../nextjs) with
[Cache Components](https://nextjs.org/docs/app/getting-started/cache-components)
turned on (`cacheComponents: true` in [`next.config.ts`](./next.config.ts)).
Each page is served as a prerendered shell; only the parts that differ per
visitor render on request.

## How it works

Two queries per page, one shared and cached, one per visitor and tiny:

- **All variants, cached.** `getPageVariants` queries the page with
  `content(personalize: false)` inside `'use cache'`. Prepr returns every
  variant of every personalization and A/B group, each tagged with
  `_context { kind group_id variant_id }`. The result is the same for every
  visitor. Because it holds every variant, a group that shows nothing to "all
  other users" (say, a banner only for small companies) still gets its place
  on the page.
- **The decision, per visitor.** `getDecisions` asks Prepr which variant of
  each group this visitor gets: ids only, about 0.7 KB. Prepr decides from
  everything the middleware forwards (customer profile, UTM parameters,
  visitor IP, HubSpot id), so segments that depend on this request resolve
  correctly. One query per request serves every group (React `cache()`).
- **Segment groups stream.** Each sits in its own `<Suspense>` boundary; the
  default variant (possibly empty) is the fallback. A visitor in several
  segments gets the right variant per group.
- **A/B tests never stream.** [`src/proxy.ts`](./src/proxy.ts) learns the
  visitor's bucket once from Prepr's `x-prepr-customer-bucket` header, keeps
  it in a cookie, and rewrites every page to `/ab/<bucket>/<slug>`. Pages are
  prerendered per bucket and pick the A/B variant from the cached data, so the
  right variant is in the first byte.
- The preview toolbar reads request headers, so it sits in its own
  `<Suspense>` boundary.

Grouping and variant selection live in
[`src/lib/personalization.ts`](./src/lib/personalization.ts);
`node --experimental-strip-types scripts/check-personalization.ts` checks it,
including a group without a default variant.

## Run

    cp .env.example .env    # set PREPR_GRAPHQL_URL
    pnpm install
    pnpm --filter example-nextjs-cache-components dev

`next build` lists the catch-all route as `◐` (Partial Prerender).
