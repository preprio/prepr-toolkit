# @preprio/toolkit

A framework-agnostic TypeScript library that provides preview functionality, visual editing capabilities, and A/B testing for [Prepr CMS](https://prepr.io). Ships thin wrappers for Next.js, Nuxt, Astro, and SvelteKit on top of a vanilla core that runs anywhere.

## Quick Start

```bash
# Install the package
npm install @preprio/toolkit
# or
pnpm add @preprio/toolkit
```

Add your Prepr GraphQL URL to your `.env`:

```bash
PREPR_GRAPHQL_URL=https://graphql.prepr.io/{YOUR_ACCESS_TOKEN}
```

Set up middleware in `middleware.ts`:

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

No CSS import is needed. The toolbar renders into a shadow-DOM custom element (`<prepr-toolbar>`) with its styles inlined, so it can neither leak into nor inherit from your page's stylesheets.

## Prerequisites

Before installing, ensure you have:

- **Node.js 18.0.0 or later**
- **A Prepr account**
- **A Prepr GraphQL URL** (found in Settings → Access tokens)

Per-framework requirements:

| Entry point | Peer dependencies |
| --- | --- |
| `@preprio/toolkit` (vanilla core) | none |
| `@preprio/toolkit/nextjs` | `next` >= 13, `react` >= 17, `react-dom` >= 17 |
| `@preprio/toolkit/astro` | none (`.astro` components compile in your own pipeline) |
| `@preprio/toolkit/sveltekit` | `svelte` (only for the `.svelte` components) |
| `@preprio/toolkit/nuxt` | `vue` (only for the `.vue` components) |

All peer dependencies are optional — installing without React or Next.js is fine as long as you only import the entry points you have dependencies for.

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

## Installation & Setup

### 1. Install the Package

```bash
npm install @preprio/toolkit
# or
pnpm add @preprio/toolkit
# or
yarn add @preprio/toolkit
```

### 2. Environment Configuration

Create or update your `.env` file:

```bash
# Required: your Prepr GraphQL endpoint
PREPR_GRAPHQL_URL=https://graphql.prepr.io/{YOUR_ACCESS_TOKEN}
```

> **Important**: Replace `{YOUR_ACCESS_TOKEN}` with your actual Prepr access token from Settings → Access tokens.

The toolkit reads **no environment variables at all**. It has no opinion on the *name* of the URL variable either — `getToolbarProps(token)` takes the URL as a plain string, so store it wherever you like.

### 3. The preview gate

Preview mode is controlled by exactly one thing: the `preview` option you pass to the middleware.

```typescript
createPreprMiddleware(request, { preview: process.env.VERCEL_ENV !== 'production' });
```

Resolve that boolean however your deployment already distinguishes environments — `VERCEL_ENV`, `NODE_ENV`, SvelteKit's `dev`, Astro's `import.meta.env.DEV`, a branch check, or your own feature flag. Because the toolkit reads nothing from the environment itself, the behaviour is identical across every framework and every bundler.

`getToolbarProps` is ungated in all frameworks — it fetches whenever you call it. Call it only when your preview flag is on:

```typescript
const toolbarProps = preview ? await getToolbarProps(token) : null;
```

> **Note:** a hardcoded `{ preview: true }` enables preview everywhere, production included. Always resolve it from an environment signal.

## Next.js

### Middleware Setup

The middleware assigns the visitor's customer ID, captures UTM parameters, and resolves the active segment and A/B variant into request headers.

Create or update `middleware.ts` in your project root:

```typescript
import type { NextRequest } from 'next/server';
import { createPreprMiddleware } from '@preprio/toolkit/nextjs';

export function middleware(request: NextRequest) {
  return createPreprMiddleware(request, { preview: true });
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};
```

Despite the `create` prefix, `createPreprMiddleware` runs per request — it does not return a handler.

#### Chaining with Existing Middleware

Pass an existing `NextResponse` as the second argument to fold Prepr's headers and cookies onto a response another middleware already produced:

```typescript
import { NextResponse, type NextRequest } from 'next/server';
import { createPreprMiddleware } from '@preprio/toolkit/nextjs';

export function middleware(request: NextRequest) {
  const response = NextResponse.next();

  if (request.nextUrl.pathname.startsWith('/admin')) {
    response.headers.set('x-admin-route', 'true');
  }

  return createPreprMiddleware(request, response, { preview: true });
}
```

##### With next-intl

```typescript
import type { NextRequest } from 'next/server';
import createIntlMiddleware from 'next-intl/middleware';
import { createPreprMiddleware } from '@preprio/toolkit/nextjs';

const intlMiddleware = createIntlMiddleware({
  locales: ['en', 'de', 'fr'],
  defaultLocale: 'en',
});

export function middleware(request: NextRequest) {
  const intlResponse = intlMiddleware(request);

  // If next-intl returns a redirect, return it immediately.
  if (intlResponse.status >= 300 && intlResponse.status < 400) {
    return intlResponse;
  }

  return createPreprMiddleware(request, intlResponse, { preview: true });
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
```

##### Conditional chaining

```typescript
import { NextResponse, type NextRequest } from 'next/server';
import { createPreprMiddleware } from '@preprio/toolkit/nextjs';

export function middleware(request: NextRequest) {
  // Skip Prepr entirely for API routes.
  if (request.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.next();
  }

  return createPreprMiddleware(request, { preview: process.env.VERCEL_ENV !== 'production' });
}
```

### Layout Integration

`getToolbarProps` is ungated, so gate the call on the same flag you pass to the middleware:

```tsx
import type { ReactNode } from 'react';
import { getToolbarProps, PreprToolbar } from '@preprio/toolkit/nextjs';

export default async function RootLayout({ children }: { children: ReactNode }) {
  const preview = process.env.VERCEL_ENV !== 'production';
  const toolbarProps = preview
    ? await getToolbarProps(process.env.PREPR_GRAPHQL_URL!)
    : null;

  return (
    <html lang="en">
      <body>
        {children}
        {toolbarProps && <PreprToolbar {...toolbarProps} />}
      </body>
    </html>
  );
}
```

Skipping the call outside preview means no API call and no toolbar. `getToolbarProps` also never throws — a failed segment fetch degrades to an empty segment list rather than crashing the host app — so no `try`/`catch` or error boundary is required.

To keep the toolbar out of the production bundle entirely, gate the *import* rather than the props, with a `next/dynamic` import behind the same flag.

### Tracking Pixel

The tracking pixel collects the interaction data that powers personalization and A/B testing. Include it in **all** environments, preview and production alike.

```tsx
import { extractAccessToken, PreprTrackingPixel } from '@preprio/toolkit/nextjs';

export default function RootLayout({ children }: { children: ReactNode }) {
  const accessToken = extractAccessToken(process.env.PREPR_GRAPHQL_URL!);

  return (
    <html lang="en">
      <body>
        {children}
        {accessToken && <PreprTrackingPixel id={accessToken} />}
      </body>
    </html>
  );
}
```

`PreprTrackingPixel` renders nothing and loads the CDN script on mount, so its position in the tree does not matter.

### API Integration

Use `getPreprHeaders()` to forward the request's Prepr personalization context to your Prepr GraphQL fetches. Prepr resolves segments and A/B variants from these headers, so a query sent without them always returns the default, unpersonalized content.

The headers are set by the middleware, so they are only present on routes its matcher covers — off-matcher requests yield an empty object.

The signature differs per framework: `getPreprHeaders()` is async and zero-argument on Next.js (it reads `headers()` for you), while the Astro, SvelteKit, and Nuxt builds are synchronous and take the request's `Headers`.

#### With the Fetch API

```typescript
import { getPreprHeaders } from '@preprio/toolkit/nextjs';

async function getPage(slug: string) {
  const response = await fetch(process.env.PREPR_GRAPHQL_URL!, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(await getPreprHeaders()),
    },
    body: JSON.stringify({
      query: `
        query GetPageBySlug($slug: String!) {
          Page(slug: $slug) {
            title
            content
          }
        }
      `,
      variables: { slug },
    }),
    cache: 'no-store',
  });

  return response.json();
}
```

#### With Apollo Client

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

### Image Loader

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

The loader rewrites `w_` to the width Next asks for and scales `h_` alongside it, holding the emitted ratio — for a cropped asset that ratio is the authored crop box, so the crop survives the resize. Focal points (`fx`/`fy`) are percentages and carry through unchanged, as does any other option in the segment. Quality is not a CDN option and is ignored.

URLs with no transform segment pass through untouched — set `unoptimized` on those `<Image>`s.

See the runnable example at `examples/nextjs` for the full source of truth.

## Astro

### Middleware Setup

**`src/middleware.ts`**

```typescript
import { onPreprRequest } from '@preprio/toolkit/astro';
import { defineMiddleware } from 'astro:middleware';

export const onRequest = defineMiddleware((context, next) =>
  onPreprRequest(context, next, { preview: import.meta.env.DEV })
);
```

### Layout Integration

```astro
---
import PreprToolbar from '@preprio/toolkit/astro/components/PreprToolbar';
import PreprTrackingPixel from '@preprio/toolkit/astro/components/PreprTrackingPixel';
import { extractAccessToken, getToolbarProps } from '@preprio/toolkit/astro';

const isPreview = import.meta.env.DEV;
const toolbarProps = isPreview
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

`import.meta.env.DEV` is Astro's own dev flag; swap in whatever signal marks preview in your deployment. The same value should feed both the middleware and `getToolbarProps`.

The `.astro` components ship as source, compiled by your own Astro/Vite pipeline rather than this package's build. They use full-page navigation by default, matching Astro's MPA model — so switching segment or variant re-runs the server-rendered output.

See the runnable example at `examples/astro` for the full source of truth.

## SvelteKit

`svelte` is an optional peer dependency, needed only if you import the `.svelte` components.

**`src/hooks.server.ts`**

```typescript
import { dev } from '$app/environment';
import { preprHandle } from '@preprio/toolkit/sveltekit';

export const handle = preprHandle({ preview: dev });
```

**`src/routes/+layout.server.ts`** — gate `getToolbarProps` on the same flag:

```typescript
import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';
import { getToolbarProps } from '@preprio/toolkit/sveltekit';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ request }) => {
  if (!dev) return { toolbarProps: null };

  const toolbarProps = await getToolbarProps(request.headers, env.PREPR_GRAPHQL_URL!);
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

The `.svelte` components ship as source (compiled by your own Vite/Svelte pipeline) and mount client-side via `onMount`, so they never run during SSR.

Inside `load` functions and endpoints you can also read the headers the hook already computed straight off `event.locals`:

```typescript
import { getPreprHeadersFromLocals } from '@preprio/toolkit/sveltekit';

const preprHeaders = getPreprHeadersFromLocals(event.locals);
```

See the runnable example at `examples/sveltekit` for the full source of truth.

## Nuxt

`vue` is an optional peer dependency, needed only if you import the `.vue` components. Requires Nitro's Node.js preset (the Nuxt default).

**`server/middleware/prepr.ts`**

```typescript
import { handlePreprRequest } from '@preprio/toolkit/nuxt';

export default defineEventHandler(event => {
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
    useRuntimeConfig().public.preprGraphqlUrl
  );
});
</script>

<template>
  <NuxtPage />
  <PreprTrackingPixel id="YOUR_ACCESS_TOKEN" />
  <PreprToolbar v-if="toolbarProps" v-bind="toolbarProps" />
</template>
```

The `.vue` components ship as source (compiled by your own Vite/Vue pipeline) and mount client-side via `onMounted`, so they never run during SSR.

The middleware folds the computed Prepr headers back onto the incoming request — read them via `useRequestHeaders()` in composables, or straight off the h3 event in server routes:

```typescript
import { getPreprHeadersFromEvent } from '@preprio/toolkit/nuxt';

const preprHeaders = getPreprHeadersFromEvent(event);
```

See the runnable example at `examples/nuxt` for the full source of truth.

## Any other framework

The core is runtime-neutral: it works off a WHATWG `Request` and hands back the headers to forward to Prepr plus the cookies to persist. Adapting it to Express, Hono, Fastify, or a plain server is roughly twenty lines.

**Server** — translate your framework's request and response to and from those neutral shapes:

```javascript
import { processPreprRequest } from '@preprio/toolkit';

export function preprMiddleware({ preview } = {}) {
  return (req, res, next) => {
    const { requestHeaders, responseCookies } = processPreprRequest(toWebRequest(req), {
      preview,
    });

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

`processPreprRequest` reads no environment variables — no part of the toolkit does. Resolve the preview flag yourself before passing it in.

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

Each wrapper exposes the same five helpers, differing only in how they reach the request headers.

| Helper | Next.js | Astro / SvelteKit / Nuxt |
| --- | --- | --- |
| `getPreprUUID` | `await getPreprUUID()` | `getPreprUUID(headers)` |
| `getActiveSegment` | `await getActiveSegment()` | `getActiveSegment(headers)` |
| `getActiveVariant` | `await getActiveVariant()` | `getActiveVariant(headers)` |
| `getPreprHeaders` | `await getPreprHeaders()` | `getPreprHeaders(headers)` |
| `getToolbarProps` | `await getToolbarProps(token)` | `await getToolbarProps(headers, token)` |

The Next.js versions read via `next/headers` and are async. The Astro, SvelteKit and Nuxt versions take a standard `Headers` (`Astro.request.headers`, `event.request.headers`, or one built from `useRequestHeaders()`) and are sync, except `getToolbarProps`.

#### `getPreprUUID()`

Returns the current visitor's Prepr Customer ID.

```typescript
const customerId = await getPreprUUID();
// 'uuid-string' or null
```

Returns `null` when the middleware did not run for this request — a useful check when headers seem to be missing.

#### `getActiveSegment()`

Returns the currently active segment.

```typescript
const segment = await getActiveSegment();
// 'segment-id' or null
```

#### `getActiveVariant()`

Returns the active A/B testing variant.

```typescript
const variant = await getActiveVariant();
// 'A' | 'B' | null
```

#### `getPreprHeaders()`

Returns all Prepr headers for the request, ready to spread into a fetch.

```typescript
const headers = await getPreprHeaders();
// { 'prepr-customer-id': 'uuid', 'Prepr-Segments': 'segment-id', ... }
```

#### `getToolbarProps(token)`

Fetches the props needed to mount the toolbar. Never throws.

```typescript
const props = await getToolbarProps(process.env.PREPR_GRAPHQL_URL!);
// { activeSegment, activeVariant, segments }
```

### Token helpers

Exported from every entry point, including the core.

#### `validatePreprToken(token)`

Asserts that a Prepr GraphQL URL is well formed. Returns nothing and **throws** `PreprError` on a bad value — code `MISSING_TOKEN` when empty, `INVALID_TOKEN` when it is not an HTTPS URL.

```typescript
validatePreprToken(process.env.PREPR_GRAPHQL_URL!); // throws PreprError if invalid
```

#### `extractAccessToken(url)`

Extracts the access token from a Prepr GraphQL URL — the value `PreprTrackingPixel` needs as its `id`.

Returns the token as a `string`. It never returns `null` — a URL that is malformed, not on `graphql.prepr.io`, or missing a token segment throws a `PreprError` with code `INVALID_TOKEN`.

```typescript
const token = extractAccessToken('https://graphql.prepr.io/abc123');
// 'abc123'

extractAccessToken('not-a-url'); // throws PreprError(INVALID_TOKEN)
```

### Components

#### `PreprToolbar`

The toolbar. Takes the props returned by `getToolbarProps`, and renders nothing itself — the UI is a shadow-DOM custom element mounted imperatively.

```tsx
<PreprToolbar {...toolbarProps} />
```

There is no provider to wrap your tree in; state lives in the toolbar's own store.

#### `PreprTrackingPixel`

Loads Prepr's CDN tracking pixel on mount. Renders nothing.

```tsx
<PreprTrackingPixel id={accessToken} config={{ destinations: { googleTagManager: true } }} />
```

| Prop | Type | Description |
| --- | --- | --- |
| `id` | `string` | Prepr tracking/access token. Required. |
| `config` | `PreprPixelConfig` | Optional pixel configuration (see [Pixel Options](#pixel-options)). |

### Core exports

Available from `@preprio/toolkit` for apps outside Next.js, Astro, and SvelteKit.

#### `processPreprRequest(request, options?)`

Computes the Prepr headers and cookies for a WHATWG `Request`.

```typescript
const { requestHeaders, responseCookies } = processPreprRequest(request, { preview: true });
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
    navigate: url => router.push(url),
    currentPath: () => window.location.pathname + window.location.search,
    reload: () => router.refresh(),
  },
});

