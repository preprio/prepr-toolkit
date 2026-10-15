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
- **The decision, per page view.** [`src/proxy.ts`](./src/proxy.ts)
  (`createPreprProxy`) sends the same query cut down to `_context` only (a
  few hundred bytes) at every page load; `PreprPersonalizationSwitch` in the
  layout asks for the target page's decision when a link is pressed. Prepr
  decides from everything the middleware forwards: customer profile, UTM
  parameters, visitor IP, HubSpot id.
- **`<PreprStack>`** renders everything in the prerendered page: every
  variant of each segment group sits hidden until the view's decision shows
  the visitor's one, before first paint. Nothing streams, and the default
  variant never shows first.
- **A/B tests never stream or swap.** Both variants are in the cached page,
  and the same per-view decision as segment groups shows the visitor's one
  before first paint. A is the default, also for crawlers and visitors
  without JavaScript.
- The preview toolbar reads request headers, so it sits in its own
  `<Suspense>` boundary.
- **Preview is always fresh.** `preprDraftRedirect` in the proxy sends a
  preview visitor through [`/api/prepr/draft`](./src/app/api/prepr/draft/route.ts)
  once; draft mode makes Next skip `'use cache'` entries and the Data Cache,
  so an edit shows on the next load without a publish webhook.
- **Publishing refreshes only what changed.** `tagItems` in `getPage` tags
  each cached page with the `_id` of every item it shows, and
  [`/api/prepr/webhook`](./src/app/api/prepr/webhook/route.ts) revalidates
  the changed item's tag. Create a webhook in Prepr (Settings > Webhooks)
  pointing at that route with the `content_item.*` events, and set its ID as
  `PREPR_WEBHOOK_SECRET`.

## Run

    cp .env.example .env    # set PREPR_GRAPHQL_URL (and PREPR_WEBHOOK_SECRET)
    pnpm install
    pnpm --filter example-nextjs-cache-components dev

`next build` lists the catch-all route as `◐` (Partial Prerender).
