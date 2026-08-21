# Next.js example

A marketing site showing how to add [`@preprio/toolkit`](../../packages/toolkit)
to a **Next.js** (App Router) app: preview toolbar, edit mode, and
personalization/variant tracking.

## The integration

- [`src/proxy.ts`](./src/proxy.ts) — `createPreprMiddleware` persists the Prepr
  cookies and forwards the personalization headers.
- [`src/app/[[...slug]]/layout.tsx`](./src/app/%5B%5B...slug%5D%5D/layout.tsx) —
  resolves toolbar props on the server and renders `<PreprToolbar>` in preview.
- [`src/prepr-features.ts`](./src/prepr-features.ts) — one feature config shared
  by both, so a disabled feature is off everywhere.

## Prerequisites

A Prepr account and a GraphQL access token with the **Enable edit mode**
permission (Prepr: Settings > Access tokens).

## Run

    cp .env.example .env    # set PREPR_GRAPHQL_URL
    pnpm install
    pnpm --filter example-nextjs dev

Open http://localhost:3000. The preview toolbar is on whenever `NODE_ENV` is
not `production`, so it shows up in dev by default.
