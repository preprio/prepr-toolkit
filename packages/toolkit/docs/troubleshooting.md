# Troubleshooting

[← Back to the README](../README.md)

## Toolbar not showing

- **Check the preview flag**: `{ preview: true }` must reach the middleware, and `getToolbarProps` must actually be called. Log the boolean you are passing — an environment check that resolves to `false` is the most common cause.
- **Verify the GraphQL URL**: it must match `https://graphql.prepr.io/YOUR_ACCESS_TOKEN`.
- **Check the token permissions**: "Enable edit mode" must be checked on the token in Prepr.
- **Confirm the middleware matcher**: if `config.matcher` excludes the current path, no Prepr headers were set for it. `getPreprUUID()` returning `null` confirms this.
- **Check for `prepr_hide_bar=true`** in the URL, which suppresses the bar by design.

## Click-to-edit not working on some elements

- **Check the token permissions**: "Enable edit mode" must be checked on the token in Prepr.
- **Check whether the encoded text sits in a hidden element.** The parent of the encoded text node is what becomes editable, and a parent that renders no box (`display: none`, `visibility: hidden`, the `hidden` attribute) is skipped — it cannot be hovered or clicked. Put `data-prepr-edit-target` on the visible ancestor that should be editable instead. See [Choosing the element that becomes editable](./visual-editing.md#choosing-the-element-that-becomes-editable).
- **Inspect the tagged elements**: `document.querySelectorAll('[data-prepr-encoded]')` in the console lists everything edit mode found. An element you expected to be in that list points at one of the two cases above.

## Headers not working

- **Middleware setup**: confirm the middleware runs for the route. In Next.js, `proxy.ts` (`middleware.ts` on Next.js 15 and older) sits in the project root or `src/` and its matcher covers the path. `getPreprUUID()` returning `null` means it did not run.
- **API calls**: personalization only works if you spread `getPreprHeaders()` into your GraphQL fetch. Missing headers is the most common reason segments appear to have no effect.
- **Chained middleware (Next.js)**: when chaining, pass the existing `NextResponse` as the second argument. Creating a fresh `NextResponse.next()` afterwards discards Prepr's request headers.

## Live preview does not update

- **Check `enabled`**: every live preview entry point needs your preview flag. On Next.js and Astro the middleware must also run with `preview: true` for that page.
- **Check the preview URL in Prepr**: it must point at a deployment that uses the GraphQL Preview token. A production build with preview off shows saved content only.
- **Check `_id`**: an item or component whose query does not select `_id` stays static. Add the `preprIds` Codegen transform, or see [Preparing your queries](./live-preview.md#preparing-your-queries).
- **Check the frame**: a `Refused to frame` error in the browser console means your `Content-Security-Policy` `frame-ancestors` does not list your Prepr environment, or the response carries `X-Frame-Options`.
- **Check the editor origin**: with `debug: true`, a console line `ignored editor handshake from origin …` names an origin that is not allowed. Add it to `allowedEditorOrigins` when Prepr runs on your own domain.
- **Next.js only shows changes on save**: `normalizeQuery` with `PreprRefresh` needs Next.js 16 or later.

## Segment or variant resets inside the Prepr editor

The preview is a cross-site iframe there, and browsers only keep cookies marked `SameSite=None; Secure`, which requires HTTPS. Serve the preview deployment over HTTPS; behind a proxy, forward `x-forwarded-proto`. With a hand-written adapter, pass each cookie's `sameSite` and `secure` through, see [Any other framework](./other-frameworks.md).

## Text contains invisible characters

Preview content carries its edit link as invisible characters inside the text. The toolkit strips them from the page, but a value you read in code still has them: comparisons, `length` and sorting are off. Pass it through `stegaClean(value)` first.

## Segments switch but content does not change

The toolbar sets the segment; your data fetch decides what to do with it. Check that the fetch forwards `getPreprHeaders()` and is not being served from cache — use `cache: 'no-store'`, or Apollo's `fetchPolicy: 'no-cache'`, on personalized queries.

## Build issues

- **Server helpers in client components**: the Next.js helpers read `next/headers` and are server-only. Calling them from a `'use client'` component fails at build time.
- **Missing peer dependencies**: importing `/nextjs` without `next`, `react`, and `react-dom` installed will not resolve. The core and `/astro` entry points have no framework peers.

## Error handling

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

## Debug mode

Logs what the toolbar, the editor bridge and live preview do to the browser console:

```tsx
<PreprToolbar {...toolbarProps} options={{ debug: true }} />
```
