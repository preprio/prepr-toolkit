# Next.js Cache Components example

The [Next.js example](../nextjs) with
[Cache Components](https://nextjs.org/docs/app/getting-started/cache-components)
turned on (`cacheComponents: true` in [`next.config.ts`](./next.config.ts)).
Each page is served as a prerendered shell; only the parts that differ per
visitor render on request.

## How it works

- [`src/app/[[...slug]]/page.tsx`](./src/app/%5B%5B...slug%5D%5D/page.tsx) —
  `getPage` runs the headerless query inside `'use cache'`. The result carries
  Prepr's `personalized` verdict, and every element that belongs to a
  personalization or A/B group carries `_context.group_id`.
- Only those groups render per visitor. Each one sits in its own `<Suspense>`
  boundary with the group's default variant as the fallback, and is replaced
  by the variant this visitor gets. A visitor can be in several segments, so
  each group resolves on its own: one section can target small companies while
  another targets a specific company. All groups share one personalized query
  per request (React `cache()`); everything outside a group is the cached
  shell and never re-renders.
- [`src/lib/personalization.ts`](./src/lib/personalization.ts) — splits the
  page into plain runs and groups. A group is swapped as a whole because a
  variant can hold a different number of sections than the default.
- [`src/app/[[...slug]]/layout.tsx`](./src/app/%5B%5B...slug%5D%5D/layout.tsx) —
  the preview toolbar reads request headers, so it sits in its own
  `<Suspense>` boundary instead of making the whole route dynamic.
- [`src/prepr-client.ts`](./src/prepr-client.ts) — one client, with `preview`
  on in development so the toolbar's click-to-edit keeps its markers.

The cached entry is tagged `prepr` by the client itself, so a Prepr publish
webhook that calls `revalidateTag('prepr')` refreshes it; no `cacheTag()` call
is needed.

Every group needs a default ("all other users") variant: a group whose
default is empty is absent from the cached result, so the page cannot place a
boundary for it.

## Run

    cp .env.example .env    # set PREPR_GRAPHQL_URL
    pnpm install
    pnpm --filter example-nextjs-cache-components dev

`next build` lists the catch-all route as `◐` (Partial Prerender).
