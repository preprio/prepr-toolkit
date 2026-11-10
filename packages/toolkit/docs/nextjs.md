# Next.js

[← Back to the README](../README.md)

App Router setup for `@preprio/toolkit/nextjs`. Requires Next.js 13 or later; live preview while typing requires Next.js 16.

## Setup

```bash
npm install @preprio/toolkit
```

Add your Prepr GraphQL URL to `.env`. The toolkit reads no environment variables itself; the name is yours:

```bash
PREPR_GRAPHQL_URL=https://graphql.prepr.io/{YOUR_ACCESS_TOKEN}
```

### 1. Middleware

Create `proxy.ts` in the project root (or `src/`). On Next.js 15 and older the file is `middleware.ts` and the function is named `middleware`; the body is the same.

```typescript
import type { NextRequest } from 'next/server';
import { createPreprMiddleware } from '@preprio/toolkit/nextjs';

export function proxy(request: NextRequest) {
  // `preview` is the only gate. Resolve it however your deployment already
  // does — VERCEL_ENV, NODE_ENV, a branch check, your own feature flag.
  const preview = process.env.VERCEL_ENV !== 'production';
  return createPreprMiddleware(request, { preview });
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
```

### 2. Layout

Mount the toolbar and the tracking pixel in `app/layout.tsx`:

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

### 3. Data fetching

Spread `getPreprHeaders()` into every Prepr GraphQL request:

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

`createPreprMiddleware` runs per request, despite the `create` prefix: it does not return a handler.

## Verify it works

1. Start the site with your preview flag on and open any page. The Prepr toolbar button shows on the right edge of the page.
2. Pick a segment in the toolbar. The page updates and your Prepr GraphQL requests carry a `Prepr-Segments` header.
3. In Prepr, open a content item and its preview. Hovering text on the page outlines it; clicking it opens the field in the editor.

Nothing showing? See [Troubleshooting](./troubleshooting.md).

## Chaining with existing middleware

Pass an existing `NextResponse` as the second argument to fold Prepr's headers and cookies onto a response another middleware already produced:

```typescript
import { NextResponse, type NextRequest } from 'next/server';
import { createPreprMiddleware } from '@preprio/toolkit/nextjs';

const preview = process.env.VERCEL_ENV !== 'production';

export function proxy(request: NextRequest) {
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

export function proxy(request: NextRequest) {
  const intlResponse = intlMiddleware(request);

  if (intlResponse.status >= 300 && intlResponse.status < 400) {
    return intlResponse;
  }

  return createPreprMiddleware(request, intlResponse, { preview });
}
```

To skip Prepr for some routes entirely, return early with `NextResponse.next()` before calling `createPreprMiddleware` — or exclude them in `config.matcher`.

## Tracking pixel

The pixel collects the interaction data that powers personalization and A/B testing. Include it in **all** environments, preview and production alike — the Quick Start layout already does. `PreprTrackingPixel` renders nothing and loads the CDN script on mount, so its position in the tree does not matter.

## With Apollo Client

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

## Image loader

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

See the runnable example at [`examples/nextjs`](../../../examples/nextjs) for the full source.

## Live preview

First work through the [live preview checklist](./live-preview.md#checklist). Then two additions turn it on for an App Router site.
Both take your preview flag, the same one you pass the middleware.

**1. Run each query result through `normalizeQuery`**, with whatever client
you fetch with:

```ts
import { normalizeQuery } from '@preprio/toolkit/nextjs';

const preview = process.env.VERCEL_ENV !== 'production';

const data = await fetchFromPrepr(GetPageDocument, { slug }); // any client
const page = await normalizeQuery(GetPageDocument, data, { enabled: preview });
```

When the document holds more than one operation, name the one to use with `operationName`.

**2. Mount `PreprRefresh` once in the root layout:**

```tsx
import { PreprRefresh } from '@preprio/toolkit/nextjs/live';

{
  preview && <PreprRefresh enabled />;
}
```

While an editor types, `PreprRefresh` sends the unsaved changes to a server
action and the route re-renders with them; on save it calls
`router.refresh()` for the stored content. Server components need nothing
else. Requires Next.js 16 or later; on Next.js 15 and older pages update on
save only.

**Client components** can skip the server round trip: wrap the data they
render in `useLive`, and keystrokes patch it in the browser. Import it from
`@preprio/toolkit/nextjs/live` — the `/nextjs` barrel also exports
server-only helpers (`next/headers`), which a client module graph must not
include.

```tsx
'use client';
import { useLive } from '@preprio/toolkit/nextjs/live';

export default function Hero({ hero }: { hero: HeroFragment }) {
  const live = useLive(hero);
  return <h1>{live.title}</h1>;
}
```

**Client-fetched data** (no server components): instead of `PreprRefresh`,
call `initLivePreview({ enabled: preview, fetcher })` once in a client
component, and pass `{ query, variables }` to `useLive`. On save the toolkit
runs the query again through your `fetcher`:

```tsx
'use client';
import { useEffect } from 'react';
import { initLivePreview, useLive } from '@preprio/toolkit/nextjs/live';

export function LivePreviewInit({ preview }: { preview: boolean }) {
  useEffect(() => {
    initLivePreview({
      enabled: preview,
      // Runs a registered query against Prepr GraphQL; return `json.data`.
      fetcher: (query, variables) => fetchFromPrepr(query, variables),
    });
  }, [preview]);
  return null;
}

// In a client component:
const liveData = useLive(data, { query: GetPageDocument, variables: { slug } });
```

Don't combine `PreprRefresh` with `useLive` registrations that pass a
`query`: a save would both refetch and refresh. `useLive` without a `query`
works alongside it.
