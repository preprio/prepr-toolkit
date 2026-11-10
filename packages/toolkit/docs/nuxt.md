# Nuxt

[← Back to the README](../README.md)

Setup for `@preprio/toolkit/nuxt`. Requires Vue 3.3 or later and Nitro's Node.js preset (the Nuxt default). The `.vue` components ship as source and compile in your own Vite pipeline.

## Setup

```bash
npm install @preprio/toolkit
```

Expose your Prepr GraphQL URL through `runtimeConfig`. The toolkit reads no environment variables itself; the name is yours.

### 1. Middleware

**`server/middleware/prepr.ts`**

```typescript
import { handlePreprRequest } from '@preprio/toolkit/nuxt';

export default defineEventHandler((event) => {
  handlePreprRequest(event, { preview: import.meta.dev });
});
```

### 2. Layout

**`app/app.vue`** — resolve the toolbar props on the server, gated on the same flag:

```vue
<script setup lang="ts">
import { extractAccessToken, getToolbarProps } from '@preprio/toolkit/nuxt';
import PreprToolbar from '@preprio/toolkit/nuxt/components/PreprToolbar';
import PreprTrackingPixel from '@preprio/toolkit/nuxt/components/PreprTrackingPixel';

const graphqlUrl = useRuntimeConfig().public.preprGraphqlUrl;
const accessToken = extractAccessToken(graphqlUrl);
const requestHeaders = useRequestHeaders();
const { data: toolbarProps } = await useAsyncData('prepr-toolbar', async () => {
  if (!import.meta.dev) return null;
  return getToolbarProps(
    new Headers(requestHeaders as Record<string, string>),
    graphqlUrl,
  );
});
</script>

<template>
  <NuxtPage />
  <PreprTrackingPixel :id="accessToken" />
  <PreprToolbar v-if="toolbarProps" v-bind="toolbarProps" />
</template>
```

### 3. Data fetching

The middleware folds the computed Prepr headers back onto the incoming request. Read them via `useRequestHeaders()` in composables, or straight off the h3 event in server routes:

```typescript
import { getPreprHeadersFromEvent } from '@preprio/toolkit/nuxt';

const preprHeaders = getPreprHeadersFromEvent(event);
```

The `.vue` components ship as source (compiled by your own Vite/Vue pipeline) and mount client-side via `onMounted`, so they never run during SSR.

### Soft navigation (optional)

By default a segment or variant switch does a full page load. Pass `navigation` to route through Nuxt instead:

```vue
<script setup lang="ts">
const route = useRoute();
const navigation = {
  navigate: (url: string) => navigateTo(url),
  currentPath: () => route.fullPath,
};
</script>

<template>
  <PreprToolbar
    v-if="toolbarProps"
    v-bind="toolbarProps"
    :navigation="navigation"
  />
</template>
```

See the runnable example at [`examples/nuxt`](../../../examples/nuxt) for the full source.

## Verify it works

1. Start the site with your preview flag on and open any page. The Prepr toolbar button shows on the right edge of the page.
2. Pick a segment in the toolbar. The page updates and your Prepr GraphQL requests carry a `Prepr-Segments` header.
3. In Prepr, open a content item and its preview. Hovering text on the page outlines it; clicking it opens the field in the editor.

Nothing showing? See [Troubleshooting](./troubleshooting.md).

## Live preview

First work through the [live preview checklist](./live-preview.md#checklist). Then run the `useAsyncData` result through `useNormalizedQuery` with your preview flag. It applies the editor's
changes in the browser, with no server round trip:

```ts
import { useNormalizedQuery } from '@preprio/toolkit/nuxt/live';

const { data, refresh } = await useAsyncData('page', () => fetchPage(slug));
const page = useNormalizedQuery(GetPageDocument, data, {
  enabled: preview,
  onSave: refresh,
});
```

Render from `page`. Nuxt hydrates the whole page, so every component that
shows a changed field updates. On save, `refresh` refetches the stored
content.

Options: `enabled`, `onSave`, `operationName` (for a document that holds several operations), `allowedEditorOrigins` and `strictMode`.
