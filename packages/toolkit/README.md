# @preprio/toolkit

> **Beta — pre-1.0.** The package is published to `latest` and is safe to use, but the
> public API can still change between minor versions (`0.2.x` → `0.3.0`). Every change
> is documented in [Breaking changes](https://github.com/preprio/prepr-toolkit/blob/main/RELEASING.md#breaking-changes). Pin an exact
> version in production, or use a tilde range (`~0.2.0`) so you only pick up patches.

A framework-agnostic TypeScript library that provides preview functionality, visual editing, and A/B testing for [Prepr CMS](https://prepr.io). Ships thin wrappers for Next.js, Nuxt, Astro, and SvelteKit on top of a vanilla core that runs anywhere.

Every integration is the same three steps:

1. **Middleware** — resolves the visitor's customer ID, segment, and A/B variant into request headers.
2. **Layout** — mounts the preview toolbar and the tracking pixel.
3. **Data fetching** — forwards the Prepr headers on your GraphQL requests, so Prepr returns personalized content.

Jump to your framework: [Next.js](#nextjs) · [Astro](#astro) · [SvelteKit](#sveltekit) · [Nuxt](#nuxt) · [React without a framework](#react-no-framework) · [anything else](#any-other-framework).

Coming from `@preprio/prepr-nextjs`? See the [migration guide](https://github.com/preprio/prepr-toolkit/blob/main/MIGRATION.md).

## Quick Start (Next.js)

```bash
npm install @preprio/toolkit
# or
pnpm add @preprio/toolkit
```

Add your Prepr GraphQL URL (Settings → Access tokens in Prepr) to your `.env`. The toolkit reads **no environment variables itself** — the name is yours; you pass the value in explicitly:

```bash
PREPR_GRAPHQL_URL=https://graphql.prepr.io/{YOUR_ACCESS_TOKEN}
```

**`middleware.ts`**

```typescript
import type { NextRequest } from 'next/server';
import { createPreprMiddleware } from '@preprio/toolkit/nextjs';

export function middleware(request: NextRequest) {
  // `preview` is the only gate. Resolve it however your deployment already
  // does — VERCEL_ENV, NODE_ENV, a branch check, your own feature flag.
  const preview = process.env.VERCEL_ENV !== 'production';
  return createPreprMiddleware(request, { preview });
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
```

**`app/layout.tsx`**

```tsx
import type { ReactNode } from 'react';
import {
  extractAccessToken,
  getToolbarProps,
  PreprToolbar,
  PreprTrackingPixel,
} from '@preprio/toolkit/nextjs';

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  const preview = process.env.VERCEL_ENV !== 'production';
  const toolbarProps = preview
    ? await getToolbarProps(process.env.PREPR_GRAPHQL_URL!)
    : null;
  const accessToken = extractAccessToken(process.env.PREPR_GRAPHQL_URL!);

  return (
    <html lang="en">
      <body>
        {children}
        {toolbarProps && <PreprToolbar {...toolbarProps} />}
        {accessToken && <PreprTrackingPixel id={accessToken} />}
      </body>
    </html>
  );
}
```

**Data fetching** — spread `getPreprHeaders()` into every Prepr GraphQL request:

```typescript
import { getPreprHeaders } from '@preprio/toolkit/nextjs';

const response = await fetch(process.env.PREPR_GRAPHQL_URL!, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    ...(await getPreprHeaders()),
  },
  body: JSON.stringify({ query, variables }),
  cache: 'no-store',
});
```

No CSS import is needed. The toolbar renders into a shadow-DOM custom element (`<prepr-toolbar>`) with its styles inlined, so it can neither leak into nor inherit from your page's stylesheets.

## Prerequisites

- **Node.js 18.17 or later**
- **A Prepr account** — [prepr.io](https://prepr.io)
- **A Prepr GraphQL URL**:
  1. Go to Settings → Access tokens and open your **GraphQL Preview** access token.
  2. Copy the full GraphQL URL — always `https://graphql.prepr.io/{YOUR_ACCESS_TOKEN}`.
  3. Check **"Enable edit mode"** on the token and save (required for click-to-edit).

Per-framework peer dependencies — all optional; installing without them is fine as long as you only import the entry points you have dependencies for:

| Entry point                       | Peer dependencies                                       |
| --------------------------------- | ------------------------------------------------------- |
| `@preprio/toolkit` (vanilla core) | none                                                    |
| `@preprio/toolkit/react`          | `react` >= 17, `react-dom` >= 17                        |
| `@preprio/toolkit/nextjs`         | `next` >= 13, `react` >= 17, `react-dom` >= 17          |
| `@preprio/toolkit/astro`          | none (`.astro` components compile in your own pipeline) |
| `@preprio/toolkit/sveltekit`      | `svelte` (only for the `.svelte` components)            |
| `@preprio/toolkit/nuxt`           | `vue` (only for the `.vue` components)                  |

## The preview gate

Three rules hold across every framework:

1. **The toolkit reads no environment variables.** Every value reaches it as an explicit argument, so behavior is identical across frameworks and bundlers. Because the GraphQL URL embeds an access token, keep it server-side unless you intend it to be public.

2. **Preview mode is one boolean: the `preview` option you pass to the middleware.** Resolve it from whatever already distinguishes your environments — `VERCEL_ENV`, `NODE_ENV`, SvelteKit's `dev`, Astro's `import.meta.env.DEV`, a branch check, your own feature flag. A hardcoded `{ preview: true }` enables preview everywhere, **production included**.

3. **`getToolbarProps` is ungated — it fetches whenever you call it.** Gate the call on the same flag you pass the middleware:

   ```typescript
   const toolbarProps = preview ? await getToolbarProps(token) : null;
   ```

   It never throws: a failed segment fetch degrades to an empty segment list, so no `try`/`catch` or error boundary is required.

## Next.js

The [Quick Start](#quick-start-nextjs) above is the complete basic setup. This section covers the extras.

Despite the `create` prefix, `createPreprMiddleware` runs per request — it does not return a handler.

### Chaining with existing middleware

Pass an existing `NextResponse` as the second argument to fold Prepr's headers and cookies onto a response another middleware already produced:

```typescript
import { NextResponse, type NextRequest } from 'next/server';
import { createPreprMiddleware } from '@preprio/toolkit/nextjs';

const preview = process.env.VERCEL_ENV !== 'production';

export function middleware(request: NextRequest) {
  const response = NextResponse.next();

  if (request.nextUrl.pathname.startsWith('/admin')) {
    response.headers.set('x-admin-route', 'true');
  }

  return createPreprMiddleware(request, response, { preview });
}
```

With next-intl (return its redirects before Prepr runs):

```typescript
import type { NextRequest } from 'next/server';
import createIntlMiddleware from 'next-intl/middleware';
import { createPreprMiddleware } from '@preprio/toolkit/nextjs';

const intlMiddleware = createIntlMiddleware({
  locales: ['en', 'de', 'fr'],
  defaultLocale: 'en',
});

const preview = process.env.VERCEL_ENV !== 'production';

export function middleware(request: NextRequest) {
  const intlResponse = intlMiddleware(request);

  if (intlResponse.status >= 300 && intlResponse.status < 400) {
    return intlResponse;
  }

  return createPreprMiddleware(request, intlResponse, { preview });
}
```

To skip Prepr for some routes entirely, return early with `NextResponse.next()` before calling `createPreprMiddleware` — or exclude them in `config.matcher`.

### Tracking pixel

The pixel collects the interaction data that powers personalization and A/B testing. Include it in **all** environments, preview and production alike — the Quick Start layout already does. `PreprTrackingPixel` renders nothing and loads the CDN script on mount, so its position in the tree does not matter.

### With Apollo Client

```typescript
import { getClient } from '@/lib/client';
import { GetPageBySlugDocument } from '@/gql/graphql';
import { getPreprHeaders } from '@preprio/toolkit/nextjs';

async function getPage(slug: string) {
  const { data } = await getClient().query({
    query: GetPageBySlugDocument,
    variables: { slug },
    context: { headers: await getPreprHeaders() },
    fetchPolicy: 'no-cache',
  });

  return data;
}
```

### Image loader

Prepr's stream CDN resizes at the edge. Routing `next/image` through the bundled loader makes Next request the exact width it needs, instead of pulling the full-resolution original and re-encoding it through `/_next/image`.

Next joins `loaderFile` against the app root and checks it with `existsSync`, so a bare package specifier will not resolve. Add a one-line wrapper file in your app root:

```typescript
// prepr-image-loader.ts
export { default } from '@preprio/toolkit/nextjs/image-loader';
```

```typescript
// next.config.ts
export default {
  images: {
    loader: 'custom',
    loaderFile: './prepr-image-loader.ts',
  },
};
```

The API emits each asset's real dimensions, so a Prepr URL renders as-is:

```
https://393qibegr87z.b-cdn.net/w_800,h_600,fx_75,fy_67/b7ijwafd586-photo.jpg
```

The loader rewrites `w_` to the width Next asks for and scales `h_` alongside it, holding the emitted ratio — for a cropped asset that ratio is the authored crop box, so the crop survives the resize. Focal points (`fx`/`fy`) are percentages and carry through unchanged, as does any other option in the segment. Quality is not a CDN option and is ignored. URLs with no transform segment pass through untouched — set `unoptimized` on those `<Image>`s.

See the runnable example at `examples/nextjs` for the full source of truth.

## Astro

**`src/middleware.ts`**

```typescript
import { onPreprRequest } from '@preprio/toolkit/astro';
import { defineMiddleware } from 'astro:middleware';

export const onRequest = defineMiddleware((context, next) =>
  onPreprRequest(context, next, { preview: import.meta.env.DEV }),
);
```

**Layout** — the same preview flag gates `getToolbarProps`:

```astro
---
import PreprToolbar from '@preprio/toolkit/astro/components/PreprToolbar';
import PreprTrackingPixel from '@preprio/toolkit/astro/components/PreprTrackingPixel';
import { extractAccessToken, getToolbarProps } from '@preprio/toolkit/astro';

const preview = import.meta.env.DEV;
const toolbarProps = preview
  ? await getToolbarProps(Astro.request.headers, import.meta.env.PREPR_GRAPHQL_URL)
  : null;
const accessToken = extractAccessToken(import.meta.env.PREPR_GRAPHQL_URL);
---

<html lang="en">
  <body>
    <slot />
    {toolbarProps && <PreprToolbar {...toolbarProps} />}
    {accessToken && <PreprTrackingPixel id={accessToken} />}
  </body>
</html>
```

**Data fetching** — the Astro helpers are synchronous and take the request's `Headers`:

```typescript
import { getPreprHeaders } from '@preprio/toolkit/astro';

const headers = getPreprHeaders(Astro.request.headers);
```

`import.meta.env.DEV` is Astro's own dev flag; swap in whatever signal marks preview in your deployment.

The `.astro` components ship as source, compiled by your own Astro/Vite pipeline. They use full-page navigation by default, matching Astro's MPA model — switching segment or variant re-runs the server-rendered output.

See the runnable example at `examples/astro` for the full source of truth.

## SvelteKit

**`src/hooks.server.ts`**

```typescript
import { dev } from '$app/environment';
import { preprHandle } from '@preprio/toolkit/sveltekit';

export const handle = preprHandle({ preview: dev });
```

**`src/routes/+layout.server.ts`** — the same flag gates `getToolbarProps`:

```typescript
import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';
import { getToolbarProps } from '@preprio/toolkit/sveltekit';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ request }) => {
  if (!dev) return { toolbarProps: null };

  const toolbarProps = await getToolbarProps(
    request.headers,
    env.PREPR_GRAPHQL_URL!,
  );
  return { toolbarProps };
};
```

**`src/routes/+layout.svelte`**

```svelte
<script lang="ts">
  import PreprToolbar from '@preprio/toolkit/sveltekit/components/PreprToolbar';
  import PreprTrackingPixel from '@preprio/toolkit/sveltekit/components/PreprTrackingPixel';
  import type { LayoutData } from './$types';

  let { data, children }: { data: LayoutData; children: import('svelte').Snippet } = $props();
</script>

{@render children()}
<PreprTrackingPixel id="YOUR_ACCESS_TOKEN" />
{#if data.toolbarProps}
  <PreprToolbar {...data.toolbarProps} />
{/if}
```

**Data fetching** — in `load` functions and endpoints, read the headers the hook already computed off `event.locals`:

```typescript
import { getPreprHeadersFromLocals } from '@preprio/toolkit/sveltekit';

const preprHeaders = getPreprHeadersFromLocals(event.locals);
```

The `.svelte` components ship as source (compiled by your own Vite/Svelte pipeline) and mount client-side via `onMount`, so they never run during SSR.

See the runnable example at `examples/sveltekit` for the full source of truth.

## Nuxt

Requires Nitro's Node.js preset (the Nuxt default).

**`server/middleware/prepr.ts`**

```typescript
import { handlePreprRequest } from '@preprio/toolkit/nuxt';

export default defineEventHandler((event) => {
  handlePreprRequest(event, { preview: import.meta.dev });
});
```

**`app/app.vue`** — resolve the toolbar props on the server, gated on the same flag:

```vue
<script setup lang="ts">
import { getToolbarProps } from '@preprio/toolkit/nuxt';
import PreprToolbar from '@preprio/toolkit/nuxt/components/PreprToolbar';
import PreprTrackingPixel from '@preprio/toolkit/nuxt/components/PreprTrackingPixel';

const requestHeaders = useRequestHeaders();
const { data: toolbarProps } = await useAsyncData('prepr-toolbar', async () => {
  if (!import.meta.dev) return null;
  return getToolbarProps(
    new Headers(requestHeaders as Record<string, string>),
    useRuntimeConfig().public.preprGraphqlUrl,
  );
});
</script>

<template>
  <NuxtPage />
  <PreprTrackingPixel id="YOUR_ACCESS_TOKEN" />
  <PreprToolbar v-if="toolbarProps" v-bind="toolbarProps" />
</template>
```

**Data fetching** — the middleware folds the computed Prepr headers back onto the incoming request. Read them via `useRequestHeaders()` in composables, or straight off the h3 event in server routes:

```typescript
import { getPreprHeadersFromEvent } from '@preprio/toolkit/nuxt';

const preprHeaders = getPreprHeadersFromEvent(event);
```

The `.vue` components ship as source (compiled by your own Vite/Vue pipeline) and mount client-side via `onMounted`, so they never run during SSR.

See the runnable example at `examples/nuxt` for the full source of truth.

## React (no framework)

`@preprio/toolkit/react` carries the two components that need nothing but React — for Vite + React Router, TanStack Router, Remix SPA mode, or Create React App. Next.js users want the [Next.js section](#nextjs) instead; its `PreprToolbar` binds the App Router for you.

```tsx
import { PreprPreview, PreprTrackingPixel } from '@preprio/toolkit/react';

export function App() {
  return (
    <>
      <YourRoutes />
      {import.meta.env.DEV && <PreprPreview />}
      <PreprTrackingPixel id={import.meta.env.VITE_PREPR_TRACKING_ID} />
    </>
  );
}
```

Mount `PreprPreview` once per page — two copies start two editor bridges.

### Without personalization

A client-rendered app with no segments and no A/B testing needs **no middleware and no server helpers at all**. The middleware exists to resolve segment and variant cookies into request headers; with both features off there are no headers to resolve. What remains — click-to-edit and the editor's scroll restore — is purely client-side:

```tsx
<PreprPreview options={{ features: { segments: false, abTesting: false } }} />
```

No `navigation` prop or router context is needed in this configuration; the component can mount anywhere in the tree.

### With personalization

Segments and A/B testing need request headers, which need a server — either a framework with one (React Router in framework mode, Next.js) or your own backend using the [vanilla core](#any-other-framework).

Once there is a server, pass a `navigation` adapter so segment and variant switches route softly instead of reloading:

```tsx
import { useNavigate, useLocation } from 'react-router';

const navigate = useNavigate();
const location = useLocation();

<PreprPreview
  {...toolbarProps}
  navigation={{
    navigate: (url) => navigate(url),
    currentPath: () => location.pathname + location.search,
  }}
/>;
```

`navigation.reload` is optional and defaults to `window.location.reload()`. React Router has no soft-refresh equivalent, so leaving it unset is usually right.

### Tracking pageviews

`loadTrackingPixel` queues one `pageload` event when it installs. Client-side route changes emit nothing on their own, so fire them yourself:

```tsx
import { useEffect } from 'react';
import { useLocation } from 'react-router';
import { trackEvent } from '@preprio/toolkit';

function usePreprPageviews() {
  const { pathname } = useLocation();

  useEffect(() => {
    trackEvent('pageload');
  }, [pathname]);
}
```

This double-counts the first pageview, since the pixel's own install event fires too. Skip the initial run with a ref if the exact count matters.

The `id` is your access token, and in a client-rendered app it is public — bundled into JS and visible in devtools. Use a tracking-only token; do not derive it from a browser-exposed GraphQL URL, which would also expose content read access.

## Any other framework

The core is runtime-neutral: it works off a WHATWG `Request` and hands back the headers to forward to Prepr plus the cookies to persist. Adapting it to Express, Hono, Fastify, or a plain server is roughly twenty lines.

**Server** — translate your framework's request and response to and from those neutral shapes:

```javascript
import { processPreprRequest } from '@preprio/toolkit';

export function preprMiddleware({ preview } = {}) {
  return (req, res, next) => {
    const { requestHeaders, responseCookies } = processPreprRequest(
      toWebRequest(req),
      {
        preview,
      },
    );

    for (const cookie of responseCookies) {
      res.cookie(cookie.name, cookie.value, {
        maxAge: cookie.maxAge * 1000,
        path: cookie.path,
      });
    }

    res.locals.preprHeaders = requestHeaders;
    next();
  };
}
```

Forward the headers on your GraphQL fetch with `getPreprHeadersFromHeaders(requestHeaders)`, and resolve toolbar props with `getToolbarPropsFromHeaders(requestHeaders, graphqlUrl)`.

**Client** — mount the toolbar imperatively:

```javascript
import { createPreprPreview, loadTrackingPixel } from '@preprio/toolkit';

loadTrackingPixel('YOUR_ACCESS_TOKEN');

const controller = createPreprPreview({ props: toolbarProps });
// later: controller.destroy()
```

Serialize the server-computed props into the page — a `<script type="application/json">` tag works well — and read them back on the client. See the runnable example at `examples/express` for the full source of truth.

## API Reference

### Framework server helpers

Each wrapper exposes the same five helpers, differing only in how they reach the request headers. The Next.js versions read `next/headers` and are async; the Astro, SvelteKit, and Nuxt versions take a standard `Headers` (`Astro.request.headers`, `event.request.headers`, or one built from `useRequestHeaders()`) and are sync, except `getToolbarProps`.

| Helper             | Next.js                        | Astro / SvelteKit / Nuxt                | Returns                                                                                                 |
| ------------------ | ------------------------------ | --------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `getPreprUUID`     | `await getPreprUUID()`         | `getPreprUUID(headers)`                 | Visitor's Prepr Customer ID, or `null` when the middleware did not run for this request.                |
| `getActiveSegment` | `await getActiveSegment()`     | `getActiveSegment(headers)`             | Active segment ID, or `null`.                                                                           |
| `getActiveVariant` | `await getActiveVariant()`     | `getActiveVariant(headers)`             | `'A'`, `'B'`, or `null`.                                                                                |
| `getPreprHeaders`  | `await getPreprHeaders()`      | `getPreprHeaders(headers)`              | All Prepr headers as an object, ready to spread into a fetch.                                           |
| `getToolbarProps`  | `await getToolbarProps(token)` | `await getToolbarProps(headers, token)` | `{ activeSegment, activeVariant, segments }`. Never throws — failures degrade to an empty segment list. |

`getPreprUUID()` returning `null` is a useful check when headers seem to be missing — it means the middleware did not cover the route.

### Token helpers

Exported from every entry point, including the core.

- **`validatePreprToken(token)`** — asserts a Prepr GraphQL URL is well formed. Returns nothing; **throws** `PreprError` on a bad value (`MISSING_TOKEN` when empty, `INVALID_TOKEN` when not an HTTPS URL).
- **`extractAccessToken(url)`** — extracts the access token from a Prepr GraphQL URL — the value `PreprTrackingPixel` needs as its `id`. Always returns a `string`; a URL that is malformed, not on `graphql.prepr.io`, or missing a token segment throws `PreprError(INVALID_TOKEN)`.

```typescript
const token = extractAccessToken('https://graphql.prepr.io/abc123');
// 'abc123'
```

### Components

#### `PreprToolbar`

The toolbar. Takes the props returned by `getToolbarProps`, and renders nothing itself — the UI is a shadow-DOM custom element mounted imperatively. There is no provider to wrap your tree in; state lives in the toolbar's own store.

```tsx
<PreprToolbar {...toolbarProps} />
```

#### `PreprPreview`

From `@preprio/toolkit/react`. The framework-free equivalent of `PreprToolbar`: same preview runtime, with the router binding left to you. Renders nothing.

| Prop                                           | Type                     | Description                                                                                                             |
| ---------------------------------------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `activeSegment` / `activeVariant` / `segments` | —                        | Toolbar data, as returned by `getToolbarProps`. Optional for a headless preview.                                        |
| `options`                                      | `PreprPreviewOptions`    | Feature flags, `ui`, locale, debug (see [Preview options](#preview-options)).                                           |
| `navigation`                                   | `PreprNavigationAdapter` | Optional router binding. Defaults to `window.location`, which is correct for any router that keeps the URL bar in sync. |

Every prop is read once on mount; changing one afterwards has no effect, since a live update would have to tear down the editor bridge and re-announce the preview. Remount to change configuration.

#### `PreprTrackingPixel`

Loads Prepr's CDN tracking pixel on mount. Renders nothing. Exported from both `@preprio/toolkit/react` and `@preprio/toolkit/nextjs` — the same component, with nothing Next-specific about it.

```tsx
<PreprTrackingPixel
  id={accessToken}
  config={{ destinations: { googleTagManager: true } }}
/>
```

| Prop     | Type               | Description                                                         |
| -------- | ------------------ | ------------------------------------------------------------------- |
| `id`     | `string`           | Prepr tracking/access token. Required.                              |
| `config` | `PreprPixelConfig` | Optional pixel configuration (see [Pixel options](#pixel-options)). |

### Core exports

Available from `@preprio/toolkit` for apps outside the supported frameworks.

#### `processPreprRequest(request, options?)`

Computes the Prepr headers and cookies for a WHATWG `Request`.

```typescript
const { requestHeaders, responseCookies } = processPreprRequest(request, {
  preview: true,
});
// requestHeaders: Headers        — forward downstream and on to Prepr
// responseCookies: CookieSpec[]  — { name, value, maxAge, path }
```

#### `createPreprPreview(options)`

Starts the preview runtime — optionally mounting the toolbar — and returns a controller.

```typescript
const controller = createPreprPreview({
  props: toolbarProps,
  options: { debug: true, locale: 'nl' },
  navigation: {
    navigate: (url) => router.push(url),
    currentPath: () => window.location.pathname + window.location.search,
    reload: () => router.refresh(),
  },
});

controller.destroy();
```

| Option       | Type                     | Description                                                                                                                                                                                                                                                                                      |
| ------------ | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `props`      | `PreprToolbarProps`      | From `getToolbarProps`. Optional — a headless preview has no segment list to pass.                                                                                                                                                                                                               |
| `options`    | `PreprPreviewOptions`    | `{ debug?, locale?, features?, ui?, allowedEditorOrigins? }`. See [Preview options](#preview-options).                                                                                                                                                                                           |
| `navigation` | `PreprNavigationAdapter` | How segment/variant switches navigate. Optional — omitted, the toolbar uses `window.location.assign` (a full page load). `reload` is optional too, runs after a preview-mode toggle, and defaults to `window.location.reload()`. The Next.js and SvelteKit wrappers wire all of this up for you. |

`createPreprPreview` is a no-op outside a browser (no `window`/`document`) and returns a controller whose `destroy()` does nothing, so it is safe to call during SSR. Call it **once per page** — two calls start two bridges and announce the preview twice.

#### Tracking

- **`loadTrackingPixel(id, config?)`** — installs the CDN tracking pixel. Idempotent, and a no-op outside a browser. A typed facade over Prepr's existing CDN pixel (`https://cdn.tracking.prepr.io/js/prepr-v2.min.js`), reproducing the legacy `<script>` snippet's queue-stub semantics: calls made before the CDN script loads are queued and flushed once it is ready.
- **`trackEvent(name, data?)`** — sends a custom tracking event: `trackEvent('add_to_cart', { productId: 'abc123' })`.
- **`setTrackingParam(key, value)`** — sets a persistent tracking parameter: `setTrackingParam('user_type', 'returning')`.

`trackEvent` and `setTrackingParam` are independent of `loadTrackingPixel` — they work against `window.prepr` however it got installed, including a legacy HTML snippet already on the page. If no pixel is installed at all they warn once in the console and return without throwing.

#### `stegaClean(value)`

Strips stega-encoded characters from a string. Rarely needed, since cleaning is automatic (see [Visual editing](#visual-editing)), but available when you need a clean value for comparison, sorting, or a non-DOM API.

#### Header-based server helpers

The framework wrappers are thin renames of these. Use them directly when writing your own adapter.

```typescript
import {
  getPreprUUIDFromHeaders,
  getActiveSegmentFromHeaders,
  getActiveVariantFromHeaders,
  getPreprHeadersFromHeaders,
  getToolbarPropsFromHeaders,
  getPreprEnvironmentSegments,
} from '@preprio/toolkit';
```

Unlike `getToolbarProps`, `getPreprEnvironmentSegments(token)` throws on failure — see [Error handling](#error-handling).

## Configuration

### Middleware options

```typescript
// Simple usage (creates a new NextResponse)
createPreprMiddleware(request, { preview });

// Chaining usage (folds onto an existing NextResponse)
createPreprMiddleware(request, response, { preview });
```

| Option     | Type            | Description                                                                        |
| ---------- | --------------- | ---------------------------------------------------------------------------------- |
| `preview`  | `boolean`       | Enables preview mode. The only gate — resolve it from your own environment signal. |
| `features` | `PreprFeatures` | Disable features app-wide. See [Feature flags](#feature-flags).                    |
| `version`  | `string`        | Override the version reported in the `Prepr-Package` header. Mainly for tests.     |

### Preview options

```typescript
createPreprPreview({ props, options: { debug: true, locale: 'nl' } });
```

| Option                 | Type            | Default       | Description                                                                                         |
| ---------------------- | --------------- | ------------- | --------------------------------------------------------------------------------------------------- |
| `debug`                | `boolean`       | `false`       | Enable debug logging.                                                                               |
| `locale`               | `'en' \| 'nl'`  | auto-detected | UI language. Falls back to the first supported browser language, then `en`.                         |
| `features`             | `PreprFeatures` | all enabled   | Which features run. See [Feature flags](#feature-flags).                                            |
| `ui`                   | `boolean`       | `true`        | Mount the visible toolbar. See [Headless preview](#headless-preview-no-toolbar-ui).                 |
| `allowedEditorOrigins` | `string[]`      | `*.prepr.io`  | Exact editor origins allowed to drive this preview, for self-hosted editors. Replaces the wildcard. |

`features` and `ui` are independent: `features` decides _what runs_, `ui` decides _whether the toolbar is visible_.

### Feature flags

Preview mode is the master switch. Within it, each feature can be turned off with a `features` object. Everything is **on by default** — omit it and nothing changes.

```typescript
import type { PreprFeatures } from '@preprio/toolkit';

export const preprFeatures: PreprFeatures = {
  segments: false, // or { enabled: false }
  abTesting: true,
  editMode: { enabled: false },
};
```

| Feature     | Off means                                                                                                                                                                                 |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `segments`  | No segment picker. No `Prepr-Segments` header, from cookie **or** `?prepr_preview_segment`. No segment cookie written. The `_Segments` API call is skipped, saving a round-trip per page. |
| `abTesting` | No A/B control or variant badge. No `Prepr-ABtesting` header, from cookie **or** `?prepr_preview_ab`. No variant cookie written.                                                          |
| `editMode`  | No Edit mode control, no click-to-edit overlay, no close-edit pill.                                                                                                                       |

Pass the **same object to both sides**. Each enforces its own half, so a feature disabled in only one place is still half-on — the UI would hide a control the middleware still honours:

```typescript
// server
createPreprMiddleware(request, { preview, features: preprFeatures });
const props = await getToolbarProps(graphqlUrl, preprFeatures);

// client
<PreprToolbar {...props} options={{ features: preprFeatures }} />
```

Every framework's `getToolbarProps` takes `features` as its last argument, and every `<PreprToolbar>` accepts an `options` prop. Keeping the object in one module both sides import is the simplest way to stay in sync — the examples use `src/prepr-features.ts` (`shared/prepr-features.ts` in Nuxt).

Disabling a feature also stops its `segment_changed` / `variant_changed` events, and the Reset button ignores it — state the user cannot see is never rewritten.

**`editMode` does not disable the Prepr visual editor.** It governs your site's own click-to-edit affordance. When the Prepr editor frames your site it drives edit mode over its own `postMessage` handshake, which keeps working regardless — that is the CMS operating inside its own iframe, not an affordance offered to your visitors. Treat `editMode: false` as a UI choice, never as a security control.

### Headless preview (no toolbar UI)

`ui: false` keeps every non-visual side effect wired — click-to-edit, the editor bridge, scroll restore, cookies and headers — while rendering no chrome of its own. That is how a site gets live editing, or editor scroll restore, alongside its own UI instead of the Prepr bar.

```typescript
// Live editing, no bar:
const preview = createPreprPreview({
  options: { ui: false, features: { editMode: true } },
});

// Later, on teardown (SPA route change, component unmount):
preview.destroy();
```

`props` is optional here — a headless preview that only wants click-to-edit or scroll restore has no segment list to pass. For scroll restore and nothing else:

```typescript
createPreprPreview({
  options: {
    ui: false,
    features: { segments: false, abTesting: false, editMode: false },
  },
});
```

Scroll restore comes free with any preview, headless or not: inside the live-preview iframe the editor saves and restores the reader's position over the `postMessage` bridge, with no extra call and no configuration.

`?prepr_hide_bar=true` and the editor's own iframe both imply `ui: false`; the bridge stays connected in each case. Outside an iframe the bridge is a no-op, so mounting unconditionally is safe. The handshake is only ever accepted from `https://<tenant>.prepr.io`, or from `allowedEditorOrigins` when set.

### Pixel options

```typescript
loadTrackingPixel(id, {
  destinations: { googleTagManager: true },
  variantImpressionThreshold: 0.5,
});
```

| Option                          | Type      | Description                                                            |
| ------------------------------- | --------- | ---------------------------------------------------------------------- |
| `destinations.googleTagManager` | `boolean` | Forward events to Google Tag Manager.                                  |
| `variantImpressionThreshold`    | `number`  | Visibility ratio required before an A/B variant impression is counted. |

### Theming

The toolbar's shadow DOM reads its look from CSS custom properties set on the `prepr-toolbar` host element, or any ancestor — custom properties inherit through the shadow boundary. All have fallbacks, so theming is entirely optional.

| Custom property   | Purpose                                    | Default                                   |
| ----------------- | ------------------------------------------ | ----------------------------------------- |
| `--prepr-primary` | Toggle button, badges, status pill color   | `#4338ca`                                 |
| `--prepr-bg`      | Panel background                           | `#eef2ff`                                 |
| `--prepr-text`    | Reserved for future text theming           | `#1f2937`                                 |
| `--prepr-radius`  | Corner radius (panel, radio group, inputs) | `8px`                                     |
| `--prepr-shadow`  | Panel drop shadow                          | `0px 0px 40px 0px rgba(31, 41, 55, 0.24)` |
| `--prepr-z-index` | Base stacking order (backdrop/panel/pills) | `10000`                                   |

```css
prepr-toolbar {
  --prepr-primary: #16a34a;
  --prepr-radius: 4px;
}
```

Because the toolbar renders inside a shadow root, none of your own page CSS — Tailwind resets, global styles — can leak in or affect it. These custom properties are the only supported customization surface.

### Internationalization

The toolbar UI ships with English and Dutch. Pass `locale` explicitly, or omit it to auto-detect from the browser and fall back to `en`:

```typescript
createPreprPreview({ props, options: { locale: 'nl' } });
```

## Troubleshooting

### Toolbar not showing

- **Check the preview flag**: `{ preview: true }` must reach the middleware, and `getToolbarProps` must actually be called. Log the boolean you are passing — an environment check that resolves to `false` is the most common cause.
- **Verify the GraphQL URL**: it must match `https://graphql.prepr.io/YOUR_ACCESS_TOKEN`.
- **Check the token permissions**: "Enable edit mode" must be checked on the token in Prepr.
- **Confirm the middleware matcher**: if `config.matcher` excludes the current path, no Prepr headers were set for it. `getPreprUUID()` returning `null` confirms this.
- **Check for `prepr_hide_bar=true`** in the URL, which suppresses the bar by design.

### Headers not working

- **Middleware setup**: confirm `middleware.ts` sits in the project root (or `src/`) and its matcher covers the route.
- **API calls**: personalization only works if you spread `getPreprHeaders()` into your GraphQL fetch. Missing headers is the most common reason segments appear to have no effect.
- **Chained middleware**: when chaining, pass the existing `NextResponse` as the second argument. Creating a fresh `NextResponse.next()` afterwards discards Prepr's request headers.

### Segments switch but content does not change

The toolbar sets the segment; your data fetch decides what to do with it. Check that the fetch forwards `getPreprHeaders()` and is not being served from cache — use `cache: 'no-store'`, or Apollo's `fetchPolicy: 'no-cache'`, on personalized queries.

### Build issues

- **Server helpers in client components**: the Next.js helpers read `next/headers` and are server-only. Calling them from a `'use client'` component fails at build time.
- **Missing peer dependencies**: importing `/nextjs` without `next`, `react`, and `react-dom` installed will not resolve. The core and `/astro` entry points have no framework peers.

### Error handling

Fetch and token failures throw `PreprError`, which carries a machine-readable code:

```typescript
import { PreprError, getPreprEnvironmentSegments } from '@preprio/toolkit';

try {
  const segments = await getPreprEnvironmentSegments(
    process.env.PREPR_GRAPHQL_URL!,
  );
} catch (error) {
  if (error instanceof PreprError) {
    console.log('Error code:', error.code);
    console.log('Context:', error.context);
  }
}
```

Codes: `INVALID_TOKEN`, `MISSING_TOKEN`, `HTTP_ERROR`, `FETCH_ERROR`, `INVALID_RESPONSE`, `CONTEXT_ERROR`.

`getToolbarProps` is the exception — it swallows these and returns an empty segment list, so a bad token cannot crash your app.

### Debug mode

```typescript
createPreprPreview({ props, options: { debug: true } });
```

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

The toolbar renders with Preact into a shadow-DOM custom element (`<prepr-toolbar>`), which keeps its styles isolated from the host page in both directions. Segment/variant selection and edit mode are wired up for you; you only mount the toolbar and supply its props.

### Visual editing

With edit mode enabled, the toolkit scans for stega-encoded content, strips the invisible Unicode characters after load so they cannot cause layout shifts, highlights editable elements by cursor proximity, and talks to the Prepr editor over a `postMessage` bridge when running inside the live-preview iframe.

Stega cleaning is automatic. There is no need to call `vercelStegaSplit` or hand-manage hidden spans — the data attributes the toolkit relies on survive the clean, so edit mode still activates instantly.

## Examples

Runnable examples live in the repository root:

| Example              | What it shows                                                      |
| -------------------- | ------------------------------------------------------------------ |
| `examples/nextjs`    | App Router, middleware, Apollo, custom image loader                |
| `examples/astro`     | Astro middleware and `.astro` components                           |
| `examples/sveltekit` | `hooks.server.ts`, `+layout.server.ts`, `.svelte` components       |
| `examples/nuxt`      | `server/middleware`, `useAsyncData`, `.vue` components             |
| `examples/express`   | Vanilla core — a hand-written adapter for an unsupported framework |

## Migrating from `@preprio/prepr-nextjs`

`@preprio/toolkit` replaces the Next.js-only `@preprio/prepr-nextjs` package. Most of
the change is import paths — the middleware signature is unchanged and the server
helpers keep their names — but the toolbar's provider and the stylesheet are gone.

The [migration guide](https://github.com/preprio/prepr-toolkit/blob/main/MIGRATION.md) has the diffs.

## Support

- **Documentation**: [Prepr Documentation](https://docs.prepr.io)
- **Support**: [Prepr Support](https://prepr.io/support)
