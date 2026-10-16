# @preprio/toolkit

> **Stable, pre-1.0.** The core is stable and published to `latest`. The package follows
> semver: minor and patch releases never break the public API, and any breaking change
> ships as a major bump with a migration entry in
> [Breaking changes](https://github.com/preprio/prepr-toolkit/blob/main/RELEASING.md#breaking-changes).
>
> **Framework support.** The Next.js and Astro integrations are tested end to end. The
> Nuxt, SvelteKit, and vanilla wrappers share the same core but have seen less real-world
> use. If you hit a problem with any of them, please
> [open an issue](https://github.com/preprio/prepr-toolkit/issues).

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

### Fetching content

`createPreprClient` sends codegen-typed queries to Prepr and returns Prepr's personalization verdict next to the data. It lives on its own subpath and needs the `graphql` package, which graphql-codegen already installs (otherwise: `npm install graphql`).

```typescript
import { createPreprClient } from '@preprio/toolkit/nextjs/graphql';
import { GetPageBySlugDocument } from '@/gql/graphql';

const prepr = createPreprClient({ url: process.env.PREPR_GRAPHQL_URL! });

// Same response for every visitor: goes through the Data Cache, tagged 'prepr'.
const { data } = await prepr.query(GetPageBySlugDocument, { slug });

// This visitor's segment / A-B variant: forwards the Prepr headers, never cached.
const { data, personalized } = await prepr.query(
  GetPageBySlugDocument,
  { slug },
  { personalize: true },
);
```

Codegen's default client-preset output works as is; `documentMode: 'string'` works too.

`personalized` is `true` when the queried fields contain segment variants or A/B tests, at any depth. Use it to decide whether a page can be served statically.

To serve pages from the cache until you publish, set `revalidate: false` and call `revalidateTag('prepr')` from a Prepr publish webhook. With `revalidate` unset, the installed Next version's fetch caching default applies. With Cache Components, a webhook can refresh only the pages showing the changed item instead: see [Refreshing on publish](#refreshing-on-publish).

Tags you pass per query in `init.next.tags` are added to the client's `cacheTags`, never in place of them.

In preview, pass `preview: true`: queries skip the cache and stega markers stay in text for click-to-edit. They are always stripped from URL-like fields.

Custom headers go in two places. Client-level `headers` (`createPreprClient({ url, headers })`) are sent with every request and keep queries cacheable, so use them for fixed values such as a header your proxy requires. Per-query `headers` (or `init.headers`) may carry per-visitor values, so they make that request `no-store`.

#### Personalization with Cache Components

With [Cache Components](https://nextjs.org/docs/app/getting-started/cache-components) (`cacheComponents: true`), a personalized page is still served from the cache, whole: every variant of every A/B test and personalization group is in the prerendered page, and each page view's decision, fetched while the page loads, shows the visitor's variant. Nothing streams, the page never waits for Prepr, and no default variant shows first to be swapped out. You keep your own query and your own components.

**Do you need this?** Only if your pages are cached. A page that renders per request already gets this visitor's variants from `query(..., { personalize: true })`; render the result as is and skip this section.

A normal page needs two changes, plus the [proxy](#the-proxy):

```tsx
import { PreprStack } from '@preprio/toolkit/nextjs/graphql';

// 1. Fetch every variant, in a cached function. Same query, one extra option.
async function getPage(slug: string) {
  'use cache';
  const { data } = await prepr.query(
    PageDocument,
    { slug },
    { variants: true },
  );
  return data;
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug?: string[] }>;
}) {
  const slug = (await params).slug?.join('/') || '/';
  const data = await getPage(slug);

  // 2. Render the list through PreprStack instead of directly.
  return (
    <PreprStack
      items={data.Page.content}
      render={(items, { index }) => <Sections items={items} offset={index} />}
    />
  );
}
```

##### Your components: one extra prop

`PreprStack` splits the list into blocks (what never varies, each personalization group, each A/B test) and calls `render` once per block. Each call receives items exactly as a query without personalization would return them: the variant this visitor gets, with every list nested inside an item narrowed down the same way.

Because `render` runs per block, a position counted inside `Sections` (`items.map((item, i) => …)`) starts at 0 in every block. `index` is where the block starts in the whole page; add it, and the first section still owns the `<h1>` and the priority image:

```tsx
// Before
<Sections items={data.Page.content} />

// After
<PreprStack
  items={data.Page.content}
  render={(items, { index }) => <Sections items={items} offset={index} />}
/>

// Sections: the only change is `offset + i`
function Sections({ items, offset = 0 }: { items: Section[]; offset?: number }) {
  return items.map((item, i) => <Section key={item._id} item={item} position={offset + i} />);
}
```

A group takes one position, whichever variant shows. A group that shows nothing to a visitor (only a segment variant, no default) still takes its position: the page is prerendered before anyone's segment is known.

**The one rule:** a `variants: true` result holds every variant. Every list you render from it goes through `PreprStack`, or visitors see all variants at once.

##### Fitting your page

| Your page has…                                                              | Do this                                                                                           |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| One page-builder list (`content`, `sections`, `stack`)                      | One `PreprStack` around it.                                                                       |
| Personalized lists inside sections (cards, buttons, models in a section)    | Nothing. They are narrowed down with the section they sit in.                                     |
| Several lists (hero, body, sidebar)                                         | One `PreprStack` per list.                                                                        |
| A personalized list outside any list you already wrap (e.g. `Page.buttons`) | Its own `PreprStack`.                                                                             |
| Data used outside rendering (`generateMetadata`, JSON-LD)                   | `resolveVariants(data)` gives the default variants and A.                                         |
| Impression tracking for Prepr's metrics                                     | `trackVariants` on `PreprStack`; see [Impressions and conversions](#impressions-and-conversions). |
| No personalization on a page                                                | Nothing to change. `PreprStack` renders it as is and the proxy sends no request.                  |

##### Impressions and conversions

Prepr's tracking pixel counts impressions of an element carrying `data-prepr-variant-key`, and clicks on any `data-prepr-variant-event` element inside it ([Prepr docs](https://docs.prepr.io/personalization/setting-up-personalization#track-impressions-and-conversions)). The client already fetches every variant's key, so you never select `_context { variant_key }` yourself.

Opt in with `trackVariants`, and `PreprStack` puts the key on the section each personalized and A/B variant renders:

```tsx
<PreprStack items={data.Page.content} trackVariants render={…} />
```

For variants nested inside a section (cards, buttons, models), and outside Next.js, spread `preprVariantProps(item)` on the element that shows the item:

```tsx
<article {...preprVariantProps(card)}>…</article>
```

Conversions stay your choice: put `data-prepr-variant-event` (or `data-prepr-variant-event="QuoteRequest"`) on the element that counts, for example once in your button component.

- Keys are added after the page hydrates; the pixel picks them up then. Each item of a variant tags the element it renders, in order. A variant that renders a different number of elements than it has items (a section with several root elements, or one rendering nothing) tags only its first element.
- With `trackVariants`, each variant sits in a `display: contents` wrapper. It takes no box, but CSS child combinators (`>`) and `:first-child` from the stack's parent no longer reach the sections.
- An element that already has `data-prepr-variant-key` keeps it, so existing manual tagging keeps working.
- `trackVariants` tags only the variant that is shown, once it is shown. A section holding a personalized list (a logo strip whose logos vary) gets the key of the variant it shows. Do not tag stack sections yourself (with your own `_context { variant_key }` or `preprVariantProps`): that puts a key on every variant in the page, including the invisible default that holds its space while the decision is on its way, and Prepr's pixel counts any tagged element in view, invisible or not.

##### The proxy

One call in `proxy.ts` gives `PreprStack` what it needs: the visitor's Prepr headers and customer id, and the answers to the browser's decision requests: the visitor's variant of every A/B test and personalization group on a page, in one Prepr request. Pages themselves pass straight through and never wait for Prepr. Tell it which query each URL renders; most sites route every page through one query:

```ts
// proxy.ts
import { createPreprProxy } from '@preprio/toolkit/nextjs/graphql';

const handlePrepr = createPreprProxy({
  client: prepr,
  // URL → the query that page renders with `variants: true`; null for non-CMS URLs.
  page: (url) => ({
    document: PageDocument,
    variables: { slug: url.pathname },
  }),
  preview: process.env.PREPR_ENV === 'preview',
});

export function proxy(request: NextRequest) {
  return handlePrepr(request); // add your own cookies or headers to this response
}
```

```tsx
// app/layout.tsx, once: decides every client-side navigation
import { PreprPersonalizationSwitch } from '@preprio/toolkit/nextjs';

<PreprPersonalizationSwitch />;
```

Deriving the decision query from `PageDocument` needs Prepr's schema, which a fresh server instance downloads before its first decision. Build the decision query ahead of time instead and pass it as `decision`: the codegen plugin (see [Using your own GraphQL client](#using-your-own-graphql-client)) writes it next to your query, and the proxy sends it as is.

```ts
import { PageDecisionQuery } from './gql/prepr-queries';

page: (url) => ({
  document: PageDocument,
  decision: PageDecisionQuery, // no schema download at runtime
  variables: { slug: url.pathname },
}),
```

API routes, `/_next/` and URLs whose last segment has a file extension (`/logo.png`, but also `/docs/v1.2`) are skipped. A decision request for any other URL `page` maps to a query sends one decision query; a page without groups gets an empty answer. Pass `onlyIf: (request) => boolean` to skip Prepr for some requests, such as crawlers, which then get the default variants. In preview it also sends the editor through the [draft route](#preview) first. `createPreprMiddleware` and `preprDraftRedirect` stay exported for proxies that need them separately; decision requests are answered by `createPreprProxy` only.

##### A/B tests

A/B tests go through the same decision as segment groups: both variants are in the prerendered page, hidden until the page view's decision shows the visitor's one. Prepr assigns a variant per experiment, from the visitor's customer id and that experiment's split, so the decision is the only reliable source; one stored bucket per visitor cannot follow a 20/80 and a 50/50 test at once. A is the default, also for crawlers and when Prepr cannot be asked. Pass `bucket` to `PreprStack` only when the route already knows it. Under a strict Content-Security-Policy, pass `nonce` to `PreprStack`.

##### How each visitor gets their variant

Every page view is decided. Nothing is reused from a prefetch, the router cache or another page's view; the only reuse is showing a view again as the visitor just saw it (a reload, Back and Forward).

- **Page loads.** The page is the same for every visitor and is sent at once, from the cache. An inline script at the start of each `PreprStack` asks the proxy for this view's decision as soon as it is parsed, so Prepr answers while the rest of the page, its styles and scripts (the tracking pixel included) still load. The personalized sections show the visitor's variant when the answer arrives; everything else never waits for it.
- **Client-side navigations.** When the visitor presses a link, `PreprPersonalizationSwitch` asks the proxy for the target page's decision, and the click waits for the answer. The new page then paints with the visitor's variants. Pressing, not clicking, starts the request, so most of the wait happens while the button is still going down. Prefetches still bring the page itself; only the decision is fetched per click.
- **Never the default first.** Until a view's decision is in, its personalized sections are not shown: the default variant keeps its space, invisible, so the page does not move when the visitor's variant appears (only by any difference in height). The default variant only shows when it is the decision: for visitors in none of the segments, for requests `onlyIf` skips, and when Prepr does not answer within `timeoutMs` (default 3000). Navigations started from code ask for a decision when the page opens; the personalized sections appear when it arrives.
- **Reloads and Back/Forward.** Back and Forward show a page as this tab last showed it, at once, without asking Prepr. A reload of the same URL within 10 seconds of the decision, with no other page view in between, reuses it too (kept in `sessionStorage`); after that, or after any other page view, the browser asks again. A URL with other UTM parameters is another view. Prepr needs a few seconds to process a visitor's activity anyway, so asking again sooner would mostly get the same answer.
- **"Right" means what Prepr knows when the visitor clicks.** Prepr assigns segments from the visitor's tracked activity. If it has not yet processed the pixel event of the previous page view, the decision cannot include it, and the visitor sees that segment from a later page view.
- **Costs.** The page carries the HTML of every variant, and an item with groups nested inside it once per combination of their variants. `render` gets `defaultVariant`: give `priority` images only to the default variant and `loading="lazy"` to the others, or the browser downloads every variant's hero image. Every page view and every link press on a site with personalization is one decision request (a press on touch devices too, also when it turns into a scroll), answered from Prepr's cache when other visitors had the same answer.
- Without JavaScript, visitors see the default variants.

##### Deploying

Pages are sent without waiting for Prepr; only the personalized sections wait for their decision, and most of that time is spent at Prepr, in two steps:

- **Who is the visitor?** For a visitor Prepr has not seen before, it first works out their segments, which takes a few hundred milliseconds on pages with segment groups. A returning visitor is resolved at once.
- **The answer.** Prepr's CDN caches each decision per page, segment set and A/B bucket, and shares it between visitors who get the same. A cached answer takes tens of milliseconds; working one out takes most of a second, once per page and combination until Prepr's cache drops it.

Under steady traffic most answers come from that cache. Your deployment adds the rest:

- **Region.** Run your functions, the proxy included, in the region closest to your visitors and to Prepr.
- **Keep connections open.** Node.js closes idle connections after a few seconds. On the Node.js runtime, give the client a `fetch` that keeps them longer; this affects only the client's own requests:

  ```ts
  import { Agent } from 'undici';

  const keepAlive = new Agent({ keepAliveTimeout: 60_000 });
  export const prepr = createPreprClient({
    url: process.env.PREPR_GRAPHQL_URL!,
    fetch: (input, init) =>
      fetch(input, { ...init, dispatcher: keepAlive } as RequestInit),
  });
  ```

- **Instances.** On Vercel, Fluid Compute reuses a function instance, and its open connections, across requests, so under steady traffic the connection stays warm. Each fresh instance pays the setup on its first request; keep instances warm with your platform's settings if your traffic is low.
- **No schema at runtime.** Pass the codegen plugin's decision query as `decision` (see [The proxy](#the-proxy)), so a fresh instance does not download Prepr's schema before its first decision.
- **Timeout.** When Prepr does not answer within `timeoutMs` (default 3000), the personalized sections show the default variants, with nothing swapped in later. Lower it to cap how long they can stay hidden.

##### Preview

Run preview in [draft mode](https://nextjs.org/docs/app/guides/draft-mode), so editors see an edit on the next load instead of the cached page:

```ts
// app/api/prepr/draft/route.ts
export const GET = createPreprDraftRoute({ preview });

// proxy.ts, before anything else
const draft = preprDraftRedirect(request, { preview });
if (draft) return draft;
```

Outside preview both do nothing (the route answers 404). Keep the route out of your proxy `matcher`, or pass its path as `route` when it lives elsewhere. Inside the Prepr editor, browsers that refuse the draft cookie get the cached page instead, so keep a publish webhook (below) in place.

##### Refreshing on publish

`revalidateTag('prepr')` refreshes every Prepr page on every publish. To refresh only the pages that show the changed item, tag each cached page with its items and let a Prepr webhook revalidate the item's tag.

1. **Tag the page with its items.** Add `tagItems: true` to the query inside `'use cache'`. The entry gets a `prepr:<_id>` tag for every item in the result, at any depth; with `variants: true` that is every variant's items, so a change to any variant reaches the page.

   ```tsx
   async function getPage(slug: string) {
     'use cache';
     const { data } = await prepr().query(
       GetPageBySlugDocument,
       { slug },
       { variants: true, tagItems: true },
     );
     return data;
   }
   ```

   With your own client, call `cacheTag(...preprCacheTags(data))` inside `'use cache'` instead.

2. **New items are covered too.** A new item is in no cached result yet, so `tagItems` also tags two kinds of query with their model's `prepr:model:<model>` tag, which a publish of any item of that model revalidates:
   - list queries (`Posts { items { … } }`), so a new post joins the list;
   - lookups that found nothing (`Page(slug: "new")` returning `null`), so publishing that page replaces the cached "not found".

   Other pages that depend on which items exist (a sitemap, a count) can add the tag themselves:

   ```ts
   import { cacheTag } from 'next/cache';
   import { preprModelTag } from '@preprio/toolkit/nextjs/graphql';

   cacheTag(preprModelTag('Post')); // the model's name in Prepr or its GraphQL type
   ```

   The model name is compared without case, spaces or punctuation, so `'Blog post'` (what webhooks send) and `BlogPost` (the GraphQL type) give the same tag. A model whose API ID was renamed away from its name does not match.

3. **Add the webhook route.**

   ```ts
   // app/api/prepr/webhook/route.ts
   import { createPreprWebhookRoute } from '@preprio/toolkit/nextjs';

   export const POST = createPreprWebhookRoute({
     secret: process.env.PREPR_WEBHOOK_SECRET,
   });
   ```

   Keep the route out of your proxy `matcher`.

4. **Create the webhook in Prepr.** Under **Settings → Webhooks**, add `https://<your-site>/api/prepr/webhook` with the events `content_item.published`, `content_item.unpublished`, `content_item.deleted` and `content_item.invalidated`, plus `asset.changed`, `asset.deleted` and `schema.changed`. Other events are acknowledged and ignored, so subscribing to more does no harm. Save, then copy the webhook's **ID** into `PREPR_WEBHOOK_SECRET`: Prepr signs every request with it.

The route checks the `Prepr-Signature` header (an HMAC-SHA256 of the body, keyed with the webhook ID, as hex or base64) and answers 401 to a missing or wrong signature, or to a request older than five minutes. A valid event revalidates:

| Tag                   | When                                                                                              | Reaches                                                       |
| --------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `prepr:<id>`          | `content_item.published`, `.unpublished`, `.deleted`, `.invalidated`; `asset.changed`, `.deleted` | pages showing that item or asset                              |
| `prepr:model:<model>` | `content_item.published`, `.unpublished`, `.deleted`                                              | list queries, lookups that found nothing, pages tagged by you |
| `prepr:any`           | the same events as `prepr:<id>`                                                                   | pages with more items than Next.js's tag limit                |
| `prepr:schema`        | `schema.changed`                                                                                  | the schema the client rewrites queries with                   |

Draft edits (`content_item.changed`, `.created`), visitor and segment events revalidate nothing: they change no published page.

Revalidation uses `revalidateTag(tag, { expire: 0 })`, so the next request after a publish gets the new page. Pass `profile: 'max'` to serve the old page once more while the new one renders in the background.

Next.js accepts at most 128 tags per `cacheTag()` call. A page with more items is tagged `prepr:any` instead (`PREPR_ANY_ITEM_TAG`), so it refreshes on every event, as with `revalidateTag('prepr')`. The response lists the revalidated tags, which Prepr shows on the webhook's detail page.

`tagItems` makes that query skip the Data Cache: a Data Cache entry carries only the client's `cacheTags`, so after an item tag is revalidated, the `'use cache'` function would re-run against the stale response. The `'use cache'` entry is the cache. The client's `cacheTags` still apply to the entry, so `revalidateTag('prepr')` keeps refreshing everything. `tagItems` needs Next.js 16 and throws outside a `'use cache'` function.

<details>
<summary>How it works</summary>

- **`variants: true`** adds `personalize: false` to every personalizable field in your query, at any depth, and selects each item's `_context`. The client learns which fields are personalizable from one schema introspection request per client, kept in the Data Cache.
- **Decisions** send your query cut down to the lists that hold segment groups, selecting only `_context`, with the visitor's headers and never cached. Prepr decides from everything the middleware forwards: customer profile, UTM parameters, visitor IP, HubSpot id. A page without segment groups makes no request. `prepr.decide()` does the same inside a render, for rendering variants yourself with `resolveVariants`; `PreprStack` does not need it.
- **`PreprStack`** renders every variant of each segment group, and each item with groups nested inside it once per combination of their variants, in `display: contents` wrappers that stay hidden until the view's decision marks one to show. A group with no default variant still gets its place.
- **A/B variants** are both in the HTML and picked by the same decision as segment groups. A hidden variant never becomes visible, so the tracking pixel records no impression for it.
- **`hasAbTests`** sends your query without its leaf fields and no visitor headers, so Prepr's CDN caches it, and reads the answer from the `Vary` header. Answers are reused for a minute.
- **Tags carry over.** The client's `'prepr'` fetch tag applies to the `'use cache'` entry, so `revalidateTag('prepr')` refreshes it without a `cacheTag()` call. `tagItems` adds a tag per item; see [Refreshing on publish](#refreshing-on-publish).
- **Outside `'use cache'`, set `revalidate`** on the client (`false` or seconds). Otherwise a query outside both `'use cache'` and `<Suspense>` fails the build with "uncached data was accessed outside of `<Suspense>`".

</details>

`examples/nextjs-cache-components` is a runnable version.

Do not catch and swallow errors from `query` without [`unstable_rethrow`](https://nextjs.org/docs/app/api-reference/functions/unstable_rethrow): Next.js signals dynamic rendering by throwing from inside `fetch`, and the client passes those signals through.

#### Using your own GraphQL client

Everything the toolkit's client does for personalization is two query rewrites and one helper. Use them with any client: Apollo, urql, or plain `fetch`.

1. **Variants query** (same for every visitor, cache it): `toVariantsQuery(query, schema)`.
2. **Decision query** (per visitor, never cached, with the visitor's Prepr headers): `toDecisionQuery(query, schema, { from: variantsData })`, then `decisionsFrom(data)`.
3. **Render** with `PreprStack` (Next.js) or `resolveVariants(data, { decisions, bucket })` anywhere.

The rewrites need to know which fields take `personalize`: `loadPreprSchema(url)` fetches that once and keeps it in memory.

```ts
import {
  decisionsFrom,
  loadPreprSchema,
  resolveVariants,
  toDecisionQuery,
  toVariantsQuery,
} from '@preprio/toolkit/graphql';

const url = process.env.PREPR_GRAPHQL_URL!;
const schema = await loadPreprSchema(url);

async function post(
  query: string,
  variables: object,
  headers: HeadersInit = {},
) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (!res.ok || json.errors)
    throw new Error(`Prepr GraphQL request failed (${res.status})`);
  return json.data;
}

const variables = { slug: '/' };
const page = await post(toVariantsQuery(PAGE_QUERY, schema), variables); // cacheable

const decisionQuery = toDecisionQuery(PAGE_QUERY, schema, { from: page });
const decisions = decisionQuery
  ? decisionsFrom(await post(decisionQuery, variables, visitorPreprHeaders))
  : new Map();

const content = resolveVariants(page.Page.content, { decisions, bucket });
```

`visitorPreprHeaders` are the headers the middleware forwards (`getPreprHeaders()` in Next.js); `bucket` is the visitor's A/B bucket, when you know it; leave it out and A/B tests use the decision too (see below).

With Apollo, parse the strings once and use them like any document:

```ts
import { gql } from '@apollo/client';

const PageVariants = gql(toVariantsQuery(PAGE_QUERY, schema));
const { data: page } = await client.query({ query: PageVariants, variables });

const decisionQuery = toDecisionQuery(PAGE_QUERY, schema, { from: page });
const decisions = decisionQuery
  ? decisionsFrom(
      (
        await client.query({
          query: gql(decisionQuery),
          variables,
          context: { headers: visitorPreprHeaders },
          fetchPolicy: 'no-cache', // per visitor: never from Apollo's cache
        })
      ).data,
    )
  : new Map();
```

**At build time with graphql-codegen.** The plugin writes both queries per named query into a file, so nothing is rewritten and no schema is loaded at runtime:

```ts
// codegen.ts
generates: {
  'src/gql/prepr-queries.ts': {
    plugins: ['@preprio/toolkit/graphql/codegen'],
  },
},
```

```ts
import {
  GetPageBySlugDecisionQuery,
  GetPageBySlugVariantsQuery,
} from './gql/prepr-queries';
```

Only named queries with personalizable fields get exports; two queries with the same name fail the run. The generated decision query asks about every personalizable list. When you have the variants result at hand, `toDecisionQuery(query, schema, { from })` is smaller and markedly faster for visitors Prepr has not seen before.

A decision query without `from` also returns the visitor's variant of each A/B test, per experiment and its split; `from` limits it to the lists with segment groups. Otherwise pass a known bucket to `resolveVariants`.

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

Or let the client forward the headers (needs `graphql`, see [Fetching content](#fetching-content)):

```typescript
import { createPreprClient } from '@preprio/toolkit/astro/graphql';

const prepr = createPreprClient({ url: import.meta.env.PREPR_GRAPHQL_URL });
const { data } = await prepr.query(
  GetPageBySlugDocument,
  { slug },
  { personalize: true, event: Astro },
);
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

Or let the client forward them (needs `graphql`, see [Fetching content](#fetching-content)). Passing the event also routes the request through `event.fetch`:

```typescript
import { createPreprClient } from '@preprio/toolkit/sveltekit/graphql';

const prepr = createPreprClient({ url: env.PREPR_GRAPHQL_URL });

export const load: PageServerLoad = async (event) => {
  const { data } = await prepr.query(
    GetPageBySlugDocument,
    { slug: event.params.slug },
    { personalize: true, event },
  );
  return { page: data.Page };
};
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

Or let the client forward them from a server route (needs `graphql`, see [Fetching content](#fetching-content)):

```typescript
// server/api/page.get.ts
import { createPreprClient } from '@preprio/toolkit/nuxt/graphql';

const prepr = createPreprClient({ url: useRuntimeConfig().preprGraphqlUrl });

export default defineEventHandler(async (event) => {
  const { data } = await prepr.query(
    GetPageBySlugDocument,
    { slug: getQuery(event).slug },
    { personalize: true, event },
  );
  return data;
});
```

`personalize: true` needs the h3 event. During client-side navigation there is none and the query throws `CONTEXT_ERROR`, so run personalized queries in server routes.

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

### GraphQL client

`createPreprClient(options)` ships on `@preprio/toolkit/graphql` and on each framework's `/graphql` subpath (`@preprio/toolkit/nextjs/graphql`, `/nuxt/graphql`, `/sveltekit/graphql`, `/astro/graphql`). These subpaths need the `graphql` package (`>=16`); nothing else in the toolkit does. The core version takes explicit `headers`; the framework versions add `personalize`.

| Option                 | Default                           | Effect                                                                                                           |
| ---------------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `url`                  | —                                 | Full `https://graphql.prepr.io/<token>` URL. Throws `PreprError` when invalid.                                   |
| `preview`              | `false`                           | Every query is `no-store`; stega defaults to `'urls'`.                                                           |
| `stega`                | `'urls'` in preview, else `'all'` | Which strings get stega markers stripped: URL-like keys only, all, or `'none'`.                                  |
| `fetch`                | global `fetch`                    | Custom fetch. Also accepted per query.                                                                           |
| `fastlyQuery`          | `false`                           | Send queries as a GET with a `Fastly-Query` header, served by Prepr's edge. Opt-in: undocumented Prepr behavior. |
| `headers`              | —                                 | Sent with every request. Fixed per client, so queries stay cacheable.                                            |
| `cacheTags` (Next.js)  | `['prepr']`                       | Tags on cacheable fetches.                                                                                       |
| `revalidate` (Next.js) | unset                             | `next.revalidate` on cacheable fetches.                                                                          |

`query(document, variables?, options?)` takes a query string, a `TypedDocumentString` or a `DocumentNode`, and resolves to `{ data, personalized }`. Per-query options: `headers`, `init`, `fetch`, plus `personalize` (framework versions), `tagItems` (Next.js 16, inside `'use cache'`) and `event` (Nuxt, SvelteKit, Astro). A request carrying per-query headers or `init.headers` is `no-store`; client-level `headers` are not.

Import `PreprError` from the same subpath as the client when checking `instanceof`: CommonJS entry points do not share classes. `error.code` works from anywhere.

`isPersonalizedResponse(response)`, exported from every entry point, reads the same verdict from a response fetched with your own client. It does not need `graphql`.

For your own GraphQL client (see [Using your own GraphQL client](#using-your-own-graphql-client)), every `/graphql` subpath also exports:

| Function                                                   | Returns                                                                                |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `loadPreprSchema(url, { fetch? })`                         | What the rewrites need from your schema, loaded once per URL. Failures are not cached. |
| `toVariantsQuery(query, schema)`                           | The variants query as a string: what `variants: true` sends.                           |
| `toDecisionQuery(query, schema, { from?, topLevelOnly? })` | The per-visitor decision query as a string, or `null` when there is nothing to decide. |
| `decisionsFrom(data)`                                      | Decisions from a decision query's `data`, for `resolveVariants` or `PreprStack`.       |
| `preprCacheTags(data)`                                     | `prepr:<_id>` for every item in a result, or `['prepr:any']` past 128 items.           |
| `preprModelTag(model)`                                     | `prepr:model:<model>`, for list pages.                                                 |

`@preprio/toolkit/graphql/codegen` is a graphql-codegen plugin that writes `<Name>VariantsQuery` and `<Name>DecisionQuery` for every named query with personalizable fields.

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

#### `PreprPersonalizationSwitch`

From `@preprio/toolkit/nextjs`. Decides every client-side navigation: when the visitor presses a same-site link, it asks `createPreprProxy` for the target page's decision and holds the click until the answer is in (see [How each visitor gets their variant](#how-each-visitor-gets-their-variant)). Mount it once in the root layout, so links on pages without a `PreprStack` are covered too. Clicks with a modifier key, links to other sites and links that open a new tab or download are left alone. The decision requests are answered by `createPreprProxy` only. Takes no props and renders nothing.

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
| `options`    | `PreprPreviewOptions`    | `{ debug?, locale?, features?, ui?, allowedEditorOrigins?, autoClean? }`. See [Preview options](#preview-options).                                                                                                                                                                               |
| `navigation` | `PreprNavigationAdapter` | How segment/variant switches navigate. Optional — omitted, the toolbar uses `window.location.assign` (a full page load). `reload` is optional too, runs after a preview-mode toggle, and defaults to `window.location.reload()`. The Next.js and SvelteKit wrappers wire all of this up for you. |

`createPreprPreview` is a no-op outside a browser (no `window`/`document`) and returns a controller whose `destroy()` does nothing, so it is safe to call during SSR. Call it **once per page** — two calls start two bridges and announce the preview twice.

#### Tracking

- **`loadTrackingPixel(id, config?)`** — installs the CDN tracking pixel. Idempotent, and a no-op outside a browser. A typed facade over Prepr's existing CDN pixel (`https://cdn.tracking.prepr.io/js/prepr.min.js`), reproducing the legacy `<script>` snippet's queue-stub semantics: calls made before the CDN script loads are queued and flushed once it is ready.
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

| Option                 | Type            | Default       | Description                                                                                              |
| ---------------------- | --------------- | ------------- | -------------------------------------------------------------------------------------------------------- |
| `debug`                | `boolean`       | `false`       | Enable debug logging.                                                                                    |
| `locale`               | `'en' \| 'nl'`  | auto-detected | UI language. Falls back to the first supported browser language, then `en`.                              |
| `features`             | `PreprFeatures` | all enabled   | Which features run. See [Feature flags](#feature-flags).                                                 |
| `ui`                   | `boolean`       | `true`        | Mount the visible toolbar. See [Headless preview](#headless-preview-no-toolbar-ui).                      |
| `allowedEditorOrigins` | `string[]`      | `*.prepr.io`  | Exact editor origins allowed to drive this preview, for self-hosted editors. Replaces the wildcard.      |
| `autoClean`            | `boolean`       | `true`        | Strip the invisible stega characters from visible text. See [Stega auto-cleaning](#stega-auto-cleaning). |

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

### Click-to-edit not working on some elements

- **Check the token permissions**: "Enable edit mode" must be checked on the token in Prepr.
- **Check whether the encoded text sits in a hidden element.** The parent of the encoded text node is what becomes editable, and a parent that renders no box (`display: none`, `visibility: hidden`, the `hidden` attribute) is skipped — it cannot be hovered or clicked. Put `data-prepr-edit-target` on the visible ancestor that should be editable instead. See [Choosing the element that becomes editable](#choosing-the-element-that-becomes-editable).
- **Inspect the tagged elements**: `document.querySelectorAll('[data-prepr-encoded]')` in the console lists everything edit mode found. An element you expected to be in that list points at one of the two cases above.

### Every variant shows at once

The list came from a `variants: true` query but was rendered directly. Pass it through `PreprStack` (or `resolveVariants`); see [Personalization with Cache Components](#personalization-with-cache-components).

### Headers not working

- **Middleware setup**: confirm `middleware.ts` sits in the project root (or `src/`) and its matcher covers the route.
- **API calls**: personalization only works if you spread `getPreprHeaders()` into your GraphQL fetch. Missing headers is the most common reason segments appear to have no effect.
- **Chained middleware**: when chaining, pass the existing `NextResponse` as the second argument. Creating a fresh `NextResponse.next()` afterwards discards Prepr's request headers.

### Segments switch but content does not change

The toolbar sets the segment; your data fetch decides what to do with it. Check that the fetch forwards `getPreprHeaders()` and is not being served from cache — use `cache: 'no-store'`, or Apollo's `fetchPolicy: 'no-cache'`, on personalized queries. `createPreprClient` with `personalize: true` does both.

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

Codes: `INVALID_TOKEN`, `MISSING_TOKEN`, `HTTP_ERROR`, `FETCH_ERROR`, `INVALID_RESPONSE`, `CONTEXT_ERROR`, `GRAPHQL_ERROR`, `INVALID_DOCUMENT`.

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

Stega cleaning is automatic. There is no need to call `vercelStegaSplit` or to strip the payload yourself before rendering — the data attributes the toolkit relies on survive the clean, so edit mode still activates instantly.

#### Stega auto-cleaning

Preview content carries its edit payload inside the text itself, as a run of invisible Unicode characters. The toolkit strips them from the DOM after load and keeps stripping them as your framework re-renders.

Leaving them in place is not cosmetic. The characters are real string content: they inflate `String.length`, break text measurement and truncation, and are announced by screen readers.

Turn the stripping off with `autoClean: false`:

```typescript
createPreprPreview({ props, options: { autoClean: false } });
```

Only do this when your app already strips the payload itself — for example by passing every field through `stegaClean` as it renders:

```typescript
import { stegaClean } from '@preprio/toolkit';

<h1>{stegaClean(page.title)}</h1>;
```

Click-to-edit is unaffected by this option. Elements are still tagged from the payload, so the overlay, tooltip and edit bridge keep working either way.

#### Choosing the element that becomes editable

The element that gets the outline, the tooltip and the click handler is the **parent of the encoded text node**. Rendering `{title}` inside an `<h2>` makes the `<h2>` editable, which is what you want almost every time.

Two rules govern the choice:

- A parent that renders no box is skipped. An element hidden with `display: none`, `visibility: hidden`, or the `hidden` attribute cannot be hovered or outlined, so tagging it would produce an element that looks editable to the code and is unreachable to the visitor. Nothing is tagged for it.
- `data-prepr-edit-target` overrides the parent. The closest ancestor carrying it becomes the editable element instead.

That attribute is the supported way to separate _where the payload lives_ from _what the visitor clicks_. It is what makes the hidden-payload pattern work:

```html
<!-- The payload rides in a visually hidden span; the <article> is what
     gets outlined and clicked. -->
<article data-prepr-edit-target>
  <h2>Product title</h2>
  <span hidden>{encodedPayload}</span>
</article>
```

Without the attribute that span is skipped entirely — it renders no box, so there is nothing to click.

It is equally useful when the encoded text sits deep inside markup you do not control, and the natural click target is an ancestor:

```html
<figure data-prepr-edit-target>
  <img src="..." alt="..." />
  <figcaption><em>{encodedCaption}</em></figcaption>
</figure>
```

Without it the `<em>` would be the editable element; with it the whole figure is.

## Examples

Runnable examples live in the repository root:

| Example                            | What it shows                                                      |
| ---------------------------------- | ------------------------------------------------------------------ |
| `examples/nextjs`                  | App Router, middleware, `createPreprClient`, custom image loader   |
| `examples/nextjs-cache-components` | Cache Components: cached page shell, personalized `<Suspense>`     |
| `examples/astro`                   | Astro middleware and `.astro` components                           |
| `examples/sveltekit`               | `hooks.server.ts`, `+layout.server.ts`, `.svelte` components       |
| `examples/nuxt`                    | `server/middleware`, `useAsyncData`, `.vue` components             |
| `examples/express`                 | Vanilla core — a hand-written adapter for an unsupported framework |

## Migrating from `@preprio/prepr-nextjs`

`@preprio/toolkit` replaces the Next.js-only `@preprio/prepr-nextjs` package. Most of
the change is import paths — the middleware signature is unchanged and the server
helpers keep their names — but the toolbar's provider and the stylesheet are gone.

The [migration guide](https://github.com/preprio/prepr-toolkit/blob/main/MIGRATION.md) has the diffs.

## Support

- **Documentation**: [Prepr Documentation](https://docs.prepr.io)
- **Support**: [Prepr Support](https://prepr.io/support)
