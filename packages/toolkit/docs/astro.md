# Astro

[← Back to the README](../README.md)

Setup for `@preprio/toolkit/astro`. The `.astro` components ship as source and compile in your own Astro pipeline, so the entry point has no peer dependencies.

## Setup

```bash
npm install @preprio/toolkit
```

Add `PREPR_GRAPHQL_URL=https://graphql.prepr.io/{YOUR_ACCESS_TOKEN}` to `.env`. The toolkit reads no environment variables itself; the name is yours.

### 1. Middleware

**`src/middleware.ts`**

```typescript
import { onPreprRequest } from '@preprio/toolkit/astro';
import { defineMiddleware } from 'astro:middleware';

export const onRequest = defineMiddleware((context, next) =>
  onPreprRequest(context, next, { preview: import.meta.env.DEV }),
);
```

### 2. Layout

The same preview flag gates `getToolbarProps`:

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

### 3. Data fetching

The Astro helpers are synchronous and take the request's `Headers`. Spread the result into every Prepr GraphQL request:

```typescript
import { getPreprHeaders } from '@preprio/toolkit/astro';

const headers = getPreprHeaders(Astro.request.headers);
```

`import.meta.env.DEV` is Astro's own dev flag; swap in whatever signal marks preview in your deployment.

The `.astro` components ship as source, compiled by your own Astro/Vite pipeline. They use full-page navigation by default, matching Astro's MPA model — switching segment or variant re-runs the server-rendered output.

See the runnable example at [`examples/astro`](../../../examples/astro) for the full source.

## Verify it works

1. Start the site with your preview flag on and open any page. The Prepr toolbar button shows on the right edge of the page.
2. Pick a segment in the toolbar. The page updates and your Prepr GraphQL requests carry a `Prepr-Segments` header.
3. In Prepr, open a content item and its preview. Hovering text on the page outlines it; clicking it opens the field in the editor.

Nothing showing? See [Troubleshooting](./troubleshooting.md).

## Live preview

First work through the [live preview checklist](./live-preview.md#checklist). Then pass `preview` to `onPreprRequest` as above, and run each query result through `normalizeQuery` with the same flag:

```astro
---
import { normalizeQuery } from '@preprio/toolkit/astro';

// The same flag you pass to `onPreprRequest` in the middleware.
const preview = import.meta.env.DEV;

// Fetch with any client; forward `getPreprHeaders(Astro.request.headers)`.
const data = await fetchFromPrepr(GetPageDocument, { slug });
const page = normalizeQuery(GetPageDocument, data, {
  enabled: preview,
  locals: Astro.locals,
});
---
```

`PreprToolbar.astro` does the rest. Inside the Prepr editor it requests the
page again with the unsaved changes and updates only the parts of the DOM that
changed; on save it shows the stored content. Preview pages must render on
demand (`output: 'server'`, or `export const prerender = false`).

`allowedEditorOrigins` and `strictMode` go on the toolbar's `options` prop. When the document holds more than one operation, pass `operationName` to `normalizeQuery`.
