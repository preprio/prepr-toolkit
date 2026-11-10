# React (no framework)

[← Back to the README](../README.md)

`@preprio/toolkit/react` carries the two components that need nothing but React — for Vite + React Router, TanStack Router, Remix SPA mode, or Create React App. Next.js users want the [Next.js guide](./nextjs.md) instead; its `PreprToolbar` binds the App Router for you.

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

## Without personalization

A client-rendered app with no segments and no A/B testing needs **no middleware and no server helpers at all**. The middleware exists to resolve segment and variant cookies into request headers; with both features off there are no headers to resolve. What remains — click-to-edit and the editor's scroll restore — is purely client-side:

```tsx
<PreprPreview options={{ features: { segments: false, abTesting: false } }} />
```

No `navigation` prop or router context is needed in this configuration; the component can mount anywhere in the tree.

## With personalization

Segments and A/B testing need request headers, which need a server — either a framework with one (React Router in framework mode, Next.js) or your own backend using the [core](./other-frameworks.md).

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

## Tracking pageviews

The pixel tracks pageviews by itself, client-side route changes included. It counts a view for the Prepr content item named by a `prepr:id` meta tag in `<head>`, and watches that tag: when a route change points it at another item, the pixel records a new view. Render the tag on every page that shows a Prepr item:

```tsx
function Page({ page }: { page: { _id: string } }) {
  return (
    <>
      <meta property="prepr:id" content={page._id} />
      {/* … */}
    </>
  );
}
```

React 19 hoists a `<meta>` rendered anywhere in the tree into `<head>`. On React 18, set it with your head manager (`react-helmet-async` or similar) instead.

A page without the tag records no view. Calling `trackEvent('pageload')` yourself does not help: the pixel takes one `pageload` per page load and ignores the rest. Use `trackEvent` for your own events, such as `trackEvent('add_to_cart', { productId })`.

The `id` is your access token, and in a client-rendered app it is public — bundled into JS and visible in devtools. Use a tracking-only token; do not derive it from a browser-exposed GraphQL URL, which would also expose content read access.
