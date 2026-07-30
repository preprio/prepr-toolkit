# Prepr Toolkit

A framework-agnostic TypeScript library that provides preview functionality, visual editing capabilities, and A/B testing for [Prepr CMS](https://prepr.io). One vanilla core, with thin wrappers for Next.js, Nuxt, Astro, and SvelteKit.

This is the monorepo. The published package lives in [`packages/toolkit`](./packages/toolkit) and has its own [README](./packages/toolkit/README.md) with the complete API reference.

## Quick Start

```bash
# Install the package
npm install @preprio/toolkit
# or
pnpm add @preprio/toolkit
```

Add environment variables to your `.env`:

```bash
PREPR_GRAPHQL_URL=https://graphql.prepr.io/{YOUR_ACCESS_TOKEN}
PREPR_ENV=preview
```

Set up middleware in `middleware.ts`:

```typescript
import type { NextRequest } from 'next/server';
import { createPreprMiddleware } from '@preprio/toolkit/nextjs';

export function middleware(request: NextRequest) {
  return createPreprMiddleware(request, { preview: true });
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
```

Add the toolbar and tracking pixel to your layout:

```tsx
import type { ReactNode } from 'react';
import {
  extractAccessToken,
  getToolbarProps,
  PreprToolbar,
  PreprTrackingPixel,
} from '@preprio/toolkit/nextjs';

export default async function RootLayout({ children }: { children: ReactNode }) {
  const toolbarProps = await getToolbarProps(process.env.PREPR_GRAPHQL_URL!);
  const accessToken = extractAccessToken(process.env.PREPR_GRAPHQL_URL!);

  return (
    <html lang="en">
      <body>
        {children}
        <PreprToolbar {...toolbarProps} />
        {accessToken && <PreprTrackingPixel id={accessToken} />}
      </body>
    </html>
  );
}
```

No CSS import is needed — the toolbar renders into a shadow-DOM custom element with its styles inlined.

For Nuxt, Astro, SvelteKit, or any other framework, see the [package README](./packages/toolkit/README.md).

## Prerequisites

- **Node.js 18.0.0 or later** to consume the package (the repo itself is developed and tested on Node 22)
- **A Prepr account**
- **A Prepr GraphQL URL** (found in Settings → Access tokens)

### Prepr Account Setup

1. **Create a Prepr account** at [prepr.io](https://prepr.io)
2. **Get your GraphQL URL**:
   - Go to Settings → Access tokens
   - Find your GraphQL Preview access token
   - Copy the full GraphQL URL (e.g. `https://graphql.prepr.io/e6f7a0521f11e5149ce65b0e9f372ced2dfc923490890e7f225da1db84cxxxxx`)
   - The URL format is always `https://graphql.prepr.io/{YOUR_ACCESS_TOKEN}`
3. **Enable edit mode** (required for click-to-edit in the toolbar):
   - Open your GraphQL Preview access token
   - Check "Enable edit mode"
   - Save the token

## What's In Here

| Path | Description |
| --- | --- |
| `packages/toolkit` | The published `@preprio/toolkit` package — vanilla core plus the Next.js, Astro, and SvelteKit wrappers. |
| `examples/nextjs` | App Router, middleware, Apollo Client, custom image loader. |
| `examples/astro` | Astro middleware and the `.astro` components. |
| `examples/sveltekit` | `hooks.server.ts`, `+layout.server.ts`, the `.svelte` components. |
| `examples/express` | Vanilla core — a hand-written adapter for an unsupported framework. |

A pnpm workspace (`packages/*`, `examples/*`) built with Turborepo.

## Entry Points

| Entry point | Peer dependencies | What it gives you |
| --- | --- | --- |
| `@preprio/toolkit` | none | Vanilla core: `processPreprRequest`, `createPreprToolbar`, the pixel facade, header-based server helpers. |
| `@preprio/toolkit/nextjs` | `next` >= 13, `react` >= 17, `react-dom` >= 17 | Middleware, `next/headers` server helpers, React components. |
| `@preprio/toolkit/nextjs/image-loader` | `next` | Custom `next/image` loader for Prepr's stream CDN. |
| `@preprio/toolkit/astro` | none | Astro middleware and `Headers`-based server helpers. |
| `@preprio/toolkit/astro/components/*` | none | `PreprToolbar.astro`, `PreprTrackingPixel.astro` (ship as source). |
| `@preprio/toolkit/sveltekit` | none | `preprHandle` hook and `Headers`-based server helpers. |
| `@preprio/toolkit/sveltekit/components/*` | `svelte` | `PreprToolbar.svelte`, `PreprTrackingPixel.svelte` (ship as source). |

All peer dependencies are optional — installing without React or Next.js is fine as long as you only import the entry points you have dependencies for.

## Configuration

### Environment Variables

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `PREPR_GRAPHQL_URL` | Yes | — | Your Prepr GraphQL endpoint URL. The name is yours to choose; it is passed to `getToolbarProps` as a plain string. |
| `PREPR_ENV` | Yes | — | Environment mode: `preview` or `production`. Read from the environment directly by the Next.js and Astro wrappers. |

### The preview gate

Preview mode is gated on **two** conditions that must both hold:

- **The app opts in** — `{ preview: true }` passed to the middleware.
- **`PREPR_ENV=preview`** — checked at request time.

So a stray `preview: true` left in your code cannot switch preview mode on in production. `getToolbarProps` follows the same gate: outside preview mode it returns empty props immediately, with no header read and no API call — which is why it is safe to call unconditionally in a root layout.

SvelteKit is the one exception: its `getToolbarProps` does not read env, because SvelteKit's env story is `$env` rather than `process.env` in bundled package code. Gate it yourself in `+layout.server.ts`.

## Running the Examples

Each example needs its own `.env`. Copy the template and fill in your token:

```bash
cp examples/nextjs/.env.example examples/nextjs/.env
```

Then install once at the root and start the example you want:

```bash
pnpm install
```

```bash
pnpm --filter example-nextjs dev
```

The other examples follow the same pattern — `example-astro`, `example-sveltekit`, and `example-express`. The examples consume `@preprio/toolkit` through the workspace, so build the package first (or run `pnpm build` at the root, which builds everything in dependency order) before starting one for the first time.

## Development

```bash
pnpm install       # install all workspace dependencies
pnpm build         # build every package and example, in dependency order
pnpm test          # run the test suites
pnpm typecheck     # typecheck everything
```

All three commands run through Turborepo, so they are cached and only re-run what changed. To scope one to a single workspace:

```bash
pnpm --filter @preprio/toolkit test
```

The toolbar's CSS is compiled from `.css` sources into `*.generated.ts` files by `scripts/compile-css.mjs`. This runs automatically before build, test, and typecheck — the generated files are gitignored, so a fresh clone has none until you run one of those commands.

Every push to `main` and every pull request runs the same `typecheck`, `test`, and `build` via the `CI` workflow.

## Releasing

Push a `v*` tag and CI builds and publishes to npm. See [`RELEASING.md`](./RELEASING.md) for the full walkthrough.

## How It Works

### Middleware

On each request the middleware:

1. **Generates customer IDs** — assigns a unique visitor identifier, persisted in the `__prepr_uid` cookie.
2. **Tracks UTM parameters** — lifts `utm_*` query params into `Prepr-Context-*` headers.
3. **Manages segments** — resolves the active segment from cookie or preview query param.
4. **Processes A/B tests** — resolves the active variant the same way.
5. **Sets headers** — makes all of the above visible to your server-side code.

Cookie and query-parameter names are a frozen wire protocol shared with the Prepr editor.

### Toolbar

- **Segment selection** — preview the site as any configured audience segment.
- **A/B testing** — toggle between variants A and B.
- **Edit mode** — click-to-edit, jumping straight to the field in Prepr.
- **Reset** — clear all personalization overrides.

The toolbar renders with Preact into a shadow-DOM custom element (`<prepr-toolbar>`), which keeps its styles isolated from the host page in both directions. Theme it through `--prepr-*` CSS custom properties.

### Visual Editing

With edit mode enabled the toolkit scans for stega-encoded content, strips the invisible Unicode characters after load so they cannot cause layout shifts, highlights editable elements by cursor proximity, and talks to the Prepr editor over a `postMessage` bridge when running inside the live-preview iframe.

Stega cleaning is automatic — no `vercelStegaSplit` calls or hand-managed hidden spans required.

## Troubleshooting

### Toolbar not showing

- **Check the environment**: `PREPR_ENV=preview` must be set. Both halves of the gate are required — `{ preview: true }` alone does nothing.
- **Verify the GraphQL URL**: it must match `https://graphql.prepr.io/YOUR_ACCESS_TOKEN`.
- **Check the token permissions**: "Enable edit mode" must be checked on the token in Prepr.
- **Confirm the middleware matcher**: if it excludes the current path, no Prepr headers were set for it.

### Headers not working

- **Middleware setup**: confirm the middleware file is in the right place and its matcher covers the route.
- **API calls**: personalization only works if you spread `getPreprHeaders()` into your GraphQL fetch. This is the most common reason segments appear to have no effect.

For the full troubleshooting list, including build issues and error codes, see the [package README](./packages/toolkit/README.md#troubleshooting).

## Support

- **Documentation**: [Prepr Documentation](https://docs.prepr.io)
- **Support**: [Prepr Support](https://prepr.io/support)
