# SvelteKit example

A marketing site showing how to add [`@preprio/toolkit`](../../packages/toolkit)
to a **SvelteKit** app: preview toolbar, edit mode, and personalization/variant
tracking.

## The integration

- [`src/hooks.server.ts`](./src/hooks.server.ts) — persists the Prepr cookies
  and sets the forward-headers on every request.
- [`src/routes/+layout.server.ts`](./src/routes/+layout.server.ts) and
  [`+layout.svelte`](./src/routes/+layout.svelte) — resolve toolbar props on
  the server and render `<PreprToolbar>` in preview.
- [`src/lib/prepr.ts`](./src/lib/prepr.ts) — one feature config shared by both,
  so a disabled feature is off everywhere.

## Prerequisites

A Prepr account and a GraphQL access token with the **Enable edit mode**
permission (Prepr: Settings > Access tokens). The token is exposed to the
browser via `PUBLIC_PREPR_GRAPHQL_URL`, so use a scoped read-only token.

## Run

    cp .env.example .env    # set PUBLIC_PREPR_GRAPHQL_URL
    pnpm install
    pnpm --filter example-sveltekit dev

Open http://localhost:5173. The preview toolbar is on in dev by default — see
`src/hooks.server.ts` to point it at a different signal.
