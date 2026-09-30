# Migrating from `@preprio/prepr-nextjs`

`@preprio/toolkit` replaces `@preprio/prepr-nextjs` (last release `2.2.7`). The old
package was Next.js-only; the toolkit is a framework-free core with thin wrappers, and
Next.js is one of them.

Most of the migration is import paths. The middleware signature is unchanged, the
server helpers keep their names, and the React components keep theirs — what moves is
where you import them from, and how the toolbar receives its state.

Everything below is for the App Router, which is what the old package supported.

## At a glance

| `@preprio/prepr-nextjs`                                                   | `@preprio/toolkit`                                |
| ------------------------------------------------------------------------- | ------------------------------------------------- |
| `@preprio/prepr-nextjs/middleware`                                        | `@preprio/toolkit/nextjs`                         |
| `@preprio/prepr-nextjs/server`                                            | `@preprio/toolkit/nextjs`                         |
| `@preprio/prepr-nextjs/react`                                             | `@preprio/toolkit/nextjs`                         |
| `@preprio/prepr-nextjs/utils`                                             | removed — see [Removed exports](#removed-exports) |
| `import '@preprio/prepr-nextjs/index.css'`                                | delete it — the toolbar styles itself             |
| `export default createPreprMiddleware`                                    | named: `import { createPreprMiddleware }`         |
| `<PreprToolbarProvider props={…}><PreprToolbar /></PreprToolbarProvider>` | `<PreprToolbar {...toolbarProps} />`              |
| `<PreprTrackingPixel accessToken={…} />`                                  | `<PreprTrackingPixel id={…} />`                   |

One entry point (`@preprio/toolkit/nextjs`) now covers middleware, server helpers and
components — the `/middleware`, `/server` and `/react` split is gone.

## 1. Swap the dependency

```bash
npm uninstall @preprio/prepr-nextjs
npm install @preprio/toolkit
```

## 2. Middleware

The signature is identical, including the `(request, response, options)` overload for
chaining. Only the import changes, and `createPreprMiddleware` is now a **named**
export rather than a default one.

```diff
-import createPreprMiddleware from '@preprio/prepr-nextjs/middleware';
+import { createPreprMiddleware } from '@preprio/toolkit/nextjs';

 export function middleware(request: NextRequest) {
   return createPreprMiddleware(request, { preview: true });
 }
```

## 3. Layout: toolbar and tracking pixel

Three things change together here.

**The provider is gone.** `PreprToolbar` used to render with no props and read its
state from `PreprToolbarProvider` through context. It now takes that state directly,
so the wrapper disappears and `toolbarProps` spreads onto the component.

**The stylesheet is gone.** The toolbar renders as a custom element in a shadow root
and carries its own styles, so `@preprio/prepr-nextjs/index.css` has no replacement —
delete the import. Theme it with CSS custom properties (`--prepr-primary`,
`--prepr-bg`, `--prepr-text`, `--prepr-radius`, `--prepr-shadow`, `--prepr-z-index`)
instead.

**The pixel prop is renamed** from `accessToken` to `id`.

```diff
-import { getToolbarProps, extractAccessToken } from '@preprio/prepr-nextjs/server';
-import {
-  PreprToolbar,
-  PreprToolbarProvider,
-  PreprTrackingPixel,
-} from '@preprio/prepr-nextjs/react';
-import '@preprio/prepr-nextjs/index.css';
+import {
+  getToolbarProps,
+  extractAccessToken,
+  PreprToolbar,
+  PreprTrackingPixel,
+} from '@preprio/toolkit/nextjs';

 export default async function RootLayout({ children }) {
   const toolbarProps = await getToolbarProps(process.env.PREPR_GRAPHQL_URL!);
   const accessToken = extractAccessToken(process.env.PREPR_GRAPHQL_URL!);

   return (
     <html>
-      <head>{accessToken && <PreprTrackingPixel accessToken={accessToken} />}</head>
+      <head>{accessToken && <PreprTrackingPixel id={accessToken} />}</head>
       <body>
-        <PreprToolbarProvider props={toolbarProps}>
-          {children}
-          <PreprToolbar />
-        </PreprToolbarProvider>
+        {children}
+        <PreprToolbar {...toolbarProps} />
       </body>
     </html>
   );
 }
```

## 4. The preview gate is now yours

The old `getToolbarProps` called `isPreviewMode()` internally and returned empty data
outside preview. The toolkit's does not gate itself — you decide when preview is on and
pass it to the middleware, and you decide whether to call `getToolbarProps` and render
`<PreprToolbar />` at all.

```typescript
// middleware.ts — resolve `preview` however your deployment already does.
const preview = process.env.VERCEL_ENV !== 'production';
return createPreprMiddleware(request, { preview });
```

```tsx
// layout.tsx — skip the fetch and the toolbar entirely outside preview.
const preview = process.env.VERCEL_ENV !== 'production';
const toolbarProps = preview
  ? await getToolbarProps(process.env.PREPR_GRAPHQL_URL!)
  : null;

return (
  <body>
    {children}
    {toolbarProps && <PreprToolbar {...toolbarProps} />}
  </body>
);
```

`<PreprToolbar />` does not read the middleware's `preview` flag: it mounts whenever it
renders. Rendering it conditionally is what keeps the toolbar out of production.

The toolkit reads **no environment variables of its own** — not `PREPR_ENV`, not
`PREPR_GRAPHQL_URL`. Every value is passed in explicitly.

`getToolbarProps` still swallows fetch failures and returns empty data rather than
throwing, so a Prepr outage degrades to "no toolbar" instead of a broken page.

## 5. Server helpers

Same names, same no-argument calling convention (they read `next/headers`
themselves) — only the import path moves.

```diff
-import {
-  getPreprUUID,
-  getActiveSegment,
-  getActiveVariant,
-  getPreprHeaders,
-} from '@preprio/prepr-nextjs/server';
+import {
+  getPreprUUID,
+  getActiveSegment,
+  getActiveVariant,
+  getPreprHeaders,
+} from '@preprio/toolkit/nextjs';
```

`validatePreprToken`, `extractAccessToken` and `PreprError` move to the same entry
point and are unchanged.

## Removed exports

| Removed                                   | What to do                                                                                                                  |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `PreprToolbarProvider`, `usePreprToolbar` | Pass `toolbarProps` to `<PreprToolbar />` directly. The context is gone.                                                    |
| `@preprio/prepr-nextjs/index.css`         | Delete the import; the toolbar styles itself in a shadow root.                                                              |
| `PreprStegaClean`                         | Edit-mode scanning is built into the toolbar. Turn it off with `options={{ features: { editMode: false } }}`.               |
| `useTranslations`                         | Internal to the toolbar.                                                                                                    |
| `sendPreprEvent`                          | Use `trackEvent` from `@preprio/toolkit`.                                                                                   |
| `cn` and the rest of `/utils`             | Internal helpers that were never part of the intended surface. Copy the two-line `cn` into your own project if you used it. |

## Optional: turn features off

New in the toolkit — segments, A/B testing and edit mode can each be disabled, in the
middleware and on the component. Pass the same object to both.

```typescript
const preprFeatures = { segments: true, abTesting: true, editMode: false };
```

```typescript
createPreprMiddleware(request, { preview, features: preprFeatures });
const toolbarProps = await getToolbarProps(
  process.env.PREPR_GRAPHQL_URL!,
  preprFeatures,
);
```

```tsx
<PreprToolbar {...toolbarProps} options={{ features: preprFeatures }} />
```

Passing the object to `getToolbarProps` as well skips the segments request entirely when
segments are disabled.

## Verify

1. Log `await getPreprHeaders()` in a Server Component, switch a segment and a variant
   in the toolbar, and confirm `Prepr-Segments` / `Prepr-ABtesting` appear. These are
   request headers forwarded to your server code, so they do not show up in the
   response (`curl -I` will not list them).
2. Load a page with `preview: true` and confirm the toolbar mounts.
3. Switch a segment and a variant; the page should navigate and the content change.
4. Confirm the tracking pixel fires a `pageload` event.
5. Deploy with `preview` resolving to `false` and confirm no toolbar renders (this relies
   on the conditional render from step 4).

A full working integration lives in
[`examples/nextjs`](https://github.com/preprio/prepr-toolkit/tree/main/examples/nextjs).
