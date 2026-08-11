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
```

Set up middleware in `middleware.ts`:

```typescript
import type { NextRequest } from 'next/server';
import { createPreprMiddleware } from '@preprio/toolkit/nextjs';

export function middleware(request: NextRequest) {
  // You decide what "preview" means — the toolkit reads no env vars itself.
  // On Vercel, `process.env.VERCEL_ENV !== 'production'` is the usual choice.
  const preview = process.env.NODE_ENV !== 'production';
  return createPreprMiddleware(request, { preview });
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
| `packages/toolkit` | The published `@preprio/toolkit` package — vanilla core plus the Next.js, Nuxt, Astro, and SvelteKit wrappers. |
| `examples/nextjs` | App Router, middleware, Apollo Client, custom image loader. |
| `examples/astro` | Astro middleware and the `.astro` components. |
| `examples/sveltekit` | `hooks.server.ts`, `+layout.server.ts`, the `.svelte` components. |
| `examples/nuxt` | Nitro middleware, `runtimeConfig`, the `.vue` components. |
| `examples/express` | Vanilla core — a hand-written adapter for an unsupported framework. |

A pnpm workspace (`packages/*`, `examples/*`) built with Turborepo.

## Entry Points

| Entry point | Peer dependencies | What it gives you |
| --- | --- | --- |
| `@preprio/toolkit` | none | Vanilla core: `processPreprRequest`, `createPreprPreview`, the pixel facade, header-based server helpers. |
| `@preprio/toolkit/nextjs` | `next` >= 13, `react` >= 17, `react-dom` >= 17 | Middleware, `next/headers` server helpers, React components. |
| `@preprio/toolkit/nextjs/image-loader` | `next` | Custom `next/image` loader for Prepr's stream CDN. |
| `@preprio/toolkit/astro` | none | Astro middleware and `Headers`-based server helpers. |
| `@preprio/toolkit/astro/components/*` | none | `PreprToolbar.astro`, `PreprTrackingPixel.astro` (ship as source). |
| `@preprio/toolkit/sveltekit` | none | `preprHandle` hook and `Headers`-based server helpers. |
| `@preprio/toolkit/sveltekit/components/*` | `svelte` | `PreprToolbar.svelte`, `PreprTrackingPixel.svelte` (ship as source). |
| `@preprio/toolkit/nuxt` | none | `handlePreprRequest` Nitro handler and `H3Event`-based server helpers. |
| `@preprio/toolkit/nuxt/components/*` | `vue` | `PreprToolbar.vue`, `PreprTrackingPixel.vue` (ship as source). |

All peer dependencies are optional — installing without React or Next.js is fine as long as you only import the entry points you have dependencies for.

## Configuration

### Environment Variables

**The toolkit reads no environment variables of its own.** Every value reaches it as an explicit argument, so you choose the variable names and how they are loaded.

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `PREPR_GRAPHQL_URL` | Yes | — | Your Prepr GraphQL endpoint URL. The name is yours to choose; it is passed to `getToolbarProps` as a plain string. |

Because the URL embeds an access token, keep it server-side. Only expose it to the browser through a framework-public variable (`PUBLIC_`/`NUXT_PUBLIC_`) when you intend the token to be public.

### The preview gate

Preview mode is gated on exactly one thing the toolkit checks: **the app opts in**, by passing `{ preview: true }` to the middleware.

Deciding *when* that is true is yours — the toolkit never inspects the environment. The examples use `process.env.NODE_ENV !== 'production'`; on Vercel, `process.env.VERCEL_ENV !== 'production'` is the usual choice. Whatever you pick, make sure it evaluates to `false` in production, since a hardcoded `preview: true` will enable preview mode there.

`getToolbarProps` follows the same gate: outside preview mode it returns empty props immediately, with no header read and no API call — which is why it is safe to call unconditionally in a root layout.

### Feature flags

Preview mode is the master switch. Within it, each feature can be turned off individually with a `features` object. Every feature is **on by default** — omit the object entirely and nothing changes.

```ts
import type { PreprFeatures } from '@preprio/toolkit'

export const preprFeatures: PreprFeatures = {
  segments: false,               // or { enabled: false }
  abTesting: true,
  editMode: { enabled: false },
}
```

Pass the **same object to both sides** — the middleware and the toolbar. Each enforces its own half, so a feature disabled in only one place is still half-on:

```ts
// server
createPreprMiddleware(request, { preview: true, features: preprFeatures })
getToolbarProps(graphqlUrl, preprFeatures)

// client
<PreprToolbar {...toolbarProps} options={{ features: preprFeatures }} />
```

The examples keep this in one module (`src/prepr-features.ts`, or `shared/prepr-features.ts` in Nuxt) that both sides import.

| Feature | Off means |
| --- | --- |
| `segments` | No segment picker. No `Prepr-Segments` header, from cookie **or** `?prepr_preview_segment`. No segment cookie written. The `_Segments` API call is skipped, saving a round-trip per page. |
| `abTesting` | No A/B control or variant badge. No `Prepr-ABtesting` header, from cookie **or** `?prepr_preview_ab`. No variant cookie written. |
| `editMode` | No Edit mode control, no click-to-edit overlay, no close-edit pill. |

Disabling a feature also stops its `segment_changed` / `variant_changed` events, and the Reset button ignores it — so state the user cannot see is never rewritten.

**`editMode` does not disable the Prepr visual editor.** It governs your site's own click-to-edit affordance. When the Prepr editor frames your site it drives edit mode over its own `postMessage` handshake, which stays working regardless — that is the CMS operating inside its own iframe, not something offered to your visitors. Treat `editMode: false` as a UI choice, never as a security control.

Feature flags govern the toolbar and the middleware. The scroll-sync entry point below carries no personalization state, so nothing there to disable.

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

### Code comments

This is a published package: every comment ships to npm and shows up in consumers' editors through the `.d.ts` files. Write them for an external developer who has never seen this repo and has no access to the discussion that produced the code.

- **Explain why, not what.** The code says what it does. A comment earns its place by recording the constraint, browser quirk, or bug that forced the shape — like the `navigate` race in [`toolbar-change-handler.ts`](./packages/toolkit/src/core/toolbar-change-handler.ts).
- **No internal shorthand or process labels.** No tool names, ticket IDs, agent or workflow markers, or personal conventions as comment prefixes.
- **No conversational voice.** Not "as we discussed", "for now", "you asked for", or first-person narration. State the fact in the present tense.
- **No `TODO`/`FIXME`/`HACK`.** Open work belongs in an issue, where it is tracked and searchable, not in a published `.d.ts`.
- **Describe the code, not its history.** "Batches every param write into a single call" ages well; "changed this to fix the reset bug" is meaningless to a reader who never saw the old version.
- **Reference public API, not file layout.** Consumers can see `createPreprPreview`; they cannot see `src/core/create-preview.ts`. Internal cross-references are fine in `.ts` sources but should not leak into exported doc comments.

Public exports get a JSDoc block covering what the function does, when to reach for it, and any gotcha a caller cannot infer from the signature.

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

### Headless preview (no toolbar UI)

`createPreprPreview` is the single client entry point, with two independent axes:

- **`features`** — *what runs*: segments, A/B testing, click-to-edit.
- **`ui`** — *whether the toolbar is visible*. Defaults to `true`.

`ui: false` keeps every non-visual side effect wired — click-to-edit, the editor bridge, scroll restore, cookies and headers — while rendering no chrome of its own. That is how a site gets live editing, or editor scroll restore, alongside its own UI instead of the Prepr bar.

```js
import { createPreprPreview } from '@preprio/toolkit'

// Live editing, no bar:
const preview = createPreprPreview({
  options: { ui: false, features: { editMode: true } },
})

// Later, on teardown (SPA route change, component unmount):
preview.destroy()
```

`props` is optional — a headless preview that only wants click-to-edit or scroll restore has no segment list to pass.

Scroll restore comes free with any preview, headless or not. Inside the live-preview iframe the editor saves and restores the reader's position over the same `postMessage` bridge, with no extra call and no configuration. For scroll restore and nothing else:

```js
createPreprPreview({
  options: {
    ui: false,
    features: { segments: false, abTesting: false, editMode: false },
  },
})
```

Framework-agnostic: it uses only `window`, `document` and `postMessage`, so it works in React, Vue, Svelte, Astro or plain HTML. It lives on the root `@preprio/toolkit` entry point — the framework subpaths are server/middleware-only and do not re-export it.

`?prepr_hide_bar=true` and the editor's own iframe both imply `ui: false`; the bridge stays connected in each case, so scroll position is still restored. Outside an iframe the bridge is a no-op, so mounting unconditionally is safe.

Self-hosted editors can pass an exact origin list, which replaces the `*.prepr.io` wildcard:

```js
createPreprPreview({ options: { allowedEditorOrigins: ['https://cms.example.com'] } })
```

**Call it once per page.** Two `createPreprPreview` calls start two bridges and announce the preview twice.

The handshake is only ever accepted from `https://<tenant>.prepr.io`, or from `allowedEditorOrigins` when set.

## Troubleshooting

### Toolbar not showing

- **Check the preview gate**: `{ preview: true }` must actually evaluate to `true` for this request. The toolkit reads no environment variables, so whatever expression you passed to the middleware is the only gate.
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
