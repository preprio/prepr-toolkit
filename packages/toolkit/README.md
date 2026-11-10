# @preprio/toolkit

[![npm version](https://img.shields.io/npm/v/@preprio/toolkit.svg)](https://www.npmjs.com/package/@preprio/toolkit)
[![npm downloads](https://img.shields.io/npm/dm/@preprio/toolkit.svg)](https://www.npmjs.com/package/@preprio/toolkit)
[![license](https://img.shields.io/npm/l/@preprio/toolkit.svg)](./LICENSE)

Preview, visual editing, live preview and personalization for [Prepr CMS](https://prepr.io), for Next.js, Nuxt, Astro, SvelteKit, React and any other stack. One framework-free core with a thin wrapper per framework.

## What's included

- **Preview toolbar** — view the site as any segment or A/B variant.
- **Visual editing** — click any text or image on the page to open its field in Prepr.
- **Live preview** — the page shows what an editor types in Prepr, before they save.
- **Personalization and A/B testing** — middleware that resolves the visitor, segment and variant into the headers Prepr's GraphQL API reads.
- **Tracking pixel** — typed loader for Prepr's tracking script.

No CSS to import and no provider to wrap your app in. The toolbar renders in a shadow-DOM custom element, so its styles and yours never meet.

## Requirements

- Node.js 18.17 or later
- A Prepr GraphQL URL: in Prepr, **Settings → Access tokens → GraphQL Preview**. It looks like `https://graphql.prepr.io/{YOUR_ACCESS_TOKEN}`. Check **Enable edit mode** on the token for click-to-edit and live preview.

| Framework            | Supported versions                                  | Live preview while typing |
| -------------------- | --------------------------------------------------- | ------------------------- |
| Next.js              | 13 and later (App Router)                           | Next.js 16 and later      |
| Astro                | tested with Astro 7; preview pages render on demand | yes                       |
| SvelteKit            | Svelte 5                                            | yes                       |
| Nuxt                 | Vue 3.3 and later                                   | yes                       |
| React (no framework) | React 17 and later                                  | no                        |
| Anything else        | any server that can build a WHATWG `Request`        | server-rendered HTML      |

All framework packages are optional peer dependencies: you only need the ones behind the entry points you import.

## Install

```bash
npm install @preprio/toolkit
```

## Choose your entry point

| You use              | Import from                  | Guide                                             |
| -------------------- | ---------------------------- | ------------------------------------------------- |
| Next.js              | `@preprio/toolkit/nextjs`    | [Next.js](./docs/nextjs.md)                       |
| Astro                | `@preprio/toolkit/astro`     | [Astro](./docs/astro.md)                          |
| SvelteKit            | `@preprio/toolkit/sveltekit` | [SvelteKit](./docs/sveltekit.md)                  |
| Nuxt                 | `@preprio/toolkit/nuxt`      | [Nuxt](./docs/nuxt.md)                            |
| React, no framework  | `@preprio/toolkit/react`     | [React](./docs/react.md)                          |
| Express, Hono, other | `@preprio/toolkit`           | [Any other framework](./docs/other-frameworks.md) |

Coming from `@preprio/prepr-nextjs`? See the [migration guide](../../MIGRATION.md).

## How it fits together

Every integration is the same three steps, plus one optional step:

1. **Middleware** resolves the visitor's id, segment and A/B variant into request headers.
2. **Layout** mounts the preview toolbar and the tracking pixel.
3. **Data fetching** forwards those headers on your GraphQL requests, so Prepr returns personalized content.
4. **Live preview** (optional) runs your query results through one helper.

Two rules hold everywhere:

- **The toolkit reads no environment variables.** You pass every value in, so it behaves the same in every framework and bundler.
- **Preview is one boolean that you own.** Pass it as `preview` to the middleware and gate `getToolbarProps` on it. Resolve it from whatever already separates your environments. A hardcoded `true` turns preview on in production too.

## Quick start (Next.js)

Other frameworks follow the same steps: [Astro](./docs/astro.md), [SvelteKit](./docs/sveltekit.md), [Nuxt](./docs/nuxt.md).

**1. Add your GraphQL URL to `.env`.** The name is yours.

```bash
PREPR_GRAPHQL_URL=https://graphql.prepr.io/{YOUR_ACCESS_TOKEN}
```

**2. Add the middleware** in `proxy.ts` (`middleware.ts` with a `middleware` function on Next.js 15 and older):

```typescript
import type { NextRequest } from 'next/server';
import { createPreprMiddleware } from '@preprio/toolkit/nextjs';

export function proxy(request: NextRequest) {
  const preview = process.env.VERCEL_ENV !== 'production';
  return createPreprMiddleware(request, { preview });
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
```

**3. Mount the toolbar and the pixel** in `app/layout.tsx`:

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
        <PreprTrackingPixel id={accessToken} />
      </body>
    </html>
  );
}
```

**4. Forward the Prepr headers** on every GraphQL request:

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

**5. Verify it works.**

1. Run the site with preview on. The Prepr toolbar button shows on the right edge of the page.
2. Pick a segment. The page updates with that segment's content.
3. Open a content item's preview in Prepr and click text on the page. Prepr opens the field.

Nothing showing? See [Troubleshooting](./docs/troubleshooting.md).

## Set up live preview

Live preview shows an editor's unsaved changes in Prepr's side-by-side preview while they type. Outside the editor it does nothing and loads nothing.

**1. Finish the quick start for your framework.** Live preview builds on the toolbar setup.

**2. Prepare Prepr.** Use the **GraphQL Preview** token with **Enable edit mode** checked, and set the environment's preview URL to a deployment that runs with preview on.

**3. Make the preview frameable.**

- Serve it over **HTTPS**. Inside the editor your site is a cross-site iframe; browsers keep its cookies only as `SameSite=None; Secure`, which the middleware sets on HTTPS.
- If you send a `Content-Security-Policy`, allow your Prepr environment in `frame-ancestors`, and send no `X-Frame-Options` on preview:

  ```
  Content-Security-Policy: frame-ancestors 'self' https://acme.prepr.io
  ```

**4. Select `_id` in your queries.** Changes are matched by id. With GraphQL Codegen, one line adds it everywhere your schema has one:

```ts
// codegen.ts
import { preprIds } from '@preprio/toolkit/codegen';

const config = {
  generates: {
    'src/gql/': { preset: 'client', documentTransforms: [preprIds] },
  },
};
```

No Codegen? See [the other two ways](./docs/live-preview.md#preparing-your-queries).

**5. Run your query results through the live preview helper**, with your preview flag as `enabled`:

| Framework | Code                                                                                                                                                                                       |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Next.js   | `await normalizeQuery(GetPageDocument, data, { enabled: preview })` from `@preprio/toolkit/nextjs`, plus `<PreprRefresh enabled />` from `@preprio/toolkit/nextjs/live` in the root layout |
| Astro     | `normalizeQuery(GetPageDocument, data, { enabled: preview, locals: Astro.locals })` from `@preprio/toolkit/astro`                                                                          |
| SvelteKit | `normalizedQuery(GetPageDocument, data.result, { enabled: data.preview, onSave: invalidateAll })` from `@preprio/toolkit/sveltekit/live`                                                   |
| Nuxt      | `useNormalizedQuery(GetPageDocument, data, { enabled: preview, onSave: refresh })` from `@preprio/toolkit/nuxt/live`                                                                       |

Full snippets per framework: [Next.js](./docs/nextjs.md#live-preview) · [Astro](./docs/astro.md#live-preview) · [SvelteKit](./docs/sveltekit.md#live-preview) · [Nuxt](./docs/nuxt.md#live-preview).

**6. Verify it works.** Open a content item and its preview in Prepr, and type in a text field. The page shows the text before you save.

Not updating? Check, in this order: `enabled` is true, the page is served over HTTPS, the browser console shows no `Refused to frame` error, and the query selects `_id`. More in [Troubleshooting](./docs/troubleshooting.md#live-preview-does-not-update).

The [live preview guide](./docs/live-preview.md) covers how it works, every option, the cookies involved and the security model.

## Documentation

| Topic                                        |                                                                                                                                                                                     |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Framework guides                             | [Next.js](./docs/nextjs.md) · [Astro](./docs/astro.md) · [SvelteKit](./docs/sveltekit.md) · [Nuxt](./docs/nuxt.md) · [React](./docs/react.md) · [Other](./docs/other-frameworks.md) |
| [Live preview](./docs/live-preview.md)       | Checklist, preparing queries, options, security, cookies                                                                                                                            |
| [Visual editing](./docs/visual-editing.md)   | How click-to-edit picks elements, and marking content by hand                                                                                                                       |
| [Configuration](./docs/configuration.md)     | Middleware and preview options, feature flags, headless preview, theming, languages                                                                                                 |
| [API reference](./docs/api-reference.md)     | Every entry point, helper and component                                                                                                                                             |
| [Troubleshooting](./docs/troubleshooting.md) | Toolbar, click-to-edit, headers, live preview, cookies                                                                                                                              |
| [Examples](../../examples)                   | Runnable Next.js, Astro, SvelteKit, Nuxt and Express apps                                                                                                                           |

## Versioning

The package follows semver. Minor and patch releases never break the public API; a breaking change ships as a major version with a migration entry. An API on its way out is marked `@deprecated` and keeps working until the next major. See the [changelog](../../CHANGELOG.md).

Cookie names, header names, `data-prepr-*` attributes and the editor's message format are part of that contract.

## Support

- [Prepr documentation](https://docs.prepr.io)
- [Open an issue](https://github.com/preprio/prepr-toolkit/issues)
- [Prepr support](https://prepr.io/support)
