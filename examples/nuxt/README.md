# Nuxt example

A marketing site showing how to add [`@preprio/toolkit`](../../packages/toolkit)
to a **Nuxt** app: preview toolbar, edit mode, tracking pixel, and
personalization/variant tracking.

## The integration

- [`server/middleware/prepr.ts`](./server/middleware/prepr.ts) — persists the
  Prepr cookies and sets the forward-headers on every request.
- [`app/app.vue`](./app/app.vue) — resolves toolbar props on the server and
  renders `<PreprToolbar>` and `<PreprTrackingPixel>`.
- [`shared/prepr-features.ts`](./shared/prepr-features.ts) — one feature config
  shared by both, so a disabled feature is off everywhere.

## Prerequisites

A Prepr account and a GraphQL access token with the **Enable edit mode**
permission (Prepr: Settings > Access tokens). The token is exposed to the
browser via `NUXT_PUBLIC_PREPR_GRAPHQL_URL`, so use a scoped read-only token.

## Run

    cp .env.example .env    # set NUXT_PUBLIC_PREPR_GRAPHQL_URL
    pnpm install
    pnpm --filter example-nuxt dev

Open http://localhost:3000. The preview toolbar is on in dev
(`import.meta.dev`) — see `app/app.vue` to point it at a different signal.