controller.destroy();
```

| Option | Type | Description |
| --- | --- | --- |
| `props` | `PreprToolbarProps` | From `getToolbarProps`. Optional — a headless preview has no segment list to pass. |
| `options` | `PreprPreviewOptions` | `{ debug?, locale?, features?, ui?, allowedEditorOrigins? }`. |
| `navigation` | `PreprNavigationAdapter` | How segment/variant switches navigate. |

The navigation adapter is optional. Omit it and the toolbar uses `window.location.assign` — a full page load. Supply one to integrate with a client-side router; its `reload` member is optional too, and runs after a preview-mode toggle (defaulting to `window.location.reload()`). The Next.js and SvelteKit wrappers wire all of this up for you.

`createPreprPreview` is a no-op outside a browser (no `window`/`document`) and returns a controller whose `destroy()` does nothing, so it is safe to call during SSR.

Chrome is skipped — while every side effect stays wired — when any of these hold: `ui: false`, `?prepr_hide_bar=true` (how the Prepr live-preview iframe suppresses the bar), or running inside the editor's iframe. See [Headless preview](#headless-preview-no-toolbar-ui).

#### `loadTrackingPixel(id, config?)`

Installs the CDN tracking pixel. Idempotent, and a no-op outside a browser.

```typescript
loadTrackingPixel('YOUR_ACCESS_TOKEN', {
  destinations: { googleTagManager: true },
  variantImpressionThreshold: 0.5,
});
```

This is a typed facade over Prepr's existing CDN pixel (`https://cdn.tracking.prepr.io/js/prepr-v2.min.js`). It reproduces the legacy `<script>` snippet's queue-stub semantics, so calls made before the CDN script finishes loading are queued and flushed once it is ready.

