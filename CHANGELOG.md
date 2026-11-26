# Changelog

All notable changes to `@preprio/toolkit`. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the package follows
[semantic versioning](https://semver.org/). Releases before 1.0.0 are listed on the
[GitHub releases page](https://github.com/preprio/prepr-toolkit/releases).

## 1.0.0-rc.7

### Changed

- `syncDebounceMs` on `PreprRefresh` and `startHtmlLivePreview` defaults to
  `0` instead of `150`: a change goes to the server as soon as the editor
  sends it, so the preview updates about 150 ms sooner. Renders still run
  one at a time. Set `syncDebounceMs={150}` to keep the previous wait, for
  example when a render is expensive.
- Next.js: with `syncDebounceMs` raised, `PreprRefresh` no longer waits for
  typing to stop. While an editor keeps typing, changes go to the server at
  least every four times that value, and at least every 600 ms.

### Fixed

- Live preview: a component or text block added since the last save shows
  a link to an item or asset as its text until save, instead of a link to
  the id (`puuid#…`).

## 1.0.0-rc.6

### Fixed

- Live preview: rich text with links to items or assets now updates while
  the editor types. Those links keep the href the page already shows for
  them; a link added since the last save shows as its text until save.

## 1.0.0-rc.5

### Added

- Next.js: `livePreviewFetch` reuses a query's last response for renders
  that only show unsaved changes, so typing in the editor does not fetch
  every query from Prepr again. A page load or a save still fetches.
- `syncDebounceMs` on `PreprRefresh` and `startHtmlLivePreview`: how long
  typing must pause before unsaved changes go to the server (default 150).

### Changed

- `annotateEditLinks` (and so `normalizeQuery`) writes the hidden edit link
  of text in list entries in the compact form Prepr's API uses, about half
  the bytes per field, and remembers links it has rewritten, so repeated
  preview renders of the same content skip the decoding.

## 1.0.0-rc.4

### Changed

- Next.js live preview: `PreprRefresh` sends the next unsaved change as soon
  as the previous re-render has answered, instead of a second later, so typing
  shows up sooner on routes that render slowly.

## 1.0.0-rc.3

### Added

- `createPreprIds({ optionalInTypes: true })` types the added `_id` as optional, so
  test fixtures and mocks written against the generated types keep compiling.

### Changed

- `preprIds` no longer adds `_id` next to a fragment spread on the same type;
  the fragment selects it. With fragment masking, `makeFragmentData` alone
  builds the parent again. Code that read `_id` on such a level selects it in
  the query.

### Documentation

- Live preview: hand-written test data with `preprIds`, several queries on
  one page, and `normalizeQuery` making a Next.js route dynamic in preview.
- Troubleshooting: clean invisible characters with `stegaClean`, after
  `normalizeQuery`.
- Astro: the live preview snippet defines the preview flag it uses.

## 1.0.0-rc.2

### Documentation

- The README and the guides link to each other with relative paths instead of
  full GitHub URLs.

## 1.0.0-rc.1

First release candidate of 1.0.0. **No breaking changes since 0.4.3**: every
export, option, cookie, header and `data-prepr-*` attribute keeps its name and
behaviour, so upgrading is a version bump.

```bash
npm install @preprio/toolkit@rc
```

### Added

- **Live preview.** The page shows what an editor types in Prepr before they
  save.
  - Next.js: `normalizeQuery` for server components, plus `PreprRefresh`,
    `useLive` and `initLivePreview` from the new `@preprio/toolkit/nextjs/live`.
  - Astro: `normalizeQuery` from `@preprio/toolkit/astro`.
  - SvelteKit: `normalizedQuery` from the new `@preprio/toolkit/sveltekit/live`.
  - Nuxt: `useNormalizedQuery` from the new `@preprio/toolkit/nuxt/live`.
  - Any other stack: `normalizeQuery`, `readLiveLogFromRequest` and
    `startHtmlLivePreview` from the core.
- **`@preprio/toolkit/codegen`.** The `preprIds` document transform selects
  `_id` wherever the schema has one, which live preview and click-to-edit match
  on. `createPreprIds` and `addPreprIds` cover custom setups.
- **Visual editor inside the Prepr editor.** Outlines and labels in the
  editor's language, images click-to-edit, scroll to the field selected in the
  editor, list-item precision, linked items told apart from unrelated content,
  and a prompt before the preview navigates away from the open item.
- `previewAttrs` and `stegaTarget` make values without an edit link
  click-to-edit. `annotateEditLinks` adds list entry ids to edit links.
- New markup attributes: `data-prepr-entry-id`, `data-prepr-reference` and
  `data-prepr-other-item`; `data-prepr-edit-target` accepts a field hint.
- Options: `strictMode` for preview tokens in GraphQL strict mode, and
  `allowedEditorOrigins: ['*']` for development.
- `operationName` on `useNormalizedQuery` and `normalizedQuery`, for query
  documents that hold several operations.
- `navigation` prop on the Nuxt and SvelteKit `PreprToolbar`, to route segment
  and variant changes through the app's router.
- `extractAccessToken`, `validatePreprToken` and `PreprError` are exported
  from `@preprio/toolkit/astro`, as from the other framework entry points.
- Exported types that public signatures already referenced: `Locale`,
  `EditorHandshake`, `EditorReference`, `EditorAsset`, `ScrollToFieldMessage`,
  `LiveEditTarget`, `LiveValue`, `LiveListEntry`, `LiveObject`, `LiveScalar`.

### Fixed

- Live preview in Nuxt and SvelteKit now shares the editor origin and the
  `debug` flag with the toolbar. Each entry point is bundled separately and
  kept its own copy of that state.
- The toolbar's `strictMode` option applies to live preview in every
  framework, not only Astro.
- CommonJS consumers resolve the `.d.cts` type declarations.
- The middleware issues a visitor id on Node 18, where `crypto.randomUUID` is
  not a global.
- `readLiveLogFromRequest` accepts live re-renders behind a proxy that
  terminates TLS, by honouring `x-forwarded-proto`.
- `stegaTarget` and the browser cookie reader no longer throw on a malformed
  percent-encoding.
- The "All other users" segment is translated.
- A rescan scheduled by the stega scanner no longer runs after edit mode
  stops, and a toolbar element that is detached and attached again follows its
  store.
- The toolbar no longer makes iOS Safari zoom in when the segment dropdown
  opens.

### Security

- Editor messages are accepted only from the window that frames the page, not
  from any window on an allowed origin.

### Deprecated

- The `PreprEnvironment` and `PreprHeaderName` types. The toolkit never used
  them; they stay exported until the next major version.

### Documentation

- The README is now an overview with a step-by-step live preview setup. The
  per-framework guides, configuration, API reference, visual editing and
  troubleshooting moved to
  [`packages/toolkit/docs`](https://github.com/preprio/prepr-toolkit/tree/main/packages/toolkit/docs).
