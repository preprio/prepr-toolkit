# Astro example

A marketing site showing how to add [`@preprio/toolkit`](../../packages/toolkit)
to a server-rendered **Astro** app: preview toolbar, edit mode, and
personalization/variant tracking.

## The integration

- [`src/middleware.ts`](./src/middleware.ts) — persists the Prepr cookies and
  sets the forward-headers on every request.
- [`src/layouts/Layout.astro`](./src/layouts/Layout.astro) — resolves toolbar
  props on the server and renders the toolbar in preview.
- [`src/lib/prepr-features.ts`](./src/lib/prepr-features.ts) — one feature
  config shared by both, so a disabled feature is off everywhere.

## Prerequisites

A Prepr account and a GraphQL access token with the **Enable edit mode**
permission (Prepr: Settings > Access tokens).

## Run

    cp .env.example .env    # set PREPR_GRAPHQL_URL
    pnpm install
    pnpm --filter example-astro dev

Open http://localhost:4321. The preview toolbar is on in dev by default — see
`src/middleware.ts` to point it at a different signal.
