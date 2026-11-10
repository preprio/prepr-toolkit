# API reference

[← Back to the README](../README.md)

## Entry points

| Import                                    | Exports                                                                                                                                                                                                                                               |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@preprio/toolkit`                        | Core: `createPreprPreview`, `processPreprRequest`, header helpers, token helpers, `normalizeQuery`, `annotateEditLinks`, `startHtmlLivePreview`, `readLiveLogFromRequest`, `previewAttrs`, `stegaTarget`, `stegaClean`, tracking functions, all types |
| `@preprio/toolkit/nextjs`                 | `createPreprMiddleware`, server helpers, token helpers, `normalizeQuery`, `PreprToolbar`, `PreprTrackingPixel`                                                                                                                                        |
| `@preprio/toolkit/nextjs/live`            | `PreprRefresh`, `useLive`, `initLivePreview` (client)                                                                                                                                                                                                 |
| `@preprio/toolkit/nextjs/image-loader`    | default export: `next/image` loader                                                                                                                                                                                                                   |
| `@preprio/toolkit/astro`                  | `onPreprRequest`, server helpers, token helpers, `normalizeQuery`                                                                                                                                                                                     |
| `@preprio/toolkit/astro/components/*`     | `PreprToolbar`, `PreprTrackingPixel`                                                                                                                                                                                                                  |
| `@preprio/toolkit/sveltekit`              | `preprHandle`, `getPreprHeadersFromLocals`, server helpers, token helpers                                                                                                                                                                             |
| `@preprio/toolkit/sveltekit/live`         | `normalizedQuery`                                                                                                                                                                                                                                     |
| `@preprio/toolkit/sveltekit/components/*` | `PreprToolbar`, `PreprTrackingPixel`                                                                                                                                                                                                                  |
| `@preprio/toolkit/nuxt`                   | `handlePreprRequest`, `getPreprHeadersFromEvent`, server helpers, token helpers                                                                                                                                                                       |
| `@preprio/toolkit/nuxt/live`              | `useNormalizedQuery`                                                                                                                                                                                                                                  |
| `@preprio/toolkit/nuxt/components/*`      | `PreprToolbar`, `PreprTrackingPixel`                                                                                                                                                                                                                  |
| `@preprio/toolkit/react`                  | `PreprPreview`, `PreprTrackingPixel`                                                                                                                                                                                                                  |
| `@preprio/toolkit/codegen`                | `preprIds`, `createPreprIds`, `addPreprIds`                                                                                                                                                                                                           |

The middleware has one name per framework, following each framework's own convention:

| Framework | Function                                              | Shape                                        |
| --------- | ----------------------------------------------------- | -------------------------------------------- |
| Next.js   | `createPreprMiddleware(request, [response], options)` | called per request, returns a `NextResponse` |
| Astro     | `onPreprRequest(context, next, options)`              | called per request                           |
| SvelteKit | `preprHandle(options)`                                | returns a `handle` function                  |
| Nuxt      | `handlePreprRequest(event, options)`                  | called per request in a server middleware    |
| Other     | `processPreprRequest(request, options)`               | returns headers and cookies for you to apply |

## Framework server helpers

Each wrapper exposes the same five helpers, differing only in how they reach the request headers. The Next.js versions read `next/headers` and are async; the Astro, SvelteKit, and Nuxt versions take a standard `Headers` (`Astro.request.headers`, `event.request.headers`, or one built from `useRequestHeaders()`) and are sync, except `getToolbarProps`.

| Helper             | Next.js                        | Astro / SvelteKit / Nuxt                | Returns                                                                                                 |
| ------------------ | ------------------------------ | --------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `getPreprUUID`     | `await getPreprUUID()`         | `getPreprUUID(headers)`                 | Visitor's Prepr Customer ID, or `null` when the middleware did not run for this request.                |
| `getActiveSegment` | `await getActiveSegment()`     | `getActiveSegment(headers)`             | Active segment ID, or `null`.                                                                           |
| `getActiveVariant` | `await getActiveVariant()`     | `getActiveVariant(headers)`             | `'A'`, `'B'`, or `null`.                                                                                |
| `getPreprHeaders`  | `await getPreprHeaders()`      | `getPreprHeaders(headers)`              | All Prepr headers as an object, ready to spread into a fetch.                                           |
| `getToolbarProps`  | `await getToolbarProps(token)` | `await getToolbarProps(headers, token)` | `{ activeSegment, activeVariant, segments }`. Never throws — failures degrade to an empty segment list. |

`getPreprUUID()` returning `null` is a useful check when headers seem to be missing — it means the middleware did not cover the route.

## Token helpers

Exported from `@preprio/toolkit` and from the `/nextjs`, `/astro`, `/sveltekit` and `/nuxt` entry points.

- **`validatePreprToken(token)`** — asserts a Prepr GraphQL URL is well formed. Returns nothing; **throws** `PreprError` on a bad value (`MISSING_TOKEN` when empty, `INVALID_TOKEN` when not an HTTPS URL).
- **`extractAccessToken(url)`** — extracts the access token from a Prepr GraphQL URL — the value `PreprTrackingPixel` needs as its `id`. Always returns a `string`; a URL that is malformed, not on `graphql.prepr.io`, or missing a token segment throws `PreprError(INVALID_TOKEN)`.

```typescript
const token = extractAccessToken('https://graphql.prepr.io/abc123');
// 'abc123'
```

## Components

### `PreprToolbar`

The toolbar. Takes the props returned by `getToolbarProps`, and renders nothing itself — the UI is a shadow-DOM custom element mounted imperatively. There is no provider to wrap your tree in; state lives in the toolbar's own store.

```tsx
<PreprToolbar {...toolbarProps} />
```

| Prop                                           | Type                     | Description                                                                    |
| ---------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------ |
| `activeSegment` / `activeVariant` / `segments` | —                        | Toolbar data, as returned by `getToolbarProps`.                                |
| `options`                                      | `PreprPreviewOptions`    | See [Preview options](./configuration.md#preview-options).                     |
| `navigation`                                   | `PreprNavigationAdapter` | Nuxt and SvelteKit only. Optional router binding; defaults to full page loads. |

### `PreprPreview`

From `@preprio/toolkit/react`. The framework-free equivalent of `PreprToolbar`: same preview runtime, with the router binding left to you. Renders nothing.

| Prop                                           | Type                     | Description                                                                                                             |
| ---------------------------------------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `activeSegment` / `activeVariant` / `segments` | —                        | Toolbar data, as returned by `getToolbarProps`. Optional for a headless preview.                                        |
| `options`                                      | `PreprPreviewOptions`    | Feature flags, `ui`, locale, debug (see [Preview options](./configuration.md#preview-options)).                         |
| `navigation`                                   | `PreprNavigationAdapter` | Optional router binding. Defaults to `window.location`, which is correct for any router that keeps the URL bar in sync. |

Every prop is read once on mount; changing one afterwards has no effect, since a live update would have to tear down the editor bridge and re-announce the preview. Remount to change configuration.

### `PreprTrackingPixel`

Loads Prepr's CDN tracking pixel on mount. Renders nothing. Exported from both `@preprio/toolkit/react` and `@preprio/toolkit/nextjs` — the same component, with nothing Next-specific about it.

```tsx
<PreprTrackingPixel
  id={accessToken}
  config={{ destinations: { googleTagManager: true } }}
/>
```

| Prop     | Type               | Description                                                                           |
| -------- | ------------------ | ------------------------------------------------------------------------------------- |
| `id`     | `string`           | Prepr tracking/access token. Required.                                                |
| `config` | `PreprPixelConfig` | Optional pixel configuration (see [Pixel options](./configuration.md#pixel-options)). |

## Core exports

Available from `@preprio/toolkit` for apps outside the supported frameworks.

### `processPreprRequest(request, options?)`

Computes the Prepr headers and cookies for a WHATWG `Request`.

```typescript
const { requestHeaders, responseCookies } = processPreprRequest(request, {
  preview: true,
});
// requestHeaders: Headers        — forward downstream and on to Prepr
// responseCookies: CookieSpec[]  — { name, value, maxAge, path, sameSite?, secure? }
```

When you write the cookies yourself, carry over `sameSite` and `secure`: the preview cookies need `SameSite=None; Secure` to survive the Prepr editor's iframe. See [Any other framework](./other-frameworks.md).

### `createPreprPreview(options)`

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

| Option       | Type                     | Description                                                                                                                                                                                                                                                                                                                                                          |
| ------------ | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `props`      | `PreprToolbarProps`      | From `getToolbarProps`. Optional — a headless preview has no segment list to pass.                                                                                                                                                                                                                                                                                   |
| `options`    | `PreprPreviewOptions`    | `{ debug?, locale?, features?, ui?, allowedEditorOrigins?, strictMode?, autoClean? }`. See [Preview options](./configuration.md#preview-options).                                                                                                                                                                                                                    |
| `navigation` | `PreprNavigationAdapter` | How segment/variant switches navigate. Optional — omitted, the toolbar uses `window.location.assign` (a full page load). `reload` is optional too, runs after a preview-mode toggle, and defaults to `window.location.reload()`. The Next.js `PreprToolbar` wires this to the App Router for you; the React, Nuxt and SvelteKit components take a `navigation` prop. |

`createPreprPreview` is a no-op outside a browser (no `window`/`document`) and returns a controller whose `destroy()` does nothing, so it is safe to call during SSR. Call it **once per page** — two calls start two bridges and announce the preview twice.

### Tracking

- **`loadTrackingPixel(id, config?)`** — installs the CDN tracking pixel. Idempotent, and a no-op outside a browser. A typed facade over Prepr's existing CDN pixel (`https://cdn.tracking.prepr.io/js/prepr.min.js`), reproducing the legacy `<script>` snippet's queue-stub semantics: calls made before the CDN script loads are queued and flushed once it is ready.
- **`trackEvent(name, data?)`** — sends a custom tracking event: `trackEvent('add_to_cart', { productId: 'abc123' })`.
- **`setTrackingParam(key, value)`** — sets a persistent tracking parameter: `setTrackingParam('user_type', 'returning')`.

`trackEvent` and `setTrackingParam` are independent of `loadTrackingPixel` — they work against `window.prepr` however it got installed, including a legacy HTML snippet already on the page. If no pixel is installed at all they warn once in the console and return without throwing.

### `stegaClean(value)`

Strips stega-encoded characters from a string. Rarely needed, since cleaning is automatic (see [Visual editing](./visual-editing.md)), but available when you need a clean value for comparison, sorting, or a non-DOM API.

### Header-based server helpers

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

Unlike `getToolbarProps`, `getPreprEnvironmentSegments(token)` throws on failure — see [Error handling](./troubleshooting.md#error-handling).

### Live preview and visual editing

- **`normalizeQuery(query, result, { log, operationName })`** — applies the editor's unsaved changes to a GraphQL result. See [Live preview](./live-preview.md).
- **`readLiveLogFromRequest(request)`** — the changes a live re-render request carries, or an empty list.
- **`startHtmlLivePreview(options?)`** — browser side of live preview for server-rendered HTML.
- **`annotateEditLinks(result, query?, operationName?)`** — adds list entry ids to edit links in data fetched outside the live preview helpers.
- **`previewAttrs(target, { enabled })`** and **`stegaTarget(text, { field })`** — make values without an edit link click-to-edit. See [Visual editing](./visual-editing.md#marking-content-by-hand).

### Low-level toolbar API

`PreprToolbarElement`, `definePreprToolbar`, `createToolbarStore` and `resolveFeatures` are the building blocks `createPreprPreview` is made of. They are exported for unusual integrations; a site that mounts the toolbar through `createPreprPreview` or a framework component does not need them.
