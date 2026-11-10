# SvelteKit

[← Back to the README](../README.md)

Setup for `@preprio/toolkit/sveltekit`. Requires Svelte 5. The `.svelte` components ship as source and compile in your own Vite pipeline.

## Setup

```bash
npm install @preprio/toolkit
```

Add `PREPR_GRAPHQL_URL=https://graphql.prepr.io/{YOUR_ACCESS_TOKEN}` to `.env`. The toolkit reads no environment variables itself; the name is yours.

The snippets import `dev` from `$app/env` (SvelteKit 3). On SvelteKit 2 import it from `$app/environment`.

### 1. Hook

**`src/hooks.server.ts`**

```typescript
import { dev } from '$app/env';
import { preprHandle } from '@preprio/toolkit/sveltekit';

export const handle = preprHandle({ preview: dev });
```

### 2. Layout

**`src/routes/+layout.server.ts`** — the same flag gates `getToolbarProps`:

```typescript
import { dev } from '$app/env';
import { env } from '$env/dynamic/private';
import {
  extractAccessToken,
  getToolbarProps,
} from '@preprio/toolkit/sveltekit';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ request }) => {
  const accessToken = extractAccessToken(env.PREPR_GRAPHQL_URL!);
  if (!dev) return { toolbarProps: null, accessToken };

  const toolbarProps = await getToolbarProps(
    request.headers,
    env.PREPR_GRAPHQL_URL!,
  );
  return { toolbarProps, accessToken };
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
<PreprTrackingPixel id={data.accessToken} />
{#if data.toolbarProps}
  <PreprToolbar {...data.toolbarProps} />
{/if}
```

### 3. Data fetching

In `load` functions and endpoints, read the headers the hook already computed off `event.locals`, and spread them into every Prepr GraphQL request:

```typescript
import { getPreprHeadersFromLocals } from '@preprio/toolkit/sveltekit';

const preprHeaders = getPreprHeadersFromLocals(event.locals);
```

The `.svelte` components ship as source (compiled by your own Vite/Svelte pipeline) and mount client-side via `onMount`, so they never run during SSR.

### Soft navigation (optional)

By default a segment or variant switch does a full page load. Pass `navigation` to route through SvelteKit instead:

```svelte
<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
</script>

<PreprToolbar
  {...data.toolbarProps}
  navigation={{
    navigate: (url) => goto(url, { invalidateAll: true }),
    currentPath: () => page.url.pathname + page.url.search,
  }}
/>
```

See the runnable example at [`examples/sveltekit`](https://github.com/preprio/prepr-toolkit/tree/main/examples/sveltekit) for the full source.

## Verify it works

1. Start the site with your preview flag on and open any page. The Prepr toolbar button shows on the right edge of the page.
2. Pick a segment in the toolbar. The page updates and your Prepr GraphQL requests carry a `Prepr-Segments` header.
3. In Prepr, open a content item and its preview. Hovering text on the page outlines it; clicking it opens the field in the editor.

Nothing showing? See [Troubleshooting](./troubleshooting.md).

## Live preview

First work through the [live preview checklist](./live-preview.md#checklist). Then return your preview flag from `load`, and run the query result through `normalizedQuery`. It applies the
editor's changes in the browser, with no server round trip:

```svelte
<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { normalizedQuery } from '@preprio/toolkit/sveltekit/live';

  let { data } = $props();

  const result = $derived(
    normalizedQuery(GetPageDocument, data.result, {
      enabled: data.preview,
      onSave: invalidateAll,
    }),
  );
</script>

<h1>{$result.Page.title}</h1>
```

`normalizedQuery` returns a Svelte store: render from `$result`. Pass the
result in the shape the query returns (`{ Page: … }`, not just the page), so
the toolkit can tell which response key holds which field. On save,
`invalidateAll` reruns your `load` functions for the stored content.

Options: `enabled`, `onSave`, `operationName` (for a document that holds several operations), `allowedEditorOrigins` and `strictMode`.
