# Live preview

[← Back to the README](../README.md)

Inside Prepr's side-by-side preview, live preview shows what an editor types
before they save: text, links and other fields update on the page as they
type, and a save shows the stored content. Outside the editor, and when it is
not enabled, it does nothing and costs nothing: the runtime loads only inside
the editor iframe.

| Framework | Entry point                                | Applies changes                       | Setup                                    |
| --------- | ------------------------------------------ | ------------------------------------- | ---------------------------------------- |
| Next.js   | `@preprio/toolkit/nextjs` + `/nextjs/live` | On the server (`normalizeQuery`)      | [Next.js](./nextjs.md#live-preview)      |
| Astro     | `@preprio/toolkit/astro`                   | On the server (`normalizeQuery`)      | [Astro](./astro.md#live-preview)         |
| SvelteKit | `@preprio/toolkit/sveltekit/live`          | In the browser (`normalizedQuery`)    | [SvelteKit](./sveltekit.md#live-preview) |
| Nuxt      | `@preprio/toolkit/nuxt/live`               | In the browser (`useNormalizedQuery`) | [Nuxt](./nuxt.md#live-preview)           |

Other server-rendered stacks use the core exports; see
[Any other framework](./other-frameworks.md#live-preview).

## How the pieces fit

```
Prepr editor (https://<you>.prepr.io)
 └─ iframe: your preview deployment
      ├─ toolbar runtime     handshake with the editor, click-to-edit
      └─ live preview        receives each change the editor types
           ├─ Nuxt, SvelteKit, Next.js client components: patches the data in the browser
           └─ Next.js server components, Astro: asks the server to render again with the changes
```

1. The editor loads your preview URL in an iframe and sends a handshake. The toolkit accepts it only from `https://*.prepr.io` (or your `allowedEditorOrigins`).
2. The page announces that it supports live preview.
3. While the editor types, it posts each changed field to the page, addressed by the item's `_id`.
4. The toolkit applies the change to your query result and the page re-renders.
5. On save the page fetches the stored content again.

## Checklist

Work through these once; the per-framework steps come after.

**In Prepr**

1. Open **Settings → Access tokens** and take the **GraphQL Preview** token. Check **Enable edit mode** on it and save.
2. Set the environment's preview URL to a deployment that uses that token and runs with your preview flag on.

**On your site**

3. **Set up the toolbar first** ([Next.js](./nextjs.md), [Astro](./astro.md), [SvelteKit](./sveltekit.md), [Nuxt](./nuxt.md)). On Next.js and Astro, live preview runs only where the Prepr middleware handled the request with `preview: true`; on a page the middleware skips it does nothing and shows no error. Nuxt and SvelteKit apply changes in the browser and only need `enabled`.
4. **Serve the preview over HTTPS.** Inside the editor your site is a cross-site iframe, where browsers keep cookies only when they are `SameSite=None; Secure`, and `Secure` needs HTTPS. The middleware sets the preview cookies that way on HTTPS (also behind a proxy that sends `x-forwarded-proto: https`). Over plain HTTP the selected segment and variant do not survive a reload inside the editor.
5. **Allow Prepr to frame your site.** If your server sends a `Content-Security-Policy`, list your Prepr environments in `frame-ancestors`, and do not send `X-Frame-Options: DENY` or `SAMEORIGIN` on preview:

   ```
   Content-Security-Policy: frame-ancestors 'self' https://acme.prepr.io
   ```

6. **Select `_id` in your queries**, see [Preparing your queries](#preparing-your-queries). An item without `_id` stays static.
7. **Pass your preview flag as `enabled`** to every live preview entry point. Each one does nothing without it. Never pass `true` on a production deployment.

## Per framework

| Framework                                | Add to your code                                                                                         |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| [Next.js](./nextjs.md#live-preview)      | `normalizeQuery(query, data, { enabled })` on each result, `<PreprRefresh enabled />` in the root layout |
| [Astro](./astro.md#live-preview)         | `normalizeQuery(query, data, { enabled, locals: Astro.locals })` on each result                          |
| [SvelteKit](./sveltekit.md#live-preview) | `normalizedQuery(query, data.result, { enabled, onSave: invalidateAll })`                                |
| [Nuxt](./nuxt.md#live-preview)           | `useNormalizedQuery(query, data, { enabled, onSave: refresh })`                                          |

## Verify it works

1. Open a content item in Prepr and its side-by-side preview.
2. Type in a text field. The page shows the text before you save.
3. Save. The page shows the stored content.

Not updating? See [Troubleshooting](./troubleshooting.md#live-preview-does-not-update).

## Preparing your queries

Live updates and click-to-edit find content by id, never by position, so
they stay correct while an editor adds, removes or reorders blocks before
saving. Every model, component and dynamic content entry that should
live-update needs `_id` (and ideally `__typename`) in the query result; items
without `_id` stay static.

There are three ways to get them there. Pick the first that fits your setup.

### Option 1: GraphQL Codegen (recommended)

Add the `preprIds` document transform to your Codegen output. `_id` is
added wherever your schema has one: on models and components, and inside
each member of a dynamic content field. Collections like `Pages` and unions
themselves never get an `_id`, so the queries stay valid. Your `.graphql`
files stay as they are; the generated documents and types include the field,
at no runtime cost. Adding a field never breaks code that compiles today, so
this is safe to turn on in an existing project.

```ts
// codegen.ts
import type { CodegenConfig } from '@graphql-codegen/cli';
import { preprIds } from '@preprio/toolkit/codegen';

const config: CodegenConfig = {
  schema: process.env.PREPR_GRAPHQL_URL,
  documents: ['src/queries/**/*.graphql'],
  generates: {
    'src/gql/': {
      preset: 'client',
      documentTransforms: [preprIds],
    },
  },
};

export default config;
```

Run Codegen again after adding it. Needs `graphql` 16 or later, which a
Codegen setup already has.

To add `__typename` everywhere too, use `createPreprIds({ typename: true })`
instead. It is off by default because a selected `__typename` changes the
generated types: each member of a union is typed on its own, so code that
reads a union's fields without checking `__typename` first stops compiling.
Live preview only needs it on dynamic content entries, where you select it
already to render them.

### Option 2: at runtime, without Codegen

`addPreprIds(document, schema)` does the same to a parsed query. It needs
your schema, which Prepr serves through introspection on the same GraphQL
URL. Load it once on the server, and transform each query once:

```ts
import { addPreprIds } from '@preprio/toolkit/codegen';
import {
  buildClientSchema,
  getIntrospectionQuery,
  parse,
  print,
  type GraphQLSchema,
} from 'graphql';

const url = process.env.PREPR_GRAPHQL_URL!;

let schema: Promise<GraphQLSchema> | undefined;
function preprSchema(): Promise<GraphQLSchema> {
  schema ??= fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: getIntrospectionQuery() }),
  })
    .then((response) => response.json())
    .then(({ data }) => buildClientSchema(data));
  return schema;
}

const prepared = new Map<string, string>();
export async function withPreprIds(query: string): Promise<string> {
  let result = prepared.get(query);
  if (!result) {
    result = print(addPreprIds(parse(query), await preprSchema()));
    prepared.set(query, result);
  }
  return result;
}
```

Then send `await withPreprIds(query)` instead of `query` in your fetch
helper. With a client that takes a `DocumentNode`, pass
`addPreprIds(document, schema)` instead. Keep this on the server: the
GraphQL URL carries your access token.

### Option 3: by hand

Select `_id` (and `__typename`) on every model and component level, and on
every entry type in dynamic content fields (`Text`, `Quote`, …). `Assets`
entries have no `_id` of their own: select `items { _id }` instead.

Typed text and changed fields show immediately. Structural changes, such as
adding or reordering components, appear after save. For content the toolkit
cannot find by itself, see [Visual editing](./visual-editing.md#marking-content-by-hand).

## Options

| Option                 | Type                            | Where                                                                                         | Description                                                                                                                                                                                                                                     |
| ---------------------- | ------------------------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `enabled`              | `boolean`                       | every entry point                                                                             | Your preview flag. Default `false`: data is returned untouched.                                                                                                                                                                                 |
| `operationName`        | `string`                        | `normalizeQuery`, `normalizedQuery`, `useNormalizedQuery`                                     | Which operation to use when the query document holds several.                                                                                                                                                                                   |
| `onSave`               | `() => void`                    | `normalizedQuery`, `useNormalizedQuery`                                                       | Called when the editor saves, to refetch stored content.                                                                                                                                                                                        |
| `fetcher`              | `(query, variables) => Promise` | `initLivePreview`                                                                             | Runs registered queries again on save.                                                                                                                                                                                                          |
| `locals`               | `object`                        | Astro `normalizeQuery`                                                                        | `Astro.locals`, where the middleware leaves the editor's changes.                                                                                                                                                                               |
| `allowedEditorOrigins` | `string[]`                      | toolbar `options`, `PreprRefresh`, `initLivePreview`, `normalizedQuery`, `useNormalizedQuery` | Exact editor origins, replacing the `https://*.prepr.io` default. Only needed when Prepr runs on your own domain.                                                                                                                               |
| `strictMode`           | `boolean`                       | same as above                                                                                 | Your preview token uses GraphQL strict mode (required fields never null). The editor then holds back new entries until their required fields are filled, and never sends a cleared required field as null. Setting it on the toolbar is enough. |

## Security

- **Disabled means untouched.** With `enabled: false` (the default) results
  are returned as they are and the request is never read, so static and ISR
  pages stay static.
- **Only the Prepr editor can send changes.** Changes are accepted only from
  the window that frames your site, and only when its origin is
  `https://*.prepr.io` (or one of your `allowedEditorOrigins`). They are validated as hostile input: link
  fields never take `javascript:`, `vbscript:` or `data:` URLs. HTML text is
  passed on as typed, like rich text from the API.
- **One editor's changes never reach anyone else.** On the server-side
  frameworks, changes are read only in preview. Astro accepts them only from
  a same-origin `POST` carrying the toolkit's header and marks that response
  `Cache-Control: private, no-store`. Next.js stores them in the server
  process under a random, single-use token, so a replayed or cached request
  sees nothing.
- **The Next.js server action is public but inert.** Next.js registers the
  toolkit's server action in every build that imports
  `@preprio/toolkit/nextjs/live`, so anyone can call it. It does nothing
  unless the Prepr middleware handled the request with `preview: true`, and
  the middleware drops `Prepr-*` headers a client sends.

## Trying it locally

The Next.js, Astro, SvelteKit and Nuxt examples all have live preview wired
up. Open them from a Prepr environment whose preview URL points at your local
server.

## Cookies and headers

| Name                 | Kind                    | Set by                               | Purpose                                                                                  |
| -------------------- | ----------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------- |
| `__prepr_uid`        | cookie, 1 year          | middleware                           | Visitor id, sent to Prepr as `Prepr-Customer-Id`.                                        |
| `Prepr-Preview-Mode` | cookie                  | middleware and toolbar, preview only | Whether the toolbar's preview mode is on.                                                |
| `Prepr-Segments`     | cookie                  | middleware and toolbar, preview only | The segment picked in the toolbar.                                                       |
| `Prepr-ABtesting`    | cookie                  | middleware and toolbar, preview only | The A/B variant picked in the toolbar.                                                   |
| `Prepr-Toolbar-Open` | cookie                  | toolbar                              | Whether the toolbar panel is open.                                                       |
| `__prepr_live`       | cookie, already expired | Next.js server action                | A single-use token that hands the editor's changes to the re-render of the same request. |
| `x-prepr-live`       | request header          | `startHtmlLivePreview` (Astro, core) | Marks the same-origin `POST` that carries the editor's changes.                          |

The three preview cookies are written with `SameSite=None; Secure` on HTTPS.