#### `trackEvent(name, data?)`

Sends a custom tracking event.

```typescript
trackEvent('add_to_cart', { productId: 'abc123' });
```

#### `setTrackingParam(key, value)`

Sets a persistent tracking parameter on the pixel.

```typescript
setTrackingParam('user_type', 'returning');
```

`trackEvent` and `setTrackingParam` are independent of `loadTrackingPixel` — they work against `window.prepr` however it got installed, including a legacy HTML snippet already on the page. If no pixel is installed at all they warn once in the console and return without throwing.

#### `stegaClean(value)`

Strips stega-encoded characters from a string. Rarely needed, since cleaning is automatic (see [Visual Editing](#visual-editing)), but available when you need a clean value for comparison, sorting, or a non-DOM API.

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

Unlike `getToolbarProps`, `getPreprEnvironmentSegments(token)` throws on failure — see [Error Handling](#error-handling).

## Configuration Options

### Environment Variables

The toolkit reads no environment variables itself. The one value you need to store is the GraphQL endpoint, under any name you like:

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `PREPR_GRAPHQL_URL` | Yes | — | Your Prepr GraphQL endpoint URL. The name is yours to choose; it is passed to `getToolbarProps` as a plain string. |

### Middleware Options

```typescript
// Simple usage (creates a new NextResponse)
createPreprMiddleware(request, { preview: true });

// Chaining usage (folds onto an existing NextResponse)
createPreprMiddleware(request, response, { preview: true });
```

| Option | Type | Description |
| --- | --- | --- |
| `preview` | `boolean` | Enables preview mode. The only gate — resolve it from your own environment signal. |
| `features` | `PreprFeatures` | Disable features app-wide. See [Feature flags](#feature-flags). |
| `version` | `string` | Override the version reported in the `Prepr-Package` header. Mainly for tests. |

### Preview Options

```typescript
createPreprPreview({ props, options: { debug: true, locale: 'nl' } });
```

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `debug` | `boolean` | `false` | Enable debug logging. |
| `locale` | `'en' \| 'nl'` | auto-detected | UI language. Falls back to the first supported browser language, then `en`. |
| `features` | `PreprFeatures` | all enabled | Which features run. See [Feature flags](#feature-flags). |
| `ui` | `boolean` | `true` | Mount the visible toolbar. See [Headless preview](#headless-preview-no-toolbar-ui). |
| `allowedEditorOrigins` | `string[]` | `*.prepr.io` | Exact editor origins allowed to drive this preview, for self-hosted editors. Replaces the wildcard. |

`features` and `ui` are independent: `features` decides *what runs*, `ui` decides *whether the toolbar is visible*.

### Headless preview (no toolbar UI)

`ui: false` keeps every non-visual side effect wired — click-to-edit, the editor bridge, scroll restore, cookies and headers — while rendering no chrome of its own. That is how a site gets live editing, or editor scroll restore, alongside its own UI instead of the Prepr bar.

```typescript
// Live editing, no bar:
const preview = createPreprPreview({
  options: { ui: false, features: { editMode: true } },
});

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

`?prepr_hide_bar=true` and the editor's own iframe both imply `ui: false`. Outside an iframe the bridge is a no-op, so mounting unconditionally is safe. Call `createPreprPreview` **once per page** — two calls start two bridges and announce the preview twice.

### Feature flags

Preview mode is the master switch. Within it, each feature can be turned off with a `features` object. Everything is **on by default** — omit it and nothing changes.

```typescript
import type { PreprFeatures } from '@preprio/toolkit';

export const preprFeatures: PreprFeatures = {
  segments: false,               // or { enabled: false }
  abTesting: true,
  editMode: { enabled: false },
};
```

| Feature | Off means |
| --- | --- |
| `segments` | No segment picker. No `Prepr-Segments` header, from cookie **or** `?prepr_preview_segment`. No segment cookie written. The `_Segments` API call is skipped, saving a round-trip per page. |
| `abTesting` | No A/B control or variant badge. No `Prepr-ABtesting` header, from cookie **or** `?prepr_preview_ab`. No variant cookie written. |
| `editMode` | No Edit mode control, no click-to-edit overlay, no close-edit pill. |

Pass the **same object to both sides**. Each enforces its own half, so a feature disabled in only one place is still half-on — the UI would hide a control the middleware still honours:

```typescript
// server
createPreprMiddleware(request, { preview: true, features: preprFeatures });
const props = await getToolbarProps(graphqlUrl, preprFeatures);

// client
<PreprToolbar {...props} options={{ features: preprFeatures }} />
```

Every framework's `getToolbarProps` takes `features` as its last argument, and every `<PreprToolbar>` accepts an `options` prop. Keeping the object in one module both sides import is the simplest way to stay in sync.

Disabling a feature also stops its `segment_changed` / `variant_changed` events, and the Reset button ignores it — state the user cannot see is never rewritten.

**`editMode` does not disable the Prepr visual editor.** It governs your site's own click-to-edit affordance. When the Prepr editor frames your site it drives edit mode over its own `postMessage` handshake, which keeps working regardless — that is the CMS operating inside its own iframe, not an affordance offered to your visitors. Treat `editMode: false` as a UI choice, never as a security control.

Feature flags govern the toolbar and the middleware. The toolbar-free scroll-sync entry point carries no personalization state, so there is nothing there to disable.

### Pixel Options

```typescript
loadTrackingPixel(id, {
  destinations: { googleTagManager: true },
  variantImpressionThreshold: 0.5,
});
```

| Option | Type | Description |
| --- | --- | --- |
| `destinations.googleTagManager` | `boolean` | Forward events to Google Tag Manager. |
| `variantImpressionThreshold` | `number` | Visibility ratio required before an A/B variant impression is counted. |

### Theming

The toolbar's shadow DOM reads its look from CSS custom properties set on the `prepr-toolbar` host element, or any ancestor — custom properties inherit through the shadow boundary. All have fallbacks, so theming is entirely optional.

| Custom property | Purpose | Default |
| --- | --- | --- |
| `--prepr-primary` | Toggle button, badges, status pill color | `#4338ca` |
| `--prepr-bg` | Panel background | `#eef2ff` |
| `--prepr-text` | Reserved for future text theming | `#1f2937` |
| `--prepr-radius` | Corner radius (panel, radio group, inputs) | `8px` |
| `--prepr-shadow` | Panel drop shadow | `0px 0px 40px 0px rgba(31, 41, 55, 0.24)` |
| `--prepr-z-index` | Base stacking order (backdrop/panel/pills) | `10000` |

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

### Error Handling

Fetch and token failures throw `PreprError`, which carries a machine-readable code:

```typescript
import { PreprError, getPreprEnvironmentSegments } from '@preprio/toolkit';

try {
  const segments = await getPreprEnvironmentSegments(process.env.PREPR_GRAPHQL_URL!);
} catch (error) {
  if (error instanceof PreprError) {
    console.log('Error code:', error.code);
    console.log('Context:', error.context);
  }
}
```

Codes: `INVALID_TOKEN`, `MISSING_TOKEN`, `HTTP_ERROR`, `FETCH_ERROR`, `INVALID_RESPONSE`, `CONTEXT_ERROR`.

`getToolbarProps` is the exception — it swallows these and returns an empty segment list, so a bad token cannot crash your app.

### Debug Mode

```typescript
createPreprPreview({ props, options: { debug: true } });
```

## How It Works

### Middleware Functionality

On each request the middleware:

1. **Generates customer IDs** — assigns a unique visitor identifier, persisted in the `__prepr_uid` cookie.
2. **Tracks UTM parameters** — lifts `utm_*` query params into `Prepr-Context-*` headers.
3. **Manages segments** — resolves the active segment from cookie or preview query param.
4. **Processes A/B tests** — resolves the active variant the same way.
5. **Sets headers** — makes all of the above visible to Server Components and route handlers via `headers()`.

Cookie and query-parameter names are a frozen wire protocol shared with the Prepr editor.

### Toolbar Features

- **Segment selection** — preview the site as any configured audience segment.
- **A/B testing** — toggle between variants A and B.
- **Edit mode** — click-to-edit, jumping straight to the field in Prepr.
- **Reset** — clear all personalization overrides.

The toolbar renders with Preact into a shadow-DOM custom element (`<prepr-toolbar>`), which is what keeps its styles isolated from the host page in both directions. Segment/variant selection and edit mode are wired up for you; you only mount the toolbar and supply its props.

### Visual Editing

With edit mode enabled, the toolkit:

1. **Scans content** — finds editable text via its stega encoding.
2. **Auto-cleans stega** — strips the invisible Unicode characters after load, so they cannot cause layout shifts with `letter-spacing` or text balancing.
3. **Highlights elements** — proximity-based highlighting as the cursor moves.
4. **Provides overlays** — click-to-edit affordances on editable fields.
5. **Syncs with Prepr** — talks to the editor over a `postMessage` bridge when running inside the live-preview iframe.

Stega cleaning is automatic. There is no need to call `vercelStegaSplit` or hand-manage hidden spans — the data attributes the toolkit relies on survive the clean, so edit mode still activates instantly.

## Examples

Runnable examples live in the repository root:

| Example | What it shows |
| --- | --- |
| `examples/nextjs` | App Router, middleware, Apollo, custom image loader |
| `examples/astro` | Astro middleware and `.astro` components |
| `examples/sveltekit` | `hooks.server.ts`, `+layout.server.ts`, `.svelte` components |
| `examples/nuxt` | `server/middleware`, `useAsyncData`, `.vue` components |
| `examples/express` | Vanilla core — a hand-written adapter for an unsupported framework |

## Support

- **Documentation**: [Prepr Documentation](https://docs.prepr.io)
- **Support**: [Prepr Support](https://prepr.io/support)
